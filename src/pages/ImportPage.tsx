import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Dexie from "dexie";
import { db } from "../app/db/db";
import { useAuthStore } from "../app/stores/authStore";
import { encryptText } from "../app/crypto/crypto";
import { importInter, type ImportResult as InterImportResult } from "../app/importers/inter";
import { importMercadoPago, type ImportResult as MpImportResult } from "../app/importers/mercadoPago";
import type { Transaction } from "../app/types/finance";
import { applyRulesToImported } from "../app/importers/applyRules";

type PreviewRow = {
  uid: string;
  date: string;
  amount: number;
  description: string;
};

type ImportKind = "inter" | "mp";
type ImportResult = InterImportResult | MpImportResult;

function toISOFromBR(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split("/");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseInterPeriodFromHeader(raw: string): { start: string; end: string } | null {
  // exemplo real: "Período ;20/11/2025 a 20/12/2025"
  const m = raw.match(/Período\s*;(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!m) return null;
  return { start: toISOFromBR(m[1]), end: toISOFromBR(m[2]) };
}

function minMaxISO(dates: string[]): { start: string; end: string } | null {
  if (!dates.length) return null;
  let min = dates[0];
  let max = dates[0];
  for (const d of dates) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { start: min, end: max };
}

export default function ImportPage() {
  const nav = useNavigate();
  const key = useAuthStore((s): CryptoKey | null => s.key);

  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileType, setFileType] = useState<ImportKind | null>(null);
  const [rawText, setRawText] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const [range, setRange] = useState<{ start: string; end: string } | null>(null);

  async function handleFile(file: File) {
    setStatus(null);

    const text = await file.text();
    setRawText(text);

    let result: ImportResult;

    if (text.includes("Data Lançamento")) {
      result = await importInter(text, "inter");
      setFileType("inter");
    } else if (text.includes("RELEASE_DATE")) {
      result = await importMercadoPago(text, "mercado_pago");
      setFileType("mp");
    } else {
      setFileType(null);
      setPreview([]);
      setRange(null);
      setStatus("Formato não reconhecido. Envie um CSV do Inter ou Mercado Pago.");
      return;
    }

    // aplica regras antes (pra quando você for ver no dashboard/transações já estar categorizado)
    await applyRulesToImported(result.items, result.descriptionsByUid);

    // ✅ prioridade: range declarado no cabeçalho do Inter; fallback: min/max das linhas
    const fromHeader = text.includes("Período") ? parseInterPeriodFromHeader(text) : null;
    const fromRows = minMaxISO(result.items.map((x) => x.date));
    setRange(fromHeader ?? fromRows);

    const rows: PreviewRow[] = result.items.slice(0, 8).map((t) => ({
      uid: t.uid,
      date: t.date,
      amount: t.amount,
      description: result.descriptionsByUid[t.uid] ?? "",
    }));

    setPreview(rows);
  }

  async function handleImport() {
    if (!key) {
      setStatus("Você precisa estar logado para importar.");
      return;
    }
    if (!fileType) {
      setStatus("Selecione um arquivo primeiro.");
      return;
    }
    if (!rawText.trim()) {
      setStatus("Arquivo vazio.");
      return;
    }

    setStatus("Importando...");

    let result: ImportResult;
    if (fileType === "inter") result = await importInter(rawText, "inter");
    else result = await importMercadoPago(rawText, "mercado_pago");

    await applyRulesToImported(result.items, result.descriptionsByUid);

    let inserted = 0;
    let duplicated = 0;

    for (const t of result.items) {
      const plain = result.descriptionsByUid[t.uid] ?? "";
      const descriptionEnc = await encryptText(plain, key);

      const row: Transaction = {
        ...t,
        descriptionEnc,
      };

      try {
        await db.transactions.add(row);
        inserted++;
      } catch (e) {
        if (e instanceof Dexie.ConstraintError) {
          duplicated++;
          continue;
        }
        throw e;
      }
    }

    setStatus(`Importação concluída. Inseridos: ${inserted}. Duplicados ignorados: ${duplicated}.`);

    // ✅ range final (de novo, prioriza cabeçalho do Inter)
    const fromHeader = rawText.includes("Período") ? parseInterPeriodFromHeader(rawText) : null;
    const fromRows = minMaxISO(result.items.map((x) => x.date));
    const r = fromHeader ?? fromRows;
    setRange(r);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Importar CSV</h1>

      <input
        type="file"
        accept=".csv"
        className="mt-4"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {status && <div className="mt-4 text-sm text-black/70">{status}</div>}

      {range && (
        <div className="mt-3 text-sm text-black/70">
          Range do extrato: <b>{range.start}</b> até <b>{range.end}</b>
          <button
            className="ml-3 text-sm underline"
            onClick={() => nav(`/transactions?start=${range.start}&end=${range.end}`)}
          >
            Ver transações desse range
          </button>
        </div>
      )}

      {preview.length > 0 && (
        <div className="mt-6 border rounded-xl p-4 bg-white">
          <div className="font-medium mb-3">Preview</div>

          <div className="space-y-2">
            {preview.map((p) => (
              <div key={p.uid} className="text-sm flex gap-3">
                <div className="w-28 text-black/70">{p.date}</div>
                <div className="w-28 tabular-nums">{p.amount}</div>
                <div className="flex-1 text-black/80 truncate">{p.description}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => void handleImport()}
            className="mt-4 bg-black text-white px-4 py-2 rounded-lg"
          >
            Confirmar Importação
          </button>
        </div>
      )}
    </div>
  );
}

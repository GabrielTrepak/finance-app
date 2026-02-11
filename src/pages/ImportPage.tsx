import { useState } from "react";
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

export default function ImportPage() {
  const key = useAuthStore((s) => s.key);

  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileType, setFileType] = useState<ImportKind | null>(null);
  const [rawText, setRawText] = useState("");
  const [status, setStatus] = useState<string | null>(null);

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
      setStatus("Formato não reconhecido. Envie um CSV do Inter ou Mercado Pago.");
      return;
    }

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
    if (fileType === "inter") {
      result = await importInter(rawText, "inter");
    } else {
      result = await importMercadoPago(rawText, "mercado_pago");
    }

    // ✅ aplica regras ANTES de salvar
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
        // &uid é unique no schema -> se já existir, lança ConstraintError
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

    setStatus(
      `Importação concluída. Inseridos: ${inserted}. Duplicados ignorados: ${duplicated}.`
    );
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

      {preview.length > 0 && (
        <div className="mt-6 border rounded-xl p-4 bg-white">
          <div className="font-medium mb-3">Preview</div>

          <div className="space-y-2">
            {preview.map((p) => (
              <div key={p.uid} className="text-sm flex gap-3">
                <div className="w-28 text-black/70">{p.date}</div>
                <div className="w-28 tabular-nums">{p.amount}</div>
                <div className="flex-1 text-black/80 truncate">
                  {p.description}
                </div>
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

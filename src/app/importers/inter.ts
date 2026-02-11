import Papa from "papaparse";
import { sha1Hex } from "../utils/hash";
import type { AccountKey, Transaction } from "../types/finance";

type InterRow = {
  "Data Lançamento": string;
  "Histórico": string;
  "Descrição": string;
  "Valor": string;
  "Saldo": string;
};

function parseBRL(v: string): number {
  // "-1.234,56" -> -1234.56
  const s = v.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Número inválido: ${v}`);
  return n;
}

function toISO(ddmmyyyy: string) {
  const [dd, mm, yyyy] = ddmmyyyy.trim().split("/");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

export type ImportResult = {
  items: Omit<Transaction, "id" | "descriptionEnc">[];
  descriptionsByUid: Record<string, string>;
};

export async function importInter(raw: string, account: AccountKey): Promise<ImportResult> {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith("Data Lançamento;"));
  if (start < 0) throw new Error("Cabeçalho do Inter não encontrado (Data Lançamento;...).");

  const csv = lines.slice(start).join("\n");

  const parsed = Papa.parse<InterRow>(csv, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors[0]?.message ?? "Erro ao ler CSV do Inter.");
  }

  const items: Omit<Transaction, "id" | "descriptionEnc">[] = [];
  const descriptionsByUid: Record<string, string> = {};

  for (const r of parsed.data) {
    if (!r?.["Data Lançamento"] || !r?.["Valor"]) continue;

    const date = toISO(r["Data Lançamento"]);
    const amount = parseBRL(r["Valor"]);
    const direction = amount < 0 ? "expense" : "income";

    const description = `${(r["Histórico"] ?? "").trim()} - ${(r["Descrição"] ?? "").trim()}`.trim();

    const uid = (await sha1Hex(
      `inter|${r["Data Lançamento"]}|${r["Histórico"]}|${r["Descrição"]}|${r["Valor"]}|${r["Saldo"]}`
    )).slice(0, 16);

    descriptionsByUid[uid] = description;

    items.push({
      uid,
      date,
      amount,
      direction,
      categoryId: null,
      account,
      source: "import",
      rawBalance: r["Saldo"] ? parseBRL(r["Saldo"]) : undefined,
      createdAt: Date.now(),
    });
  }

  return { items, descriptionsByUid };
}

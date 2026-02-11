import Papa from "papaparse";
import { sha1Hex } from "../utils/hash";
import type { AccountKey, Transaction } from "../types/finance";

type MpRow = {
  RELEASE_DATE: string;
  TRANSACTION_TYPE: string;
  REFERENCE_ID: string;
  TRANSACTION_NET_AMOUNT: string;
  PARTIAL_BALANCE: string;
};

function parseBRL(v: string): number {
  // "-1.234,56" -> -1234.56  (se vier com ponto e vírgula)
  const s = v.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Número inválido: ${v}`);
  return n;
}

function toISO(ddmmyyyy: string) {
  // "12-11-2025" -> "2025-11-12"
  const [dd, mm, yyyy] = ddmmyyyy.trim().split("-");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

export type ImportResult = {
  items: Omit<Transaction, "id" | "descriptionEnc">[];
  descriptionsByUid: Record<string, string>;
};

export async function importMercadoPago(
  raw: string,
  account: AccountKey
): Promise<ImportResult> {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith("RELEASE_DATE;"));
  if (start < 0) throw new Error("Cabeçalho do Mercado Pago não encontrado (RELEASE_DATE;...).");

  const csv = lines.slice(start).join("\n");

  const parsed = Papa.parse<MpRow>(csv, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors[0]?.message ?? "Erro ao ler CSV do Mercado Pago.");
  }

  const items: Omit<Transaction, "id" | "descriptionEnc">[] = [];
  const descriptionsByUid: Record<string, string> = {};

  for (const r of parsed.data) {
    if (!r?.RELEASE_DATE || !r?.TRANSACTION_NET_AMOUNT) continue;

    const date = toISO(r.RELEASE_DATE);
    const amount = parseBRL(r.TRANSACTION_NET_AMOUNT);
    const direction = amount < 0 ? "expense" : "income";

    const referenceId = (r.REFERENCE_ID ?? "").trim();
    const description = (r.TRANSACTION_TYPE ?? "").trim();

    const uid = (await sha1Hex(
      `mp|${referenceId}|${r.RELEASE_DATE}|${r.TRANSACTION_NET_AMOUNT}`
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
      referenceId: referenceId || undefined,
      rawBalance: r.PARTIAL_BALANCE ? parseBRL(r.PARTIAL_BALANCE) : undefined,
      createdAt: Date.now(),
    });
  }

  return { items, descriptionsByUid };
}

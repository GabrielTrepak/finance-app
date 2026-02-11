import { db } from "../db/db";
import type { Transaction } from "../types/finance";

export async function applyRulesToImported(
  items: Array<Omit<Transaction, "id" | "descriptionEnc">>,
  descriptionsByUid: Record<string, string>
): Promise<void> {
  const active = (await db.rules.toArray())
    .filter((r) => r.enabled)
    .sort((a, b) => b.priority - a.priority);

  for (const t of items) {
    const desc = (descriptionsByUid[t.uid] ?? "").toLowerCase();

    const matched = active.find((r) =>
      desc.includes(r.pattern.toLowerCase())
    );

    if (matched) t.categoryId = matched.categoryId;
  }
}

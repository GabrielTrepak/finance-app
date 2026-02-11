import { db } from "../db/db";
import { monthStartEnd } from "../utils/month";
import { decryptText } from "../crypto/crypto";
import type { Rule } from "../types/finance";

export async function reapplyRulesForMonth(
  monthKey: string,
  cryptoKey: CryptoKey
): Promise<{ updated: number; scanned: number }> {
  const { start, end } = monthStartEnd(monthKey);

  const [txs, rules] = await Promise.all([
    db.transactions.where("date").between(start, end, true, false).toArray(),
    db.rules.toArray(),
  ]);

  const active = rules
    .filter((r) => r.enabled)
    .sort((a, b) => b.priority - a.priority);

  let updated = 0;
  let scanned = 0;

  // Só mexe nas sem categoria
  const targets = txs.filter((t) => !t.categoryId);

  for (const t of targets) {
    scanned++;

    let plain = "";
    try {
      plain = (await decryptText(t.descriptionEnc, cryptoKey)).toLowerCase();
    } catch {
      // se não der pra decrypt, não mexe
      continue;
    }

    const matched = active.find((r: Rule) =>
      plain.includes(r.pattern.toLowerCase())
    );

    if (matched) {
      await db.transactions.update(t.id!, { categoryId: matched.categoryId });
      updated++;
    }
  }

  return { updated, scanned };
}

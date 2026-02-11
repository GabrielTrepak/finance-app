import { db } from "./db";
import type { Transaction } from "../types/finance";

export async function listTransactionsByDateRange(start: string, end: string): Promise<Transaction[]> {
  // date está como YYYY-MM-DD, então range funciona lexicograficamente
  return db.transactions
    .where("date")
    .between(start, end, true, false)
    .reverse()
    .sortBy("date");
}

import Dexie from "dexie";
import type { Table } from "dexie";
import type { Category, Transaction } from "../types/finance";
import type { MonthConfig } from "../types/finance";
import type { Rule } from "../types/finance";

export type AppMeta = {
  key: "crypto_salt" | "has_account";
  value: string;
};

export class FinanceDB extends Dexie {
  meta!: Table<AppMeta, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, number>;
  monthConfigs!: Table<MonthConfig, string>;
  rules!: Table<Rule, string>;

  constructor() {
    super("finance_app_db");
    this.version(1).stores({
      meta: "key",
      categories: "id, kind",
      transactions: "++id, &uid, date, direction, categoryId, account, source, createdAt",
      monthConfigs: "month",
      rules: "id, categoryId, priority, enabled",
    });
  }
}

export const db = new FinanceDB();

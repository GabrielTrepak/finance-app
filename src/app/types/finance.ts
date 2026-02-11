export type AccountKey = "inter" | "mercado_pago" | "inter_empresas";

export type Direction = "income" | "expense";

export type Category = {
  id: string;
  name: string;
  kind: Direction;
};

export type Transaction = {
  id?: number;

  uid: string;              // deduplicação (unique)
  date: string;             // YYYY-MM-DD (em claro para filtro)
  amount: number;           // em claro para somatórios
  direction: Direction;     // em claro
  categoryId: string | null;
  account: AccountKey;
  source: "manual" | "import";

  // sensível: criptografado
  descriptionEnc: string;

  // extras
  rawBalance?: number;
  referenceId?: string;
  createdAt: number;
};

export type MonthConfig = {
  month: string;              // YYYY-MM
  savingGoal: number;         // meta de economia
  budgets?: Record<string, number>; // limites por categoria (expense)
};


export type Rule = {
  id: string;           // uuid/string
  pattern: string;      // texto (match case-insensitive)
  categoryId: string;
  priority: number;     // maior ganha
  enabled: boolean;
};
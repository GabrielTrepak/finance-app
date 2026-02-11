import { db } from "./db";
import type { Category } from "../types/finance";

export async function ensureDefaultCategories() {
  const count = await db.categories.count();
  if (count > 0) return;

  const cats: Category[] = [
    { id: "alimentacao", name: "Alimentação", kind: "expense" },
    { id: "transporte", name: "Transporte", kind: "expense" },
    { id: "assinaturas", name: "Assinaturas", kind: "expense" },
    { id: "mercado", name: "Mercado", kind: "expense" },
    { id: "moradia", name: "Moradia", kind: "expense" },
    { id: "saude", name: "Saúde", kind: "expense" },
    { id: "lazer", name: "Lazer", kind: "expense" },
    { id: "salario", name: "Salário", kind: "income" },
    { id: "pix_recebido", name: "Pix Recebido", kind: "income" },
  ];

  await db.categories.bulkAdd(cats);
}

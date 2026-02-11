import { useEffect, useMemo, useState } from "react";
import { db } from "../app/db/db";
import { currentMonthKey, monthStartEnd } from "../app/utils/month";
import type { Transaction, MonthConfig, Category } from "../app/types/finance";
import { useAuthStore } from "../app/stores/authStore";
import { reapplyRulesForMonth } from "../app/importers/reapplyRulesForMonth";

function formatMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoneyInput(v: string): number {
  const x = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function monthDayProgress(monthKey: string): { day: number; days: number; ratio: number } {
  const [y, m] = monthKey.split("-").map(Number);
  const now = new Date();
  const days = new Date(y, m, 0).getDate();

  // se o mês selecionado não é o mês atual, assume ratio=1 (mês completo) para não “viajar” na projeção
  const isSameMonth = now.getFullYear() === y && now.getMonth() + 1 === m;
  if (!isSameMonth) return { day: days, days, ratio: 1 };

  const day = Math.min(days, now.getDate());
  const ratio = Math.max(1 / days, day / days);
  return { day, days, ratio };
}

export default function DashboardPage() {
  const key = useAuthStore((s) => s.key);

  const [month, setMonth] = useState<string>(currentMonthKey());
  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [savingGoal, setSavingGoal] = useState<number>(0);
  const [savingGoalInput, setSavingGoalInput] = useState<string>("0");

  const [reapplyMsg, setReapplyMsg] = useState<string | null>(null);

  // budgets: estado editável (inputs)
  const [budgetsInput, setBudgetsInput] = useState<Record<string, string>>({});
  const [budgetsSaved, setBudgetsSaved] = useState<Record<string, number>>({});
  const [budgetMsg, setBudgetMsg] = useState<string | null>(null);

  const categoryMap = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === "expense"),
    [categories]
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const t of rows) {
      if (t.direction === "income") income += Math.abs(t.amount);
      else expense += Math.abs(t.amount);
    }

    const net = income - expense;
    const remainingToSpend = net - savingGoal;

    return { income, expense, net, remainingToSpend };
  }, [rows, savingGoal]);

  const expensesByCategory = useMemo(() => {
    const acc = new Map<string, number>();

    for (const t of rows) {
      if (t.direction !== "expense") continue;
      const k = t.categoryId ?? "sem_categoria";
      acc.set(k, (acc.get(k) ?? 0) + Math.abs(t.amount));
    }

    const list = [...acc.entries()].map(([categoryId, total]) => ({
      categoryId,
      name:
        categoryId === "sem_categoria"
          ? "Sem categoria"
          : categoryMap.get(categoryId)?.name ?? categoryId,
      total,
    }));

    list.sort((a, b) => b.total - a.total);

    const totalExpense = totals.expense || 1;
    return list.slice(0, 8).map((x) => ({
      ...x,
      pct: (x.total / totalExpense) * 100,
    }));
  }, [rows, categoryMap, totals.expense]);

  const budgetRows = useMemo(() => {
    // soma despesas por categoryId (apenas categorias expense reais)
    const spentMap = new Map<string, number>();
    for (const t of rows) {
      if (t.direction !== "expense") continue;
      if (!t.categoryId) continue;
      spentMap.set(t.categoryId, (spentMap.get(t.categoryId) ?? 0) + Math.abs(t.amount));
    }

    const out = expenseCategories.map((c) => {
      const spent = spentMap.get(c.id) ?? 0;
      const limit = budgetsSaved[c.id] ?? 0;
      const remaining = limit - spent;
      const pct = limit > 0 ? (spent / limit) * 100 : 0;

      return {
        categoryId: c.id,
        name: c.name,
        spent,
        limit,
        remaining,
        pct,
        input: budgetsInput[c.id] ?? String(limit || ""),
      };
    });

    out.sort((a, b) => b.spent - a.spent);
    return out;
  }, [rows, expenseCategories, budgetsSaved, budgetsInput]);

  const projection = useMemo(() => {
    const prog = monthDayProgress(month); // ratio = dia/dias
    const scale = 1 / prog.ratio; // projeta "se continuar no mesmo ritmo"

    const projectedTotalExpense = totals.expense * scale;

    // por categoria: só onde tem limite > 0 (faz sentido alertar)
    const byCat = budgetRows
      .filter((r) => r.limit > 0)
      .map((r) => {
        const projected = r.spent * scale;
        const willOver = projected > r.limit;
        const pctNow = (r.spent / r.limit) * 100;
        const pctProjected = (projected / r.limit) * 100;

        return {
          categoryId: r.categoryId,
          name: r.name,
          spent: r.spent,
          limit: r.limit,
          remaining: r.remaining,
          projected,
          willOver,
          pctNow,
          pctProjected,
        };
      })
      .sort((a, b) => b.pctProjected - a.pctProjected);

    return { ...prog, projectedTotalExpense, byCat };
  }, [month, totals.expense, budgetRows]);

  async function loadMonthData() {
    const { start, end } = monthStartEnd(month);

    const [tx, cfg, cats] = await Promise.all([
      db.transactions.where("date").between(start, end, true, false).toArray(),
      db.monthConfigs.get(month),
      db.categories.toArray(),
    ]);

    tx.sort((a, b) =>
      a.date === b.date ? (b.id ?? 0) - (a.id ?? 0) : b.date.localeCompare(a.date)
    );

    cats.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

    setRows(tx);
    setCategories(cats);

    const goal = cfg?.savingGoal ?? 0;
    setSavingGoal(goal);
    setSavingGoalInput(String(goal));

    const budgets = cfg?.budgets ?? {};
    setBudgetsSaved(budgets);

    const nextInputs: Record<string, string> = {};
    for (const [k, v] of Object.entries(budgets)) nextInputs[k] = String(v);
    setBudgetsInput(nextInputs);

    setBudgetMsg(null);
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        await loadMonthData();
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function saveGoal() {
    const goal = parseMoneyInput(savingGoalInput);

    const prev = await db.monthConfigs.get(month);
    const cfg: MonthConfig = {
      month,
      savingGoal: goal,
      budgets: prev?.budgets ?? budgetsSaved,
    };

    await db.monthConfigs.put(cfg);
    setSavingGoal(goal);
  }

  async function saveBudgets() {
    setBudgetMsg(null);

    const next: Record<string, number> = { ...budgetsSaved };
    for (const c of expenseCategories) {
      const raw = budgetsInput[c.id] ?? "";
      const value = raw.trim() ? parseMoneyInput(raw) : 0;

      if (value > 0) next[c.id] = value;
      else delete next[c.id];
    }

    const prev = await db.monthConfigs.get(month);
    const cfg: MonthConfig = {
      month,
      savingGoal: prev?.savingGoal ?? savingGoal,
      budgets: next,
    };

    await db.monthConfigs.put(cfg);
    setBudgetsSaved(next);
    setBudgetMsg("Budgets salvos.");
  }

  async function handleReapplyRules() {
    if (!key) return;

    setReapplyMsg("Reaplicando regras...");
    try {
      const { updated, scanned } = await reapplyRulesForMonth(month, key);
      setReapplyMsg(`Feito. Verificadas: ${scanned}. Atualizadas: ${updated}.`);
      await loadMonthData();
    } catch {
      setReapplyMsg("Falha ao reaplicar regras.");
    }
  }

  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <div className="text-sm text-black/60">Visão mensal + metas + categorias</div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-black/70">
            Mês
            <input
              className="ml-2 border rounded-lg px-3 py-2 text-sm"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-black/60">Receitas</div>
          <div className="text-lg font-semibold">{formatMoney(totals.income)}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-black/60">Despesas</div>
          <div className="text-lg font-semibold">{formatMoney(totals.expense)}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-black/60">Saldo do mês</div>
          <div className="text-lg font-semibold">{formatMoney(totals.net)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <div className="font-medium">Meta de economia</div>
          <div className="text-sm text-black/60 mt-1">
            Defina quanto você quer guardar neste mês.
          </div>

          <div className="mt-3 flex gap-2 items-center flex-wrap">
            <input
              className="border rounded-lg px-3 py-2 w-48"
              value={savingGoalInput}
              onChange={(e) => setSavingGoalInput(e.target.value)}
              inputMode="decimal"
              placeholder="Ex: 1000"
            />
            <button
              onClick={() => void saveGoal()}
              className="bg-black text-white px-4 py-2 rounded-lg"
            >
              Salvar
            </button>
          </div>

          <div className="mt-3 text-sm">
            Meta atual: <b>{formatMoney(savingGoal)}</b>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <div className="font-medium">Quanto ainda posso gastar?</div>
          <div className="text-sm text-black/60 mt-1">Saldo do mês − meta de economia.</div>

          <div className="mt-3 text-2xl font-semibold">
            <span className={totals.remainingToSpend < 0 ? "text-red-600" : "text-emerald-700"}>
              {formatMoney(totals.remainingToSpend)}
            </span>
          </div>

          <div className="mt-2 text-xs text-black/50">
            Se ficar negativo, você já “comeu” sua meta de economia.
          </div>
        </div>
      </div>

      <div className="mt-4 bg-white border rounded-xl p-4">
        <div className="font-medium">Gastos por categoria (Top)</div>
        <div className="text-sm text-black/60 mt-1">
          Baseado nas categorias aplicadas no import (regras) e ajustes manuais.
        </div>

        {expensesByCategory.length === 0 ? (
          <div className="mt-3 text-sm text-black/60">
            Sem despesas no mês, ou tudo está sem categoria. Crie regras em <b>Config</b>.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {expensesByCategory.map((c) => (
              <div key={c.categoryId} className="flex items-center gap-3">
                <div className="w-40 text-sm truncate">{c.name}</div>

                <div className="flex-1">
                  <div className="h-2 rounded bg-black/10 overflow-hidden">
                    <div className="h-2 bg-black" style={{ width: `${Math.min(100, c.pct)}%` }} />
                  </div>
                </div>

                <div className="w-32 text-right text-sm tabular-nums">
                  {formatMoney(c.total)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => void handleReapplyRules()}
            className="bg-black text-white px-4 py-2 rounded-lg disabled:opacity-50"
            disabled={!key}
          >
            Reaplicar regras (só sem categoria)
          </button>
          {reapplyMsg && <div className="text-sm text-black/70">{reapplyMsg}</div>}
        </div>
      </div>

      {/* Budgets */}
      <div className="mt-4 bg-white border rounded-xl p-4">
        <div className="font-medium">Orçamento por categoria (despesas)</div>
        <div className="text-sm text-black/60 mt-1">
          Defina limites por categoria para o mês selecionado.
        </div>

        {expenseCategories.length === 0 ? (
          <div className="mt-3 text-sm text-black/60">
            Nenhuma categoria de despesa cadastrada ainda. Vá em <b>Config</b>.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {budgetRows.map((r) => {
              const over = r.limit > 0 && r.spent > r.limit;
              const pct = r.limit > 0 ? Math.min(140, r.pct) : 0;

              return (
                <div key={r.categoryId} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4 sm:col-span-3 text-sm truncate">{r.name}</div>

                  <div className="col-span-4 sm:col-span-3">
                    <input
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      inputMode="decimal"
                      placeholder="Limite (ex: 800)"
                      value={budgetsInput[r.categoryId] ?? ""}
                      onChange={(e) =>
                        setBudgetsInput((prev) => ({
                          ...prev,
                          [r.categoryId]: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-3 text-sm tabular-nums text-right">
                    {formatMoney(r.spent)}
                    <span className="text-black/40"> / {formatMoney(r.limit || 0)}</span>
                  </div>

                  <div className="col-span-12 sm:col-span-3">
                    <div className="h-2 rounded bg-black/10 overflow-hidden">
                      <div
                        className={over ? "h-2 bg-red-600" : "h-2 bg-black"}
                        style={{ width: `${pct}%` }}
                        title={r.limit > 0 ? `${Math.round(r.pct)}%` : "Defina um limite"}
                      />
                    </div>
                    <div className={"mt-1 text-xs " + (over ? "text-red-600" : "text-black/50")}>
                      {r.limit > 0 ? `Restante: ${formatMoney(r.remaining)}` : "Sem limite"}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => void saveBudgets()}
                className="bg-black text-white px-4 py-2 rounded-lg"
              >
                Salvar budgets
              </button>
              {budgetMsg && <div className="text-sm text-black/70">{budgetMsg}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Alertas + Projeção */}
      <div className="mt-4 bg-white border rounded-xl p-4">
        <div className="font-medium">Alertas e projeção</div>
        <div className="text-sm text-black/60 mt-1">
          Projeção simples: gasto atual ÷ progresso do mês.
        </div>

        <div className="mt-3 text-sm text-black/70">
          Progresso do mês: <b>{projection.day}</b>/<b>{projection.days}</b> (~{Math.round(projection.ratio * 100)}%)
        </div>

        <div className="mt-2 text-sm">
          Projeção de despesas no fim do mês: <b>{formatMoney(projection.projectedTotalExpense)}</b>
        </div>

        {projection.byCat.length === 0 ? (
          <div className="mt-3 text-sm text-black/60">
            Defina budgets (limites) acima para gerar alertas por categoria.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {projection.byCat.slice(0, 8).map((c) => {
              const warn80 = c.pctNow >= 80 && c.pctNow < 100;
              const overNow = c.pctNow >= 100;
              const willOver = c.willOver;

              const badge =
                overNow ? "Estourou" : warn80 ? "Atenção (80%+)" : willOver ? "Vai estourar" : "OK";

              const badgeClass =
                overNow
                  ? "bg-red-100 text-red-700"
                  : warn80
                  ? "bg-amber-100 text-amber-800"
                  : willOver
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-700";

              return (
                <div key={c.categoryId} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-black/55">
                        Gasto: {formatMoney(c.spent)} • Limite: {formatMoney(c.limit)}
                      </div>
                    </div>

                    <div className={"text-xs px-2 py-1 rounded-full " + badgeClass}>{badge}</div>
                  </div>

                  <div className="mt-3">
                    <div className="h-2 rounded bg-black/10 overflow-hidden">
                      <div
                        className={overNow ? "h-2 bg-red-600" : warn80 || willOver ? "h-2 bg-amber-500" : "h-2 bg-black"}
                        style={{ width: `${Math.min(140, c.pctNow)}%` }}
                        title={`${Math.round(c.pctNow)}%`}
                      />
                    </div>
                    <div className="mt-2 text-xs text-black/60">
                      Projeção fim do mês: <b>{formatMoney(c.projected)}</b> (~{Math.round(c.pctProjected)}% do limite)
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="pt-1 text-xs text-black/50">
              Dica: se a projeção está estourando, ou ajusta o budget, ou corta gastos nessa categoria.
            </div>
          </div>
        )}
      </div>

      {loading && <div className="mt-4 text-sm text-black/60">Carregando...</div>}
    </div>
  );
}

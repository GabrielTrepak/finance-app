import { useEffect, useMemo, useState } from "react";
import { db } from "../app/db/db";
import { currentMonthKey, monthStartEnd } from "../app/utils/month";
import type { Transaction, MonthConfig } from "../app/types/finance";

function formatMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DashboardPage() {
  const [month, setMonth] = useState<string>(currentMonthKey());
  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState<Transaction[]>([]);
  const [savingGoal, setSavingGoal] = useState<number>(0);
  const [savingGoalInput, setSavingGoalInput] = useState<string>("0");

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

  useEffect(() => {
    const { start, end } = monthStartEnd(month);

    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const tx = await db.transactions
          .where("date")
          .between(start, end, true, false)
          .toArray();

        tx.sort((a, b) =>
          a.date === b.date ? (b.id ?? 0) - (a.id ?? 0) : b.date.localeCompare(a.date)
        );

        const cfg = await db.monthConfigs.get(month);

        if (!alive) return;
        setRows(tx);

        const goal = cfg?.savingGoal ?? 0;
        setSavingGoal(goal);
        setSavingGoalInput(String(goal));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [month]);

  async function saveGoal() {
    const parsed = Number(savingGoalInput.replace(/\./g, "").replace(",", "."));
    const goal = Number.isFinite(parsed) ? parsed : 0;

    const cfg: MonthConfig = { month, savingGoal: goal };
    await db.monthConfigs.put(cfg);

    setSavingGoal(goal);
  }

  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <div className="text-sm text-black/60">Visão mensal + meta de economia</div>
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

          <div className="mt-3 flex gap-2 items-center">
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
          <div className="text-sm text-black/60 mt-1">
            Saldo do mês − meta de economia.
          </div>

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

      {loading && <div className="mt-4 text-sm text-black/60">Carregando...</div>}
    </div>
  );
}

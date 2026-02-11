import { useEffect, useMemo, useState } from "react";
import { db } from "../app/db/db";
import { useAuthStore } from "../app/stores/authStore";
import { decryptText } from "../app/crypto/crypto";
import type { Transaction } from "../app/types/finance";
import { currentMonthKey, monthStartEnd } from "../app/utils/month";

type TxView = {
  id: number;
  uid: string;
  date: string;
  amount: number;
  direction: "income" | "expense";
  account: string;
  source: string;
  description: string;
};

function formatMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function TransactionsPage() {
  const key = useAuthStore((s) => s.key);

  const [month, setMonth] = useState<string>(currentMonthKey());
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TxView[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const t of items) {
      if (t.direction === "income") income += Math.abs(t.amount);
      else expense += Math.abs(t.amount);
    }

    const net = income - expense;
    return { income, expense, net };
  }, [items]);

  useEffect(() => {
    if (!key) return;
    const cryptoKey = key; // fixa como CryptoKey (não-null) dentro do async

    const { start, end } = monthStartEnd(month);

    let alive = true;

    async function load() {
      setErr(null);
      setLoading(true);

      try {
        const rows: Transaction[] = await db.transactions
          .where("date")
          .between(start, end, true, false)
          .toArray();

        // Ordena desc por data e por id
        rows.sort((a, b) =>
          a.date === b.date
            ? (b.id ?? 0) - (a.id ?? 0)
            : b.date.localeCompare(a.date)
        );

        const view: TxView[] = [];

        for (const r of rows) {
          if (!r.id) continue;

          let description = "";
          try {
            description = await decryptText(r.descriptionEnc, cryptoKey);
          } catch {
            description = "(não foi possível descriptografar)";
          }

          view.push({
            id: r.id,
            uid: r.uid,
            date: r.date,
            amount: r.amount,
            direction: r.direction,
            account: r.account,
            source: r.source,
            description,
          });
        }

        if (alive) setItems(view);
      } catch {
        if (alive) setErr("Falha ao carregar transações.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, [month, key]);

  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Transações</h1>
          <div className="text-sm text-black/60">
            Listagem por mês (dados locais)
          </div>
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
          <div className="text-lg font-semibold">
            {formatMoney(totals.income)}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-black/60">Despesas</div>
          <div className="text-lg font-semibold">
            {formatMoney(totals.expense)}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-black/60">Saldo (mês)</div>
          <div className="text-lg font-semibold">{formatMoney(totals.net)}</div>
        </div>
      </div>

      {err && <div className="mt-4 text-sm text-red-600">{err}</div>}
      {loading && (
        <div className="mt-4 text-sm text-black/60">Carregando...</div>
      )}

      {!loading && items.length === 0 && (
        <div className="mt-6 text-sm text-black/60">
          Nenhuma transação nesse mês. Vá em <b>Importar</b> e suba um CSV.
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-6 bg-white border rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b text-xs text-black/60">
            <div className="col-span-2">Data</div>
            <div className="col-span-6">Descrição</div>
            <div className="col-span-2">Conta</div>
            <div className="col-span-2 text-right">Valor</div>
          </div>

          {items.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-12 gap-2 px-4 py-3 border-b last:border-b-0 text-sm"
            >
              <div className="col-span-2 text-black/70">{t.date}</div>
              <div className="col-span-6 truncate">{t.description}</div>
              <div className="col-span-2 text-black/60">{t.account}</div>
              <div className="col-span-2 text-right tabular-nums">
                <span
                  className={
                    t.direction === "expense" ? "text-red-600" : "text-emerald-700"
                  }
                >
                  {formatMoney(t.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

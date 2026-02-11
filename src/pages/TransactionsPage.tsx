import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../app/db/db";
import { useAuthStore } from "../app/stores/authStore";
import { decryptText } from "../app/crypto/crypto";
import type { Category } from "../app/types/finance";
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
  categoryId: string | null;
};

function formatMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function defaultRange(): { start: string; end: string } {
  const mk = currentMonthKey();
  const { start, end } = monthStartEnd(mk);
  return { start, end };
}

export default function TransactionsPage() {
  const key = useAuthStore((s): CryptoKey | null => s.key);
  const [sp, setSp] = useSearchParams();

  const initial = useMemo(() => {
    const s = sp.get("start");
    const e = sp.get("end");
    if (s && e) return { start: s, end: e };
    return defaultRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [start, setStart] = useState<string>(initial.start);
  const [end, setEnd] = useState<string>(initial.end);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TxView[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const catMap = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of cats) m.set(c.id, c);
    return m;
  }, [cats]);

  const expenseCats = useMemo(() => cats.filter((c) => c.kind === "expense"), [cats]);
  const incomeCats = useMemo(() => cats.filter((c) => c.kind === "income"), [cats]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of items) {
      if (t.direction === "income") income += Math.abs(t.amount);
      else expense += Math.abs(t.amount);
    }
    return { income, expense, net: income - expense };
  }, [items]);

  async function loadRange(cryptoKey: CryptoKey, s: string, e: string) {
    const [rows, categories] = await Promise.all([
      db.transactions.where("date").between(s, e, true, true).toArray(),
      db.categories.toArray(),
    ]);

    rows.sort((a, b) =>
      a.date === b.date ? (b.id ?? 0) - (a.id ?? 0) : b.date.localeCompare(a.date)
    );

    categories.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    setCats(categories);

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
        categoryId: r.categoryId,
      });
    }

    setItems(view);
  }

  useEffect(() => {
    if (key === null) return;
    const cryptoKey: CryptoKey = key;

    let alive = true;

    async function run() {
      setErr(null);
      setLoading(true);
      try {
        await loadRange(cryptoKey, start, end);
        if (alive) setSp({ start, end }, { replace: true });
      } catch {
        if (alive) setErr("Falha ao carregar transações.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [key, start, end, setSp]);

  async function updateCategory(txId: number, categoryId: string | null) {
    if (key === null) return;
    const cryptoKey: CryptoKey = key;

    await db.transactions.update(txId, { categoryId });
    await loadRange(cryptoKey, start, end);
  }

  function categoryLabel(t: TxView): string {
    if (!t.categoryId) return "Sem categoria";
    return catMap.get(t.categoryId)?.name ?? t.categoryId;
  }

  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Transações</h1>
          <div className="text-sm text-black/60">Filtro por período (início/fim)</div>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <label className="text-sm text-black/70">
            Início
            <input
              className="ml-2 border rounded-lg px-3 py-2 text-sm"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>

          <label className="text-sm text-black/70">
            Fim
            <input
              className="ml-2 border rounded-lg px-3 py-2 text-sm"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
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
          <div className="text-xs text-black/60">Saldo</div>
          <div className="text-lg font-semibold">{formatMoney(totals.net)}</div>
        </div>
      </div>

      {err && <div className="mt-4 text-sm text-red-600">{err}</div>}
      {loading && <div className="mt-4 text-sm text-black/60">Carregando...</div>}

      {!loading && items.length === 0 && (
        <div className="mt-6 text-sm text-black/60">Nenhuma transação nesse período.</div>
      )}

      {items.length > 0 && (
        <div className="mt-6 bg-white border rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b text-xs text-black/60">
            <div className="col-span-2">Data</div>
            <div className="col-span-4">Descrição</div>
            <div className="col-span-2">Categoria</div>
            <div className="col-span-2">Conta</div>
            <div className="col-span-2 text-right">Valor</div>
          </div>

          {items.map((t) => {
            const options = t.direction === "expense" ? expenseCats : incomeCats;

            return (
              <div
                key={t.id}
                className="grid grid-cols-12 gap-2 px-4 py-3 border-b last:border-b-0 text-sm items-center"
              >
                <div className="col-span-2 text-black/70">{t.date}</div>

                <div className="col-span-4 min-w-0">
                  <div className="truncate">{t.description}</div>
                  <div className="text-xs text-black/45">
                    {t.source} • {t.uid}
                  </div>
                </div>

                <div className="col-span-2">
                  <select
                    className="w-full border rounded-lg px-2 py-2 text-sm bg-white"
                    value={t.categoryId ?? ""}
                    onChange={(e) =>
                      void updateCategory(t.id, e.target.value ? e.target.value : null)
                    }
                    title={categoryLabel(t)}
                  >
                    <option value="">Sem categoria</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2 text-black/60">{t.account}</div>

                <div className="col-span-2 text-right tabular-nums">
                  <span className={t.direction === "expense" ? "text-red-600" : "text-emerald-700"}>
                    {formatMoney(t.amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

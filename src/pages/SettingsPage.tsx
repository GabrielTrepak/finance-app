import { useEffect, useMemo, useState } from "react";
import { db } from "../app/db/db";
import type { Category, Direction, Rule } from "../app/types/finance";

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function newId(): string {
  // browser moderno
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // fallback bem simples
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function SettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // categoria form
  const [catName, setCatName] = useState("");
  const [catKind, setCatKind] = useState<Direction>("expense");

  // regra form
  const [rulePattern, setRulePattern] = useState("");
  const [ruleCategoryId, setRuleCategoryId] = useState<string>("");
  const [rulePriority, setRulePriority] = useState<number>(100);
  const [ruleEnabled, setRuleEnabled] = useState(true);

  const categoryMap = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg(null);

      const [cats, r] = await Promise.all([
        db.categories.toArray(),
        db.rules.toArray(),
      ]);

      cats.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
      r.sort((a, b) => b.priority - a.priority);

      if (!alive) return;
      setCategories(cats);
      setRules(r);

      if (!ruleCategoryId && cats.length) {
        setRuleCategoryId(cats.find(x => x.kind === "expense")?.id ?? cats[0].id);
      }

      setLoading(false);
    }

    void load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const [cats, r] = await Promise.all([db.categories.toArray(), db.rules.toArray()]);
    cats.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    r.sort((a, b) => b.priority - a.priority);
    setCategories(cats);
    setRules(r);
  }

  async function addCategory() {
    setMsg(null);

    const name = catName.trim();
    if (!name) {
      setMsg("Nome da categoria é obrigatório.");
      return;
    }

    const id = slugify(name);
    if (!id) {
      setMsg("Não foi possível gerar ID da categoria.");
      return;
    }

    const exists = await db.categories.get(id);
    if (exists) {
      setMsg(`Já existe uma categoria com id: ${id}`);
      return;
    }

    const cat: Category = { id, name, kind: catKind };
    await db.categories.add(cat);

    setCatName("");
    setMsg("Categoria adicionada.");
    await refresh();
  }

  async function deleteCategory(id: string) {
    setMsg(null);

    // bloqueia se tem regra usando
    const used = rules.some((r) => r.categoryId === id);
    if (used) {
      setMsg("Não dá pra apagar: existe regra usando essa categoria.");
      return;
    }

    await db.categories.delete(id);
    setMsg("Categoria removida.");
    await refresh();
  }

  async function addRule() {
    setMsg(null);

    const pattern = rulePattern.trim();
    if (!pattern) {
      setMsg("Pattern é obrigatório (ex: UBER, IFOOD, NETFLIX).");
      return;
    }
    if (!ruleCategoryId) {
      setMsg("Selecione uma categoria.");
      return;
    }

    const rule: Rule = {
      id: newId(),
      pattern,
      categoryId: ruleCategoryId,
      priority: Number.isFinite(rulePriority) ? rulePriority : 100,
      enabled: ruleEnabled,
    };

    await db.rules.add(rule);

    setRulePattern("");
    setRulePriority(100);
    setRuleEnabled(true);

    setMsg("Regra adicionada.");
    await refresh();
  }

  async function toggleRule(id: string, enabled: boolean) {
    await db.rules.update(id, { enabled });
    await refresh();
  }

  async function deleteRule(id: string) {
    await db.rules.delete(id);
    await refresh();
  }

  if (loading) return <div className="text-sm text-black/60">Carregando...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Config</h1>
        <div className="text-sm text-black/60">
          Categorias e regras automáticas (match por “contains”).
        </div>
        {msg && <div className="mt-3 text-sm text-black/70">{msg}</div>}
      </div>

      {/* Categorias */}
      <section className="bg-white border rounded-xl p-4">
        <div className="font-medium">Categorias</div>

        <div className="mt-3 flex gap-2 flex-wrap items-end">
          <label className="text-sm">
            Nome
            <input
              className="mt-1 border rounded-lg px-3 py-2 w-64"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Ex: Alimentação"
            />
          </label>

          <label className="text-sm">
            Tipo
            <select
              className="mt-1 border rounded-lg px-3 py-2"
              value={catKind}
              onChange={(e) => setCatKind(e.target.value as Direction)}
            >
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>
          </label>

          <button
            onClick={() => void addCategory()}
            className="bg-black text-white px-4 py-2 rounded-lg"
          >
            Adicionar
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          {categories.map((c) => (
            <div key={c.id} className="border rounded-lg px-3 py-2 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-black/60">
                  id: {c.id} • tipo: {c.kind}
                </div>
              </div>
              <button
                className="text-sm px-3 py-2 rounded-lg hover:bg-black/5"
                onClick={() => void deleteCategory(c.id)}
              >
                Remover
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <div className="text-sm text-black/60">Nenhuma categoria ainda.</div>
          )}
        </div>
      </section>

      {/* Regras */}
      <section className="bg-white border rounded-xl p-4">
        <div className="font-medium">Regras automáticas</div>
        <div className="text-sm text-black/60 mt-1">
          Se a descrição da transação contiver o pattern, aplica a categoria (prioridade maior vence).
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <label className="text-sm md:col-span-2">
            Pattern (contém)
            <input
              className="mt-1 border rounded-lg px-3 py-2 w-full"
              value={rulePattern}
              onChange={(e) => setRulePattern(e.target.value)}
              placeholder="Ex: UBER, IFOOD, NETFLIX"
            />
          </label>

          <label className="text-sm">
            Categoria
            <select
              className="mt-1 border rounded-lg px-3 py-2 w-full"
              value={ruleCategoryId}
              onChange={(e) => setRuleCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.kind})
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Prioridade
            <input
              className="mt-1 border rounded-lg px-3 py-2 w-full"
              type="number"
              value={rulePriority}
              onChange={(e) => setRulePriority(Number(e.target.value))}
            />
          </label>

          <label className="text-sm flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              checked={ruleEnabled}
              onChange={(e) => setRuleEnabled(e.target.checked)}
            />
            Ativa
          </label>

          <button
            onClick={() => void addRule()}
            className="bg-black text-white px-4 py-2 rounded-lg md:col-span-2"
          >
            Adicionar regra
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {rules.map((r) => {
            const cat = categoryMap.get(r.categoryId);
            return (
              <div key={r.id} className="border rounded-lg px-3 py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    “{r.pattern}” → {cat ? cat.name : r.categoryId}
                  </div>
                  <div className="text-xs text-black/60">
                    prioridade: {r.priority} • {r.enabled ? "ativa" : "desativada"}
                  </div>
                </div>

                <button
                  className="text-sm px-3 py-2 rounded-lg hover:bg-black/5"
                  onClick={() => void toggleRule(r.id, !r.enabled)}
                >
                  {r.enabled ? "Desativar" : "Ativar"}
                </button>

                <button
                  className="text-sm px-3 py-2 rounded-lg hover:bg-black/5"
                  onClick={() => void deleteRule(r.id)}
                >
                  Remover
                </button>
              </div>
            );
          })}

          {rules.length === 0 && (
            <div className="text-sm text-black/60">Nenhuma regra ainda.</div>
          )}
        </div>

        <div className="mt-4 text-xs text-black/50">
          Dica: crie regras “genéricas” com prioridade menor e regras “específicas” com prioridade maior.
        </div>
      </section>
    </div>
  );
}

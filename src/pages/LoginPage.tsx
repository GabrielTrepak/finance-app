import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../app/stores/authStore";

export default function LoginPage() {
  const nav = useNavigate();
  const { hasAccount, setupAccount, login } = useAuthStore();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canCreate = useMemo(() => password.length >= 6 && password === password2, [password, password2]);

  async function handleCreate() {
    setErr(null);
    if (!canCreate) return;
    setLoading(true);
    try {
      await setupAccount(password);
      nav("/", { replace: true });
    } catch (e: unknown) {
      console.error(e);
      setErr("Falha ao criar conta.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setErr(null);
    if (password.length < 6) { setErr("Senha muito curta."); return; }
    setLoading(true);
    try {
      const ok = await login(password);
      if (!ok) setErr("Senha inválida.");
      else nav("/", { replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-zinc-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border rounded-2xl p-6 shadow-sm">
        <div className="text-lg font-semibold">finance-app</div>
        <div className="text-sm text-black/60 mt-1">
          {hasAccount ? "Entre com sua senha" : "Crie uma senha para proteger seus dados"}
        </div>

        <div className="mt-5 space-y-3">
          <label className="block text-sm">
            Senha
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 6 caracteres"
            />
          </label>

          {!hasAccount && (
            <label className="block text-sm">
              Confirmar senha
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </label>
          )}

          {err && <div className="text-sm text-red-600">{err}</div>}

          {hasAccount ? (
            <button
              className="w-full bg-black text-white rounded-lg py-2 disabled:opacity-50"
              disabled={loading}
              onClick={handleLogin}
            >
              Entrar
            </button>
          ) : (
            <button
              className="w-full bg-black text-white rounded-lg py-2 disabled:opacity-50"
              disabled={loading || !canCreate}
              onClick={handleCreate}
            >
              Criar conta
            </button>
          )}

          <div className="text-xs text-black/50">
            Obs: no MVP os dados ficam no seu PC (IndexedDB). Depois a gente adiciona backup/sync.
          </div>
        </div>
      </div>
    </div>
  );
}

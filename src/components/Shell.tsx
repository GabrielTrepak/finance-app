import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../app/stores/authStore";

const navItem = (active: boolean) =>
  `px-3 py-2 rounded-md text-sm ${active ? "bg-black text-white" : "text-black/70 hover:bg-black/5"}`;

export function Shell() {
  const { pathname } = useLocation();
  const logout = useAuthStore(s => s.logout);

  return (
    <div className="min-h-full bg-zinc-50">
      <header className="sticky top-0 bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-2">
          <div className="font-semibold">finance-app</div>
          <nav className="ml-4 flex gap-2">
            <Link className={navItem(pathname === "/")} to="/">Dashboard</Link>
            <Link className={navItem(pathname.startsWith("/transactions"))} to="/transactions">Transações</Link>
            <Link className={navItem(pathname.startsWith("/import"))} to="/import">Importar</Link>
            <Link className={navItem(pathname.startsWith("/settings"))} to="/settings">Config</Link>
          </nav>
          <button
            className="ml-auto text-sm px-3 py-2 rounded-md hover:bg-black/5"
            onClick={logout}
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

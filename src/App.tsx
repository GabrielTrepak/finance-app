import { useEffect } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { useAuthStore } from "./app/stores/authStore";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { Shell } from "./components/Shell";
import { ensureDefaultCategories } from "./app/db/seed";

import LoginPage from "../src/pages/LoginPage";
import DashboardPage from "../src/pages/DashboardPage";
import TransactionsPage from "../src/pages/TransactionsPage";
import ImportPage from "../src/pages/ImportPage";
import SettingsPage from "../src/pages/SettingsPage"

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Shell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "transactions", element: <TransactionsPage /> },
      { path: "import", element: <ImportPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  const init = useAuthStore(s => s.init);

  useEffect(() => { init(); }, [init]);
  useEffect(() => {
    init().then(() => ensureDefaultCategories());
  }, [init]);

  return <RouterProvider router={router} />;
}

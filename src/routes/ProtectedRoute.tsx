import { Navigate } from "react-router-dom";
import { useAuthStore } from "../app/stores/authStore";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isReady, isLogged } = useAuthStore();

  if (!isReady) return null;
  if (!isLogged) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/auth" />;
  if (session.role === "trainer") return <Navigate to="/trainer" />;
  return <Navigate to="/client" />;
}

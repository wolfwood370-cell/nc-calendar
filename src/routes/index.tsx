import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth, pathForRole } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, role, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (!session) return <Navigate to="/auth" />;
  return <Navigate to={pathForRole(role)} />;
}

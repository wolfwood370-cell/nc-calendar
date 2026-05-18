import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// M10: validate the role coming from the DB through a Zod enum instead of
// blindly casting `as Role`. Stray DB values (case mismatch, typo, future
// enum addition not yet known to the client) now fall back to "client"
// instead of being accepted silently and breaking downstream
// role === "coach" / "admin" guards.
const roleSchema = z.enum(["admin", "coach", "client"]);
export type Role = z.infer<typeof roleSchema>;
export const ADMIN_EMAIL = "nctrainingsystems@gmail.com";
// Backwards-compat export (used by some routes)
export const TRAINER_EMAIL = ADMIN_EMAIL;

interface AuthCtx {
  session: Session | null;
  user: User | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => fetchRole(s.user.id), 0);
      } else {
        setRole(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchRole(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRole(userId: string) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const parsed = roleSchema.safeParse(data?.role);
    if (!parsed.success && data?.role != null) {
      // Log the malformed value so it shows up in error capture instead of
      // silently downgrading the user.
      console.warn("auth: unrecognized role from DB, falling back to 'client'", data.role);
    }
    setRole(parsed.success ? parsed.data : "client");
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    // Purge all cached user-scoped data so a subsequent login on the same
    // device cannot momentarily display the previous user's queries.
    queryClient.clear();
    queryClient.removeQueries();
  };

  return <Ctx.Provider value={{ session, user, role, loading, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}

export function pathForRole(role: Role | null): string {
  if (role === "admin") return "/admin";
  if (role === "coach") return "/trainer";
  return "/client";
}

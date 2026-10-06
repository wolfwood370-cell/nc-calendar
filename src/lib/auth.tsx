import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  leftOnPurpose,
  markLeaving,
  readLeaving,
  releasePushDevice,
  sessionKey,
  shouldReleaseOnAuthEvent,
} from "@/lib/push";
import { setSentryUser, setSentryRoleTag } from "@/lib/sentry";
import { signOutChecked } from "@/lib/sign-out";
import { toast } from "sonner";

// M10: validate the role coming from the DB through a Zod enum instead of
// blindly casting `as Role`. Stray DB values (case mismatch, typo, future
// enum addition not yet known to the client) now fall back to "client"
// instead of being accepted silently and breaking downstream
// role === "coach" / "admin" guards.
const roleSchema = z.enum(["admin", "coach", "client"]);
export type Role = z.infer<typeof roleSchema>;
// ADMIN_EMAIL / TRAINER_EMAIL RIMOSSI (audit 2026-06-06): export mai usati
// altrove (il ruolo si legge da user_roles, non dall'email).

interface AuthCtx {
  session: Session | null;
  user: User | null;
  role: Role | null;
  loading: boolean;
  /**
   * Esce: true se la sessione non è più su questo dispositivo. Non lancia mai;
   * se non riesce lo dice con un toast (passata 11 del lato cliente).
   */
  signOut: () => Promise<boolean>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  // Le uscite chieste (signOut qui sotto: «Esci» ed «Esci e collega Google»):
  // questa scheda ha il segno in memoria, le altre leggono quello di
  // markLeaving. Le altre uscite (la sessione scaduta o revocata) arrivano
  // come SIGNED_OUT senza un segno che le riguardi, e liberano il telefono
  // (passata 09).
  const leaving = useRef(false);
  // La sessione che questa scheda conosce (sessionKey, passata 10): il segno
  // di markLeaving la nomina, e una scheda ferma in background che riceve
  // SIGNED_OUT minuti dopo un «Esci» la riconosce, invece di prenderlo per
  // un'uscita non chiesta e liberare il telefono. La decisione si prende con
  // la sessione di prima dell'evento: SIGNED_OUT arriva senza sessione.
  const knownSession = useRef<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      const before = knownSession.current;
      if (s) knownSession.current = sessionKey(s.access_token);
      if (
        shouldReleaseOnAuthEvent(
          event,
          leaving.current || leftOnPurpose(readLeaving(), Date.now(), before),
        )
      ) {
        void releasePushDevice();
      }
      setSession(s);
      setUser(s?.user ?? null);
      // Sentry user context — ogni bug futuro avrà l'id/email del
      // soggetto loggato. setSentryUser(null) clear su signOut.
      setSentryUser(s?.user ? { id: s.user.id, email: s.user.email } : null);
      if (s?.user) {
        setTimeout(() => fetchRole(s.user.id), 0);
      } else {
        setRole(null);
        setSentryRoleTag(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) knownSession.current = sessionKey(s.access_token);
      setSession(s);
      setUser(s?.user ?? null);
      setSentryUser(s?.user ? { id: s.user.id, email: s.user.email } : null);
      if (s?.user) fetchRole(s.user.id).finally(() => setLoading(false));
      else {
        setSentryRoleTag(null);
        setLoading(false);
      }
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
    const resolvedRole = parsed.success ? parsed.data : "client";
    setRole(resolvedRole);
    setSentryRoleTag(resolvedRole);
  }

  const signOut = async (): Promise<boolean> => {
    leaving.current = true;
    const at = Date.now();
    const known = knownSession.current;
    markLeaving(at, known);
    // L'esito si guarda (sign-out.ts, passata 11 del lato cliente): con la
    // rete giù auth-js tiene la sessione, e l'app non deve fare finta di
    // essere uscita.
    const done = await signOutChecked(supabase.auth);
    // Uscita non riuscita: il segno non nomina più la sessione, e vale solo il
    // margine di dieci secondi. Se poi la sessione scade o la si revoca altrove
    // il telefono si libera (passata 10). La sessione resta, e lo si dice.
    if (!done) markLeaving(at, null, known);
    leaving.current = false;
    if (!done) {
      toast.error("Uscita non riuscita. Controlla la connessione e riprova.");
      return false;
    }
    setSession(null);
    setUser(null);
    setRole(null);
    // Sentry: clear user + reset role tag così bug post-logout non
    // vengono attribuiti all'utente precedente.
    setSentryUser(null);
    setSentryRoleTag(null);
    // Purge all cached user-scoped data so a subsequent login on the same
    // device cannot momentarily display the previous user's queries.
    queryClient.clear();
    queryClient.removeQueries();
    return true;
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

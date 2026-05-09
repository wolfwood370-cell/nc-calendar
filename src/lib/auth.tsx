import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "./mock-data";

interface Session {
  role: Role;
  name: string;
  email: string;
}

interface AuthCtx {
  session: Session | null;
  signIn: (role: Role) => void;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "pt_demo_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {}
  }, []);

  const signIn = (role: Role) => {
    const s: Session =
      role === "trainer"
        ? { role, name: "Alex Morgan", email: "trainer@demo.app" }
        : { role, name: "Jordan Chen", email: "client@demo.app" };
    setSession(s);
    localStorage.setItem(KEY, JSON.stringify(s));
  };

  const signOut = () => {
    setSession(null);
    localStorage.removeItem(KEY);
  };

  return <Ctx.Provider value={{ session, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}

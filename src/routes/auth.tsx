import { createFileRoute, useNavigate, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth, pathForRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import nccLogo from "@/assets/ncc-logo.png";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.97 6.97 0 0 1 5.46 12c0-.73.13-1.44.36-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!loading && session && role) {
    return <Navigate to={pathForRole(role)} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (isSignUp) {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl, data: { full_name: fullName } },
      });
      setBusy(false);
      if (error) {
        toast.error("Registrazione non riuscita", { description: traduciErrore(error.message) });
        return;
      }
      toast.success("Account creato", { description: "Benvenuto!" });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        toast.error("Accesso non riuscito", { description: traduciErrore(error.message) });
        return;
      }
      toast.success("Accesso effettuato");
      navigate({ to: "/" });
    }
  };

  const handleGoogleLogin = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Accesso con Google non riuscito", {
          description: traduciErrore(
            String((result.error as { message?: string })?.message ?? result.error),
          ),
        });
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast.error("Accesso con Google non riuscito", {
        description: traduciErrore(message),
      });
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-5 bg-surface">
      {/* Ambient glow background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-primary-fixed-dim/20 blur-[120px]" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[300px] h-[300px] rounded-full bg-primary-fixed-dim/20 blur-[100px]" />
      </div>

      <main className="w-full max-w-md mx-auto space-y-8">
        <header className="flex flex-col items-center text-center space-y-4 pt-8">
          <img
            src={nccLogo}
            alt="NCC"
            className="w-20 h-20 rounded-3xl object-cover shadow-lg transition-transform hover:scale-105 duration-300"
          />
          <div className="space-y-2">
            <h1 className="text-aura-primary text-[28px] leading-9 font-bold tracking-tight">
              NC Calendar
            </h1>
            <p className="text-base text-on-surface-variant">Il tuo percorso, organizzato.</p>
          </div>
        </header>

        <section className="bg-white rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-8 space-y-8">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 py-4 px-6 border border-outline-variant bg-surface-container-lowest rounded-full hover:bg-surface-container-low active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:pointer-events-none"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <GoogleIcon className="size-5" />
                <span className="text-sm font-semibold text-on-surface">Continua con Google</span>
              </>
            )}
          </button>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-outline-variant" />
            <span className="flex-shrink mx-4 text-[10px] font-semibold text-outline uppercase tracking-wider">
              oppure {isSignUp ? "registrati" : "accedi"} con email
            </span>
            <div className="flex-grow border-t border-outline-variant" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <label
                  className="text-sm font-semibold text-on-surface-variant ml-2 block"
                  htmlFor="fullName"
                >
                  Nome completo
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Mario Rossi"
                  className="w-full px-6 py-4 bg-surface-container-lowest border border-outline-variant rounded-[16px] text-base text-on-surface transition-all focus:outline-none focus:border-aura-primary focus:ring-4 focus:ring-aura-primary/5"
                />
              </div>
            )}
            <div className="space-y-2">
              <label
                className="text-sm font-semibold text-on-surface-variant ml-2 block"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@esempio.it"
                className="w-full px-6 py-4 bg-surface-container-lowest border border-outline-variant rounded-[16px] text-base text-on-surface transition-all focus:outline-none focus:border-aura-primary focus:ring-4 focus:ring-aura-primary/5"
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-semibold text-on-surface-variant ml-2 block"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-6 py-4 pr-14 bg-surface-container-lowest border border-outline-variant rounded-[16px] text-base text-on-surface transition-all focus:outline-none focus:border-aura-primary focus:ring-4 focus:ring-aura-primary/5"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-aura-primary transition-colors"
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-4 bg-primary-container text-on-primary text-sm font-semibold rounded-full hover:brightness-110 active:scale-[0.97] transition-all shadow-md mt-4 disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center"
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : isSignUp ? (
                "Registrati"
              ) : (
                "Entra"
              )}
            </button>
          </form>

          <div className="flex flex-col items-center space-y-4 pt-2">
            {!isSignUp && (
              <Link
                to="/forgot-password"
                className="text-sm font-semibold text-aura-primary hover:underline decoration-2 underline-offset-4"
              >
                Password dimenticata?
              </Link>
            )}
            <div className="flex items-center gap-1 text-base text-on-surface-variant">
              <span>{isSignUp ? "Hai già un account?" : "Non hai un account?"}</span>
              <button
                type="button"
                onClick={() => setIsSignUp((v) => !v)}
                className="text-sm font-semibold text-primary-container hover:underline decoration-2 underline-offset-4"
              >
                {isSignUp ? "Accedi" : "Crea un account"}
              </button>
            </div>
          </div>
        </section>

        <footer className="text-center">
          <p className="text-xs text-outline px-5">
            Effettuando l'accesso, accetti i nostri Termini di Servizio e la nostra Informativa
            sulla Privacy.
          </p>
        </footer>
      </main>
    </div>
  );
}

function traduciErrore(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login")) return "Email o password non corrette.";
  if (m.includes("user already registered")) return "Questa email è già registrata.";
  if (m.includes("email not confirmed")) return "Conferma la tua email prima di accedere.";
  if (m.includes("non invitata") || m.includes("not invited")) {
    return "Questa email non è stata invitata da un Coach. Chiedi al tuo coach di inviarti un invito.";
  }
  if (m.includes("database error") || m.includes("unexpected_failure")) {
    return "Email non invitata da un Coach. Contatta il tuo coach per ricevere un invito.";
  }
  if (m.includes("password")) return "La password non soddisfa i requisiti.";
  return msg;
}

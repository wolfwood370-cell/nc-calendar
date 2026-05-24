import { createFileRoute, useNavigate, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth, pathForRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import nccLogo from "@/assets/ncc-logo.png";
import { GoogleIcon } from "@/components/google-icon";
import { traduciErrore } from "@/lib/auth-error-messages";

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
          <div className="w-20 h-20 rounded-3xl overflow-hidden bg-white shadow-lg transition-transform hover:scale-105 duration-300">
            <img
              src={nccLogo}
              alt="NCC"
              className="w-full h-full object-cover object-center scale-[1.2]"
            />
          </div>
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


import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Zap, Stethoscope, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/client/store")({
  component: StorePage,
});

interface PackageCard {
  id: string;
  title: string;
  price: string;
  perSession?: string;
  description: string;
  icon: typeof Sparkles;
  hero?: boolean;
}

const packages: PackageCard[] = [
  {
    id: "single",
    title: "Credito Singolo PT",
    price: "40 €",
    description:
      "1 Sessione extra per correggere l'esecuzione o recuperare un allenamento.",
    icon: Sparkles,
  },
  {
    id: "pack",
    title: "PT Pack Booster (3 Sessioni)",
    price: "99 €",
    perSession: "Solo 33 € a sessione",
    description:
      "Il pacchetto ideale per un boost intensivo di perfezionamento tecnico.",
    icon: Zap,
    hero: true,
  },
  {
    id: "triage",
    title: "Extra Triage / Check Tecnico",
    price: "75 €",
    description:
      "60 minuti di valutazione posturale e riprogrammazione tecnica. Ideale per infortuni o cambi obiettivo.",
    icon: Stethoscope,
  },
];

function StorePage() {
  const { user } = useAuth();
  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);

  const handlePurchase = async (pkgId: string) => {
    if (!user) return;
    
    try {
      setLoadingPkg(pkgId);
      toast.info("Preparazione del checkout in corso...", { id: "checkout-toast" });
      
      const { data, error } = await supabase.functions.invoke('booster-checkout', { 
        body: { package_type: pkgId, client_id: user.id } 
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (data?.checkout_url) {
        toast.success("Reindirizzamento...", { id: "checkout-toast" });
        window.location.href = data.checkout_url;
      } else {
        throw new Error("Impossibile avviare il checkout");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Si è verificato un errore.", { id: "checkout-toast" });
      setLoadingPkg(null);
    }
  };

  return (
    <div className="px-4 py-6 md:px-0 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="rounded-full">
          <Link to="/client">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-display font-semibold">Crediti Booster</h1>
      </div>

      <p className="text-on-surface-variant text-sm leading-relaxed">
        Aggiungi sessioni extra per perfezionare la tua tecnica o gestire
        imprevisti. Disponibili solo con un abbonamento attivo.
      </p>

      <div className="space-y-4">
        {packages.map((pkg) => {
          const Icon = pkg.icon;
          return (
            <div
              key={pkg.id}
              className={`relative rounded-[32px] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] border ${
                pkg.hero
                  ? "bg-primary/5 border-primary/20"
                  : "bg-surface border-border"
              }`}
            >
              {pkg.hero && (
                <span className="absolute -top-2 right-6 bg-tertiary/10 text-tertiary text-[10px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full shadow-sm">
                  Miglior Valore
                </span>
              )}

              <div className="flex items-start gap-4">
                <div
                  className={`size-12 shrink-0 rounded-2xl flex items-center justify-center ${
                    pkg.hero
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <Icon className="size-6" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base leading-snug">
                    {pkg.title}
                  </h3>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-display font-bold">
                      {pkg.price}
                    </span>
                    {pkg.perSession && (
                      <span className="text-xs text-on-surface-variant">
                        {pkg.perSession}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                    {pkg.description}
                  </p>

                  <Button
                    onClick={() => handlePurchase(pkg.id)}
                    variant={pkg.hero ? "default" : "secondary"}
                    className="mt-4 w-full rounded-full"
                    disabled={loadingPkg !== null}
                  >
                    {loadingPkg === pkg.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Attendere...
                      </>
                    ) : (
                      "Acquista Ora"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-on-surface-variant text-center px-4">
        I crediti Booster scadono al termine del tuo blocco attuale.
      </p>
    </div>
  );
}

import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Zap, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { BoosterCard } from "@/components/booster-card";
import { useClientExtraCredits, useClientBlocks } from "@/lib/queries";

export const Route = createFileRoute("/client/store")({
  component: StorePage,
});

interface PackageDef {
  id: string;
  title: string;
  price: string;
  perSession?: string;
  description: string;
  icon: typeof Sparkles;
  hero?: boolean;
}

const PACKAGES: PackageDef[] = [
  {
    id: "single",
    title: "Sessione PT Aggiuntiva",
    price: "40 €",
    description:
      "1 Sessione extra per correggere l'esecuzione o recuperare un allenamento.",
    icon: Sparkles,
  },
  {
    id: "pack",
    title: "Pacchetto Sessioni PT Aggiuntive",
    price: "99 €",
    perSession: "Solo 33 € a sessione",
    description:
      "Il pacchetto ideale per un boost intensivo di perfezionamento tecnico.",
    icon: Zap,
    hero: true,
  },
  {
    id: "triage",
    title: "Test Funzionali + Check Tecnico",
    price: "75 €",
    description:
      "60 minuti di valutazione posturale e riprogrammazione tecnica. L'intervento ideale per gestire infortuni, superare stalli o ricalibrare i tuoi obiettivi.",
    icon: Stethoscope,
  },
];

function StorePage() {
  const { user } = useAuth();
  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);

  const { data: extraCredits = [] } = useClientExtraCredits(user?.id);
  const { data: blocks, isLoading: blocksLoading } = useClientBlocks(user?.id);
  const hasActivePath = !!blocks && blocks.length > 0;
  const checkingPath = blocksLoading || blocks === undefined;

  // Map event_type_id -> name for owned credits display
  const eventTypeIds = useMemo(
    () => Array.from(new Set(extraCredits.map((c) => c.event_type_id))),
    [extraCredits],
  );

  const { data: eventTypes = [] } = useQuery({
    queryKey: ["event_types_by_id", eventTypeIds],
    enabled: eventTypeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_types")
        .select("id, name")
        .in("id", eventTypeIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ownedCredits = useMemo(() => {
    const nameById = new Map(eventTypes.map((e) => [e.id, e.name]));
    return extraCredits
      .map((c) => ({
        ...c,
        remaining: Math.max(0, c.quantity - c.quantity_booked),
        eventName: nameById.get(c.event_type_id) ?? "Sessione",
      }))
      .filter((c) => c.remaining > 0);
  }, [extraCredits, eventTypes]);

  const handlePurchase = async (pkgId: string) => {
    if (!user) return;
    if (!hasActivePath) {
      toast.error("Accesso limitato", {
        description:
          "Non puoi acquistare add-on senza un percorso attivo. Contatta il tuo coach per attivare il tuo piano.",
      });
      return;
    }
    try {
      setLoadingPkg(pkgId);
      toast.info("Preparazione del checkout in corso...", { id: "checkout-toast" });

      const { data, error } = await supabase.functions.invoke("booster-checkout", {
        body: { package_type: pkgId, client_id: user.id },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (data?.checkout_url) {
        toast.success("Reindirizzamento...", { id: "checkout-toast" });
        window.location.href = data.checkout_url;
      } else {
        throw new Error("Impossibile avviare il checkout");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Si è verificato un errore.";
      console.error(err);
      toast.error(message, { id: "checkout-toast" });
      setLoadingPkg(null);
    }
  };

  return (
    <div className="px-4 py-6 md:px-0 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="rounded-full">
          <Link to="/client" aria-label="Torna alla dashboard">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-2xl md:text-3xl font-manrope font-extrabold tracking-tight text-on-surface">
          NC Add-on
        </h1>
      </div>

      {/* Glass Hub container */}
      <section
        aria-label="NC Add-on"
        className="rounded-[40px] bg-white/40 backdrop-blur-md border border-white/30 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-5 md:p-8 space-y-6"
      >
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Risorse premium e sessioni one-to-one riservate esclusivamente agli
          atleti con un percorso attivo. Il tuo accesso diretto per elevare
          ulteriormente i tuoi standard.
        </p>

        {ownedCredits.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-manrope font-semibold text-sm uppercase tracking-wide text-on-surface-variant">
              I tuoi Booster attivi
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {ownedCredits.map((c) => (
                <BoosterCard
                  key={c.id}
                  isOwned
                  icon={Sparkles}
                  title={`${c.remaining}× ${c.eventName}`}
                  description="Crediti pronti da prenotare nella tua prossima sessione."
                  expiresAt={c.expires_at}
                />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="font-manrope font-semibold text-sm uppercase tracking-wide text-on-surface-variant">
            Acquista nuovi Booster
          </h2>

          {!checkingPath && !hasActivePath && (
            <div
              role="status"
              className="rounded-2xl bg-white/50 backdrop-blur-md border border-white/40 px-4 py-3 text-sm text-on-surface-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
            >
              Gli add-on sono riservati agli atleti con un percorso attivo.
              Contatta il tuo coach per attivare il tuo piano.
            </div>
          )}

          <div
            className={[
              "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 transition",
              !checkingPath && !hasActivePath ? "opacity-60" : "",
            ].join(" ")}
          >
            {PACKAGES.map((pkg) => {
              const blocked = !checkingPath && !hasActivePath;
              return (
                <div
                  key={pkg.id}
                  title={
                    blocked
                      ? "Disponibile solo con un percorso attivo"
                      : undefined
                  }
                >
                  <BoosterCard
                    title={pkg.title}
                    description={pkg.description}
                    price={pkg.price}
                    perSession={pkg.perSession}
                    icon={pkg.icon}
                    hero={pkg.hero}
                    loading={loadingPkg === pkg.id}
                    disabled={loadingPkg !== null || blocked || checkingPath}
                    onAction={() => handlePurchase(pkg.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-on-surface-variant text-center">
          I crediti Booster scadono al termine del tuo blocco attuale.
        </p>
      </section>
    </div>
  );
}

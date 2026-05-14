import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Zap, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { BoosterCard } from "@/components/booster-card";
import { useClientExtraCredits } from "@/lib/queries";

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

  // Fetch profile path_type + pack_label to determine add-on eligibility
  const { data: profile } = useQuery({
    queryKey: ["client_profile_path", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("path_type, pack_label, status")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Check active training block exists
  const { data: hasActiveBlock = false } = useQuery({
    queryKey: ["client_active_block", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_blocks")
        .select("id")
        .eq("client_id", user!.id)
        .is("deleted_at", null)
        .eq("status", "active")
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });

  // Allowed: Percorso Fisso (Pacchetto) [path_type=fixed, no pack_label] OR Abbonamento Mensile [recurring]
  // Disabled: Cliente Libero (free / no block) OR PT Pack (fixed with pack_label)
  const canPurchaseAddons =
    !!profile &&
    hasActiveBlock &&
    profile.status === "active" &&
    ((profile.path_type === "fixed" && !profile.pack_label) ||
      profile.path_type === "recurring");

  const restrictedToast = () =>
    toast.error("Accesso limitato", {
      description:
        "Gli Add-on sono riservati esclusivamente ai clienti con un Percorso Fisso o un Abbonamento Mensile attivo.",
    });

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
    if (!canPurchaseAddons) {
      restrictedToast();
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
          {!canPurchaseAddons && (
            <div className="rounded-2xl border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
              Gli Add-on sono riservati esclusivamente ai clienti con un{" "}
              <strong>Percorso Fisso</strong> o un{" "}
              <strong>Abbonamento Mensile</strong> attivo.
            </div>
          )}
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            onClickCapture={(e) => {
              if (!canPurchaseAddons) {
                e.stopPropagation();
                e.preventDefault();
                restrictedToast();
              }
            }}
          >
            {PACKAGES.map((pkg) => (
              <BoosterCard
                key={pkg.id}
                title={pkg.title}
                description={pkg.description}
                price={pkg.price}
                perSession={pkg.perSession}
                icon={pkg.icon}
                hero={pkg.hero}
                loading={loadingPkg === pkg.id}
                disabled={loadingPkg !== null || !canPurchaseAddons}
                onAction={() => handlePurchase(pkg.id)}
              />
            ))}
          </div>
        </div>

        <p className="text-xs text-on-surface-variant text-center">
          I crediti Booster scadono al termine del tuo blocco attuale.
        </p>
      </section>
    </div>
  );
}

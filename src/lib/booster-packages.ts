// Source-of-truth lato server per i pacchetti Booster.
// Il client NON definisce mai prezzi: il packageId viaggia, il server traduce.

export type BoosterPackageId = "single" | "pack3" | "triage";

export interface BoosterPackage {
  id: BoosterPackageId;
  name: string;
  description: string;
  /** Prezzo totale in centesimi (EUR) */
  amount: number;
  /** Numero di sessioni accreditate */
  quantity: number;
}

export const BOOSTER_PACKAGES: Record<BoosterPackageId, BoosterPackage> = {
  single: {
    id: "single",
    name: "Credito Singolo PT",
    description: "1 sessione PT extra",
    amount: 4000,
    quantity: 1,
  },
  pack3: {
    id: "pack3",
    name: "PT Pack Booster (3 Sessioni)",
    description: "3 sessioni PT extra",
    amount: 9900,
    quantity: 3,
  },
  triage: {
    id: "triage",
    name: "Extra Triage / Check Tecnico",
    description: "60 minuti di valutazione posturale",
    amount: 7500,
    quantity: 1,
  },
};

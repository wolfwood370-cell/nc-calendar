// Palette ufficiale Google Calendar, coi nomi italiani del prototipo
// (Coach Tipologie.dc.html). Gli hex restano quelli già salvati nelle
// tipologie: Salvia è #33B864, la variante del database che gcal-colors.ts
// conosce, non la #33b679 del prototipo.
export interface GCalColor {
  name: string;
  hex: string;
}

export const GCAL_COLORS: GCalColor[] = [
  { name: "Pomodoro", hex: "#D50000" },
  { name: "Fenicottero", hex: "#E67C73" },
  { name: "Mandarino", hex: "#F4511E" },
  { name: "Banana", hex: "#F6BF26" },
  { name: "Salvia", hex: "#33B864" },
  { name: "Basilico", hex: "#0B8043" },
  { name: "Pavone", hex: "#039BE5" },
  { name: "Mirtillo", hex: "#3F51B5" },
  { name: "Lavanda", hex: "#7986CB" },
  { name: "Uva", hex: "#8E24AA" },
  { name: "Grafite", hex: "#616161" },
];

export const GCAL_DEFAULT = GCAL_COLORS[6]?.hex ?? "#039BE5"; // Pavone

export function nameForColor(hex: string): string | undefined {
  return GCAL_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name;
}

// ----------------------------------------------------------------------------
// Palette del dialog desktop delle tipologie (passata 07)
// ----------------------------------------------------------------------------
// «Blu studio» più gli 11 di Google. Resta fuori da GCAL_COLORS perché il
// dialog del telefono legge quella costante e deve restare a 11 cerchi.
// ----------------------------------------------------------------------------

export const STUDIO_BLUE: GCalColor = { name: "Blu studio", hex: "#003e62" };

export const TYPE_PALETTE: readonly GCalColor[] = [STUDIO_BLUE, ...GCAL_COLORS];

export function sameColor(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Luminanza relativa WCAG di un colore #rrggbb. */
function luminance(hex: string): number {
  const n = parseInt(hex.trim().slice(1, 7), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** Contrasto del testo bianco sul colore, con la formula WCAG del prototipo. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** Sotto 3:1 il testo bianco del tile in calendario si legge male. */
export const MIN_WHITE_CONTRAST = 3;

export function lowContrastOnWhite(hex: string): boolean {
  return contrastWithWhite(hex) < MIN_WHITE_CONTRAST;
}

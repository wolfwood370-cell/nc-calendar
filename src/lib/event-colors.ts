// Palette ufficiale Google Calendar
export interface GCalColor { name: string; hex: string; }

export const GCAL_COLORS: GCalColor[] = [
  { name: "Tomato",    hex: "#D50000" },
  { name: "Flamingo",  hex: "#E67C73" },
  { name: "Tangerine", hex: "#F4511E" },
  { name: "Banana",    hex: "#F6BF26" },
  { name: "Sage",      hex: "#33B864" },
  { name: "Basil",     hex: "#0B8043" },
  { name: "Peacock",   hex: "#039BE5" },
  { name: "Blueberry", hex: "#3F51B5" },
  { name: "Lavender",  hex: "#7986CB" },
  { name: "Grape",     hex: "#8E24AA" },
  { name: "Graphite",  hex: "#616161" },
];

export const GCAL_DEFAULT = GCAL_COLORS[6].hex; // Peacock

export function nameForColor(hex: string): string | undefined {
  return GCAL_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name;
}

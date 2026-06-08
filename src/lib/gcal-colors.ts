// Mappa hex (palette Google Calendar usata in event_types.color) → colorId
// che Google Calendar accetta nel campo `event.colorId` (stringa "1".."11").
// Riferimento: https://developers.google.com/calendar/api/v3/reference/colors
// Manteniamo anche eventuali numerici (già validi) come pass-through.
const HEX_TO_GOOGLE_COLOR_ID: Record<string, string> = {
  "#7986cb": "1",  // Lavender
  "#33b679": "2",  // Sage
  "#33b864": "2",  // (variante custom usata in DB)
  "#8e24aa": "3",  // Grape
  "#e67c73": "4",  // Flamingo
  "#f6bf26": "5",  // Banana
  "#f4511e": "6",  // Tangerine
  "#039be5": "7",  // Peacock
  "#616161": "8",  // Graphite
  "#3f51b5": "9",  // Blueberry
  "#0b8043": "10", // Basil
  "#d50000": "11", // Tomato
};

export function toGoogleColorId(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (/^\d{1,2}$/.test(trimmed)) return trimmed;
  const mapped = HEX_TO_GOOGLE_COLOR_ID[trimmed.toLowerCase()];
  return mapped;
}

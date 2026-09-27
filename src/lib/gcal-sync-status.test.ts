import { describe, expect, it } from "vitest";
import { gcalSyncPillText, parseSyncStamp } from "@/lib/gcal-sync-status";

const NOW = new Date(2026, 8, 25, 10, 40);

describe("pillola di Google Calendar", () => {
  it("senza chiave: non ancora sincronizzato da questo browser", () => {
    expect(gcalSyncPillText(parseSyncStamp(null), NOW)).toBe(
      "Google Calendar · non ancora sincronizzato da questo browser",
    );
    expect(parseSyncStamp("")).toBeNull();
    expect(parseSyncStamp("abc")).toBeNull();
  });

  it("30 secondi fa: sincronizzato ora", () => {
    const stamp = parseSyncStamp(String(NOW.getTime() - 30_000));
    expect(gcalSyncPillText(stamp, NOW)).toBe("Google Calendar · sincronizzato ora");
  });

  it("4 minuti fa: sincronizzato 4 min fa", () => {
    expect(gcalSyncPillText(NOW.getTime() - 4 * 60_000, NOW)).toBe(
      "Google Calendar · sincronizzato 4 min fa",
    );
  });
});

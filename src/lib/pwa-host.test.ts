import { describe, expect, it } from "vitest";
import { isLovablePreviewHost } from "@/lib/pwa-host";

// L'id del progetto, un UUID v4 (quello delle anteprime di nc-calendar).
const ID = "81e402d5-14ed-48a5-938a-c89e014f695a";

describe("isLovablePreviewHost · dove il service worker non si registra", () => {
  it("la produzione non è un'anteprima", () => {
    expect(isLovablePreviewHost("nc-calendar.lovable.app")).toBe(false);
    // L'host si confronta in minuscolo e senza spazi.
    expect(isLovablePreviewHost("NC-Calendar.lovable.app")).toBe(false);
    expect(isLovablePreviewHost("  NC-Calendar.lovable.app ")).toBe(false);
    // Un'app pubblicata in un workspace: <app>.<workspace>.lovable.app.
    expect(isLovablePreviewHost("nc-calendar.acme.lovable.app")).toBe(false);
    // Comincia come un id, ma non lo è.
    expect(isLovablePreviewHost("81e402d5-app.lovable.app")).toBe(false);
    expect(isLovablePreviewHost("lovable.app")).toBe(false);
  });

  it("le anteprime su lovable.app hanno «--» nel primo nome", () => {
    expect(isLovablePreviewHost(`id-preview--${ID}.lovable.app`)).toBe(true);
    expect(isLovablePreviewHost(`id-preview-536512a2--${ID}.lovable.app`)).toBe(true);
    expect(isLovablePreviewHost(`project--${ID}.lovable.app`)).toBe(true);
    expect(isLovablePreviewHost(`project--${ID}-dev.lovable.app`)).toBe(true);
    expect(isLovablePreviewHost("preview--nc-calendar.lovable.app")).toBe(true);
    // L'anteprima col nome dentro un workspace, se c'è: la regola la copre.
    expect(isLovablePreviewHost("preview--nc-calendar.acme.lovable.app")).toBe(true);
    expect(isLovablePreviewHost(" Preview--NC-Calendar.lovable.app")).toBe(true);
  });

  it("su lovable.app anche l'id del progetto in testa al primo nome, come in previewAuthStorage.ts", () => {
    expect(isLovablePreviewHost(`${ID}.lovable.app`)).toBe(true);
    expect(isLovablePreviewHost(`${ID}-preview.lovable.app`)).toBe(true);
    expect(isLovablePreviewHost(`${ID.toUpperCase()}.lovable.app`)).toBe(true);
  });

  it("le zone di sviluppo di Lovable sono tutte anteprime", () => {
    expect(isLovablePreviewHost(`${ID}.lovableproject.com`)).toBe(true);
    expect(isLovablePreviewHost(`${ID}.lovableproject-dev.com`)).toBe(true);
    expect(isLovablePreviewHost("qualcosa.gpt-eng.com")).toBe(true);
    expect(isLovablePreviewHost("qualcosa.gptengineer.run")).toBe(true);
    expect(isLovablePreviewHost("lovableproject.com")).toBe(true);
  });

  it("gli altri host non sono anteprime: lo sviluppo in locale e i domini propri", () => {
    expect(isLovablePreviewHost("localhost")).toBe(false);
    expect(isLovablePreviewHost("127.0.0.1")).toBe(false);
    expect(isLovablePreviewHost("app.esempio.it")).toBe(false);
    // Contengono il nome, ma non sono sottodomini di lovable.app.
    expect(isLovablePreviewHost("nc-lovable.app.esempio.it")).toBe(false);
    expect(isLovablePreviewHost("altro-lovable.app")).toBe(false);
  });
});

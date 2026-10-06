import { describe, expect, it } from "vitest";
import {
  fullSyncMeasure,
  fullSyncOutcome,
  fullSyncWindow,
  quickSyncMessage,
  quickSyncOutcome,
  REPAIR_MAX_PASSES,
  runFullSync,
  runQuickSync,
  type FullSync,
  type FullSyncProgress,
  type GcalSyncApi,
  type ReconcileResult,
  type RepairResult,
  type SyncWindow,
} from "@/lib/gcal-sync-run";

const NOW = new Date(2026, 8, 25, 10, 40);

/** Chiamate finte: ogni chiamata prende la risposta dopo, l'ultima si ripete. */
function fakeApi(
  reconcile: Array<ReconcileResult | Error>,
  repair: Array<RepairResult | Error>,
): GcalSyncApi & { windows: Array<SyncWindow | undefined>; repairCalls: () => number } {
  const windows: Array<SyncWindow | undefined> = [];
  let r = 0;
  let p = 0;
  const pick = <T>(list: Array<T | Error>, i: number): T => {
    const v = list[Math.min(i, list.length - 1)]!;
    if (v instanceof Error) throw v;
    return v;
  };
  return {
    windows,
    repairCalls: () => p,
    reconcile: async (window) => {
      windows.push(window);
      return pick(reconcile, r++);
    },
    repair: async () => pick(repair, p++),
  };
}

const PULL_NONE: ReconcileResult = { ok: true, cancelled: 0, moved: 0, conflicts: 0, checked: 0 };
const PUSH_NONE: RepairResult = { ok: true, created: 0, failed: 0, total: 0 };
const EMPTY_GUARD: ReconcileResult = {
  ok: true,
  skipped: "empty-list-guard",
  cancelled: 0,
  moved: 0,
  conflicts: 0,
};

describe("sincronizzazione rapida", () => {
  it("tutte e due riuscite senza modifiche: nessuna differenza", async () => {
    const api = fakeApi([PULL_NONE], [PUSH_NONE]);
    const r = await runQuickSync(api);
    expect(api.windows).toEqual([undefined]);
    expect(r).toMatchObject({ ok: true, failure: null, changed: false });
    expect(quickSyncOutcome(r)).toBe("ok");
    expect(quickSyncMessage(r)).toEqual({
      tone: "info",
      title: "Sincronizzato: nessuna differenza trovata.",
    });
  });

  it("con modifiche: le dice tutte, coi singolari giusti", async () => {
    const r = await runQuickSync(
      fakeApi(
        [{ ok: true, cancelled: 1, moved: 2, conflicts: 0, checked: 9 }],
        [{ ok: true, created: 3, failed: 0, total: 3 }],
      ),
    );
    expect(r).toMatchObject({ ok: true, changed: true, moved: 2, cancelled: 1, created: 3 });
    expect(quickSyncMessage(r)).toEqual({
      tone: "success",
      title: "Sincronizzato con Google Calendar.",
      description: "2 spostate su Google · 1 annullata su Google · 3 eventi ricreati su Google",
    });
    const one = await runQuickSync(
      fakeApi(
        [{ ok: true, cancelled: 2, moved: 1, conflicts: 0 }],
        [{ ok: true, created: 1, total: 1, failed: 0 }],
      ),
    );
    expect(quickSyncMessage(one).description).toBe(
      "1 spostata su Google · 2 annullate su Google · 1 evento ricreato su Google",
    );
  });

  it("riconciliazione fallita: Google non risponde, e sotto quello che è successo", async () => {
    const r = await runQuickSync(
      fakeApi(
        [{ ok: false, error: "Lettura Google Calendar fallita" }],
        [{ ok: true, created: 2, failed: 0, total: 2 }],
      ),
    );
    expect(r).toMatchObject({ ok: false, failure: "google", changed: true, created: 2 });
    expect(quickSyncOutcome(r)).toBe("google");
    expect(quickSyncMessage(r)).toEqual({
      tone: "warning",
      title: "Google Calendar non risponde. Riprova tra qualche minuto.",
      description: "2 eventi ricreati su Google",
    });
  });

  it("ripristino fallito: non è riuscita anche se la riconciliazione sì", async () => {
    const r = await runQuickSync(
      fakeApi([{ ok: true, cancelled: 0, moved: 1, conflicts: 0 }], [{ ok: false, error: "boom" }]),
    );
    expect(r.ok).toBe(false);
    expect(r.failure).toBe("google");
    expect(quickSyncMessage(r)).toEqual({
      tone: "warning",
      title: "Google Calendar non risponde. Riprova tra qualche minuto.",
      description: "1 spostata su Google",
    });
  });

  it("un'eccezione vale come fallimento", async () => {
    const r = await runQuickSync(fakeApi([new Error("fetch failed")], [PUSH_NONE]));
    expect(r).toMatchObject({ ok: false, failure: "google", changed: false });
    expect(quickSyncMessage(r).title).toBe(
      "Google Calendar non risponde. Riprova tra qualche minuto.",
    );
    expect(quickSyncMessage(r).description).toBeUndefined();
  });

  it("lista vuota di Google: non è un successo né «nessuna differenza»", async () => {
    const r = await runQuickSync(fakeApi([EMPTY_GUARD], [PUSH_NONE]));
    expect(r.ok).toBe(false);
    expect(r.failure).toBe("empty");
    expect(quickSyncOutcome(r)).toBe("empty");
    const m = quickSyncMessage(r);
    expect(m.title).toBe(
      "Google Calendar ha risposto senza eventi: per sicurezza nell'app non è cambiato niente.",
    );
    expect(m.title).not.toMatch(/nessuna differenza|allineato/i);
  });

  it("errore dell'app, da tutte e due le chiamate: il suo messaggio", async () => {
    for (const [pull, push] of [
      [{ ok: false, error: "Lettura prenotazioni fallita" }, PUSH_NONE],
      [PULL_NONE, { ok: false, error: "Permesso negato" }],
      [
        { ok: false, error: "Permesso negato" },
        { ok: false, error: "boom" },
      ],
    ] as Array<[ReconcileResult, RepairResult]>) {
      const r = await runQuickSync(fakeApi([pull], [push]));
      expect(r.failure).toBe("app");
      expect(quickSyncOutcome(r)).toBe("app");
      expect(quickSyncMessage(r).title).toBe(
        "Non riesco a leggere le sessioni dell'app. Riprova tra qualche minuto.",
      );
    }
  });

  it("conflitti e mancati ripristini in coda al messaggio", async () => {
    const r = await runQuickSync(
      fakeApi(
        [{ ok: true, cancelled: 0, moved: 1, conflicts: 2 }],
        [{ ok: true, created: 0, failed: 1, total: 1 }],
      ),
    );
    expect(r.ok).toBe(true);
    expect(quickSyncMessage(r)).toEqual({
      tone: "warning",
      title: "Sincronizzato con Google Calendar.",
      description: "1 spostata su Google · 1 evento non ricreato · 2 sessioni non aggiornate",
    });
    const only = await runQuickSync(
      fakeApi(
        [{ ok: true, cancelled: 0, moved: 0, conflicts: 1 }],
        [{ ok: true, created: 0, failed: 2, total: 2 }],
      ),
    );
    expect(only.changed).toBe(false);
    expect(quickSyncMessage(only)).toEqual({
      tone: "warning",
      title: "Sincronizzato con Google Calendar.",
      description: "2 eventi non ricreati · 1 sessione non aggiornata",
    });
  });
});

describe("sincronizzazione completa: il ciclo del ripristino", () => {
  it("si ferma quando non resta niente da trattare", async () => {
    const api = fakeApi([PULL_NONE], [PUSH_NONE]);
    const r = await runFullSync(api, { now: NOW, repairEstimate: 0 });
    expect(api.repairCalls()).toBe(1);
    expect(r.repair).toMatchObject({ ok: true, passes: 1, stop: "done", created: 0 });
  });

  it("si ferma quando una passata non crea niente: un ripristino che fallisce sempre fa una passata sola", async () => {
    const api = fakeApi([PULL_NONE], [{ ok: true, created: 0, failed: 3, total: 3 }]);
    const r = await runFullSync(api, { now: NOW, repairEstimate: 3 });
    expect(api.repairCalls()).toBe(1);
    expect(r.repair).toMatchObject({ passes: 1, stop: "no-progress", notCreated: 3 });
  });

  it("si ferma su un fallimento", async () => {
    const api = fakeApi(
      [PULL_NONE],
      [
        { ok: true, created: 50, failed: 0, total: 50 },
        { ok: false, error: "boom" },
      ],
    );
    const r = await runFullSync(api, { now: NOW, repairEstimate: 80 });
    expect(api.repairCalls()).toBe(2);
    expect(r.repair).toMatchObject({ ok: false, error: "boom", stop: "failure", created: 50 });
  });

  it("una passata fermata al tetto delle pagine (more) non è l'ultima, anche con meno di 50 (passata 11)", async () => {
    const api = fakeApi([PULL_NONE], [{ ok: true, created: 0, failed: 3, total: 3, more: true }]);
    const r = await runFullSync(api, { now: NOW, repairEstimate: 3 });
    expect(r.repair).toMatchObject({ stop: "no-progress", complete: false });
    const empty = await runFullSync(
      fakeApi([PULL_NONE], [{ ok: true, created: 0, failed: 0, total: 0, more: true }]),
      {
        now: NOW,
        repairEstimate: 0,
      },
    );
    expect(empty.repair).toMatchObject({ stop: "no-progress", complete: false });
    // senza more, la stessa passata è l'ultima
    const last = await runFullSync(
      fakeApi([PULL_NONE], [{ ok: true, created: 0, failed: 3, total: 3 }]),
      {
        now: NOW,
        repairEstimate: 3,
      },
    );
    expect(last.repair).toMatchObject({ stop: "no-progress", complete: true });
  });

  it("al massimo 20 passate", async () => {
    const api = fakeApi([PULL_NONE], [{ ok: true, created: 50, failed: 0, total: 50 }]);
    const r = await runFullSync(api, { now: NOW, repairEstimate: 2000 });
    expect(REPAIR_MAX_PASSES).toBe(20);
    expect(api.repairCalls()).toBe(20);
    expect(r.repair).toMatchObject({ passes: 20, stop: "limit", created: 1000 });
  });

  it("la riconciliazione riceve la finestra dal 1° gennaio a 90 giorni avanti, in una chiamata", async () => {
    const api = fakeApi([PULL_NONE], [PUSH_NONE]);
    await runFullSync(api, { now: NOW, repairEstimate: 0 });
    const expected = {
      timeMinISO: "2026-01-01T00:00:00.000Z",
      timeMaxISO: new Date(NOW.getTime() + 90 * 24 * 60 * 60_000).toISOString(),
    };
    expect(api.windows).toEqual([expected]);
    expect(fullSyncWindow(NOW)).toEqual(expected);
  });

  it("le fasi arrivano in ordine coi numeri giusti", async () => {
    const seen: FullSyncProgress[] = [];
    const api = fakeApi(
      [PULL_NONE],
      [
        { ok: true, created: 48, failed: 2, total: 50 },
        { ok: true, created: 10, failed: 2, total: 12 },
        { ok: true, created: 0, failed: 2, total: 2 },
      ],
    );
    const r = await runFullSync(api, {
      now: NOW,
      repairEstimate: 60,
      onProgress: (p) => seen.push(p),
    });
    expect(seen).toEqual([
      { phase: "repair", done: 0, total: 60 },
      { phase: "repair", done: 50, total: 60 },
      { phase: "repair", done: 60, total: 60 },
      { phase: "repair", done: 60, total: 60 },
      { phase: "reconcile" },
    ]);
    expect(r.repair).toMatchObject({ created: 58, notCreated: 2, stop: "no-progress" });
  });
});

function full(over: {
  reconcile?: ReconcileResult;
  repair?: Partial<FullSync["repair"]>;
}): FullSync {
  const repair = {
    ok: true,
    passes: 1,
    created: 0,
    notCreated: 0,
    stop: "done" as const,
    ...over.repair,
  };
  return {
    repair: {
      ...repair,
      complete:
        over.repair?.complete ??
        (repair.ok && (repair.stop === "done" || repair.stop === "no-progress")),
    },
    reconcile: over.reconcile ?? { ok: true, cancelled: 0, moved: 0, conflicts: 0, checked: 37 },
  };
}

describe("sincronizzazione completa: l'esito", () => {
  it("1 · riconciliazione fallita per un errore dell'app", () => {
    const o = fullSyncOutcome(
      full({
        reconcile: { ok: false, error: "Lettura prenotazioni fallita" },
        repair: { ok: false, stop: "failure", error: "Lettura prenotazioni fallita" },
      }),
    );
    expect(o).toEqual({
      kind: "app",
      tone: "danger",
      title: "Sincronizzazione non riuscita",
      lines: ["Non riesco a leggere le sessioni dell'app.", "Riprova più tardi."],
    });
    expect(fullSyncMeasure(full({ reconcile: { ok: false, error: "Permesso negato" } }))).toBe(
      "app",
    );
    // Il testo del §4.5, anche se il ripristino aveva creato eventi prima.
    expect(
      fullSyncOutcome(
        full({ reconcile: { ok: false, error: "Permesso negato" }, repair: { created: 3 } }),
      ).lines,
    ).toEqual(["Non riesco a leggere le sessioni dell'app.", "Riprova più tardi."]);
  });

  it("2 · riconciliazione fallita: mai «completata», anche col ripristino fallito", async () => {
    const r = await runFullSync(
      fakeApi([new Error("Lettura Google Calendar fallita")], [{ ok: false, error: "boom" }]),
      { now: NOW, repairEstimate: 0 },
    );
    const o = fullSyncOutcome(r);
    expect(o.kind).toBe("google");
    expect(o.title).toBe("Sincronizzazione non riuscita");
    expect(o.title).not.toMatch(/completata/);
    expect(o.lines).toEqual([
      "Google Calendar non risponde: spostamenti e cancellazioni fatti su Google non sono stati controllati.",
      "Riprova più tardi.",
    ]);
    expect(fullSyncMeasure(r)).toBe("google");
    const withCreated = fullSyncOutcome(
      full({ reconcile: { ok: false, error: "x" }, repair: { created: 3 } }),
    );
    expect(withCreated.lines).toEqual([
      "Google Calendar non risponde: spostamenti e cancellazioni fatti su Google non sono stati controllati.",
      "Nel frattempo 3 eventi sono stati ricreati su Google.",
      "Riprova più tardi.",
    ]);
    expect(
      fullSyncOutcome(full({ reconcile: { ok: false, error: "x" }, repair: { created: 1 } }))
        .lines[1],
    ).toBe("Nel frattempo 1 evento è stato ricreato su Google.");
  });

  it("3 · lista vuota di Google", () => {
    const r = full({ reconcile: EMPTY_GUARD, repair: { created: 2 } });
    expect(fullSyncOutcome(r)).toEqual({
      kind: "empty",
      tone: "danger",
      title: "Sincronizzazione non riuscita",
      lines: [
        "Google Calendar ha risposto senza eventi: per sicurezza nell'app non è cambiato niente.",
        "Nel frattempo 2 eventi sono stati ricreati su Google.",
        "Riprova più tardi.",
      ],
    });
    expect(fullSyncMeasure(r)).toBe("empty");
  });

  it("4 · ripristino fallito dopo passate riuscite, riconciliazione riuscita: in parte", async () => {
    const r = await runFullSync(
      fakeApi(
        [{ ok: true, cancelled: 0, moved: 0, conflicts: 1, checked: 37 }],
        [{ ok: true, created: 50, failed: 0, total: 50 }, new Error("boom")],
      ),
      { now: NOW, repairEstimate: 70 },
    );
    expect(fullSyncOutcome(r)).toEqual({
      kind: "partial",
      tone: "warning",
      title: "Sincronizzazione completata in parte",
      lines: [
        "Non è stato possibile ricreare su Google tutti gli eventi mancanti.",
        "Controllate 37 sessioni in programma dal 1° gennaio.",
        "Nessuna differenza con Google.",
        "50 eventi ricreati su Google.",
        "1 sessione non aggiornata per un errore: riprova più tardi.",
      ],
    });
    expect(fullSyncMeasure(r)).toBe("ok");
    const first = fullSyncOutcome(full({ repair: { ok: false, stop: "failure", passes: 1 } }));
    expect(first.lines[3]).toBe("Nessun evento ricreato su Google.");
    expect(fullSyncOutcome(full({ repair: { stop: "limit", created: 1000 } })).kind).toBe(
      "partial",
    );
  });

  it("4 · una passata piena che non crea niente lascia il ripristino a metà", async () => {
    const r = await runFullSync(
      fakeApi(
        [{ ok: true, cancelled: 0, moved: 0, conflicts: 0, checked: 5 }],
        [{ ok: true, created: 0, failed: 50, total: 50 }],
      ),
      { now: NOW, repairEstimate: 120 },
    );
    expect(r.repair).toMatchObject({ passes: 1, stop: "no-progress", complete: false });
    expect(fullSyncOutcome(r)).toEqual({
      kind: "partial",
      tone: "warning",
      title: "Sincronizzazione completata in parte",
      lines: [
        "Non è stato possibile ricreare su Google tutti gli eventi mancanti.",
        "Controllate 5 sessioni in programma dal 1° gennaio.",
        "Nessuna differenza con Google.",
        "Nessun evento ricreato su Google.",
        "50 eventi non ricreati: riprova più tardi.",
      ],
    });
    // Una passata non piena le ha provate tutte: è completa, con problemi.
    const small = await runFullSync(
      fakeApi([PULL_NONE], [{ ok: true, created: 0, failed: 3, total: 3 }]),
      { now: NOW, repairEstimate: 3 },
    );
    expect(small.repair.complete).toBe(true);
    expect(fullSyncOutcome(small).kind).toBe("problems");
  });

  it("5 · riuscita con problemi", () => {
    const o = fullSyncOutcome(
      full({
        reconcile: { ok: true, cancelled: 1, moved: 0, conflicts: 2, checked: 1 },
        repair: { created: 0, notCreated: 1, stop: "no-progress" },
      }),
    );
    expect(o).toEqual({
      kind: "problems",
      tone: "warning",
      title: "Sincronizzazione completata con qualche problema",
      lines: [
        "Controllata 1 sessione in programma dal 1° gennaio.",
        "Su Google risultava 1 annullata, e l'app l'ha aggiornata.",
        "Nessun evento ricreato su Google.",
        "1 evento non ricreato: riprova più tardi.",
        "2 sessioni non aggiornate per un errore: riprova più tardi.",
      ],
    });
  });

  it("6 · riuscita", () => {
    expect(fullSyncOutcome(full({}))).toEqual({
      kind: "done",
      tone: "success",
      title: "Sincronizzazione completata",
      lines: [
        "Controllate 37 sessioni in programma dal 1° gennaio.",
        "Nessuna differenza con Google.",
        "Nessun evento da ricreare su Google.",
      ],
    });
    const lines = fullSyncOutcome(
      full({
        reconcile: { ok: true, cancelled: 2, moved: 0, conflicts: 0, checked: 12 },
        repair: { created: 1 },
      }),
    ).lines;
    expect(lines).toEqual([
      "Controllate 12 sessioni in programma dal 1° gennaio.",
      "Su Google risultavano 2 annullate, e l'app le ha aggiornate.",
      "1 evento ricreato su Google.",
    ]);
  });

  it("la frase delle sovrapposizioni solo con spostate", () => {
    const text = (moved: number, cancelled: number) =>
      fullSyncOutcome(full({ reconcile: { ok: true, cancelled, moved, conflicts: 0, checked: 9 } }))
        .lines[1];
    expect(text(2, 1)).toBe(
      "Su Google risultavano 2 spostate e 1 annullata, e l'app le ha allineate, tranne gli spostamenti che finirebbero sopra un'altra sessione: quelli restano all'orario di prima.",
    );
    expect(text(1, 0)).toBe(
      "Su Google risultava 1 spostata, e l'app l'ha allineata, tranne se lo spostamento finirebbe sopra un'altra sessione: in quel caso resta all'orario di prima.",
    );
    expect(text(1, 2)).toBe(
      "Su Google risultavano 1 spostata e 2 annullate, e l'app le ha allineate, tranne se lo spostamento finirebbe sopra un'altra sessione: in quel caso resta all'orario di prima.",
    );
    expect(text(0, 3)).not.toMatch(/sopra un'altra sessione/);
    expect(text(0, 0)).toBe("Nessuna differenza con Google.");
  });

  it("precedenza: vince il primo caso che vale", () => {
    const kind = (f: FullSync) => fullSyncOutcome(f).kind;
    // Errore dell'app prima di Google, Google prima della lista vuota e del ripristino.
    expect(
      kind(full({ reconcile: { ok: false, error: "Permesso negato" }, repair: { ok: false } })),
    ).toBe("app");
    expect(kind(full({ reconcile: { ok: false, error: "x" }, repair: { ok: false } }))).toBe(
      "google",
    );
    expect(kind(full({ reconcile: EMPTY_GUARD, repair: { ok: false, stop: "failure" } }))).toBe(
      "empty",
    );
    expect(
      kind(
        full({
          reconcile: { ok: true, cancelled: 0, moved: 0, conflicts: 3, checked: 5 },
          repair: { ok: false, stop: "failure" },
        }),
      ),
    ).toBe("partial");
  });
});

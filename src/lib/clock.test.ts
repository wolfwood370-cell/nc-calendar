// Audit V8, passata 10 (C11): un'ora sola per le pagine del coach.
// useNow era definito due volte (Panoramica e Calendario) e la lista Clienti
// leggeva new Date() in un useMemo che dipendeva solo dai dati: la
// «Prossima sessione» non avanzava. Qui: una sola definizione, le pagine che
// la usano, la lista che la mette nelle dipendenze, e cosa cambia quando
// l'orologio supera l'ora di una sessione.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildClientRows, type ListClient } from "@/lib/client-list";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

describe("V8 · un'ora sola", () => {
  it("useNow è definito una volta, in hooks/use-now.ts", () => {
    // \s+ e non uno spazio: così il grep di C11 non conta questa riga.
    const defs = sources("src").filter((f) => /function\s+useNow\b/.test(readFileSync(f, "utf8")));
    expect(defs.map((f) => f.replaceAll("\\", "/"))).toEqual(["src/hooks/use-now.ts"]);
  });

  it.each([
    "src/components/overview-desktop.tsx",
    "src/components/calendar-desktop.tsx",
    "src/routes/trainer.clients.index.tsx",
    "src/components/client-profile-desktop.tsx",
  ])("%s legge l'ora da useNow", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toContain('import { useNow } from "@/hooks/use-now";');
    expect(src).toMatch(/const now = useNow\(\);/);
  });
});

describe("V8 · la lista Clienti segue l'ora", () => {
  /** La chiamata useMemo(() => buildClientRows(…), [deps]) della route, sull'albero. */
  function clientRowsMemo() {
    const file = "src/routes/trainer.clients.index.tsx";
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const found: ts.CallExpression[] = [];
    const walk = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        n.expression.getText(sf) === "useMemo" &&
        n.arguments[0]?.getText(sf).includes("buildClientRows(")
      ) {
        found.push(n);
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return { sf, found };
  }

  it("buildClientRows riceve now, e now è fra le dipendenze del memo", () => {
    const { sf, found } = clientRowsMemo();
    expect(found).toHaveLength(1);
    const memo = found[0]!;
    let call: ts.CallExpression | undefined;
    const find = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.expression.getText(sf) === "buildClientRows") call = n;
      ts.forEachChild(n, find);
    };
    find(memo.arguments[0]!);
    expect(call?.arguments[1]?.getText(sf)).toBe("now");
    const deps = memo.arguments[1];
    expect(deps && ts.isArrayLiteralExpression(deps)).toBe(true);
    const names = (deps as ts.ArrayLiteralExpression).elements.map((e) => e.getText(sf));
    expect(names).toContain("now");
  });

  it("avanzando l'orologio oltre l'ora di una sessione, la «Prossima sessione» cambia", () => {
    const client: ListClient = {
      id: "c1",
      full_name: "Cliente di prova",
      email: null,
      phone: null,
      pack_label: null,
      status: "active",
      path_type: "free",
      auto_renew_blocks: false,
    };
    const at = (iso: string) => ({
      client_id: "c1",
      event_type_id: null,
      session_type: "PT Session",
      status: "scheduled",
      scheduled_at: iso,
    });
    const data = {
      clients: [client],
      blocks: [],
      allocations: [],
      bookings: [at("2026-09-25T11:00:00+02:00"), at("2026-09-29T09:00:00+02:00")],
      extras: [],
    };
    const before = buildClientRows(data, new Date("2026-09-25T10:40:00+02:00"))[0];
    const after = buildClientRows(data, new Date("2026-09-25T11:10:00+02:00"))[0];
    expect(before?.nextSessionMs).toBe(new Date("2026-09-25T11:00:00+02:00").getTime());
    expect(after?.nextSessionMs).toBe(new Date("2026-09-29T09:00:00+02:00").getTime());
  });
});

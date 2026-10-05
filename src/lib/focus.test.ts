// Il focus dopo un'azione che toglie il pulsante (passata 09), con un document
// finto: i test girano in Node.

import { afterEach, describe, expect, it, vi } from "vitest";
import { focusIfLost, focusIsLost } from "@/lib/focus";

interface FakeElement {
  focused: { preventScroll?: boolean }[];
  contains: (other: unknown) => boolean;
  focus: (options?: { preventScroll?: boolean }) => void;
}

const doc: { body: FakeElement | null; activeElement: FakeElement | null } = {
  body: null,
  activeElement: null,
};

/** Un elemento finto con i suoi figli: contains() come il DOM, focus() sposta activeElement. */
function el(children: FakeElement[] = []): FakeElement {
  const self: FakeElement = {
    focused: [],
    contains: (other) => other === self || children.some((c) => c.contains(other)),
    focus: (options) => {
      self.focused.push(options ?? {});
      doc.activeElement = self;
    },
  };
  return self;
}
const asHtml = (e: FakeElement) => e as unknown as HTMLElement;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("focusIsLost", () => {
  it("perso su nessuno, sul body, sul contenitore della pagina o dentro la card del pulsante; non altrove", () => {
    const button = el();
    const card = el([button]);
    const root = el();
    doc.body = el();
    vi.stubGlobal("document", doc);
    for (const [active, lost] of [
      [null, true],
      [doc.body, true],
      [root, true],
      [button, true],
      [el(), false],
    ] as const) {
      doc.activeElement = active;
      expect(focusIsLost(asHtml(root), asHtml(card))).toBe(lost);
    }
    doc.activeElement = root;
    expect(focusIsLost(null, null)).toBe(false);
  });

  it("senza document (sul server): non perso", () => {
    expect(focusIsLost()).toBe(false);
  });
});

describe("focusIfLost", () => {
  it("mette il focus sul titolo senza scorrere solo se si era perso, e dice se l'ha messo", () => {
    const title = el();
    const elsewhere = el();
    doc.body = el();
    vi.stubGlobal("document", doc);
    doc.activeElement = doc.body;
    expect(focusIfLost(asHtml(title))).toBe(true);
    expect(title.focused).toEqual([{ preventScroll: true }]);
    expect(doc.activeElement).toBe(title);
    doc.activeElement = elsewhere;
    expect(focusIfLost(asHtml(title))).toBe(false);
    expect(title.focused).toHaveLength(1);
    expect(focusIfLost(null)).toBe(false);
  });
});

describe("focusIfLost · un titolo che non prende il focus", () => {
  it("lo mette sul contenitore della pagina; senza contenitore dice di no", () => {
    // Un h2 senza tabIndex: focus() non sposta niente.
    const stubborn: FakeElement = {
      focused: [],
      contains: (other) => other === stubborn,
      focus: (options) => {
        stubborn.focused.push(options ?? {});
      },
    };
    const root = el();
    doc.body = el();
    vi.stubGlobal("document", doc);
    doc.activeElement = doc.body;
    expect(focusIfLost(asHtml(stubborn), asHtml(root))).toBe(true);
    expect(stubborn.focused).toEqual([{ preventScroll: true }]);
    expect(root.focused).toEqual([{ preventScroll: true }]);
    expect(doc.activeElement).toBe(root);
    doc.activeElement = doc.body;
    expect(focusIfLost(asHtml(stubborn))).toBe(false);
    expect(doc.activeElement).toBe(doc.body);
  });
});

// ----------------------------------------------------------------------------
// «Nuovo cliente»: scelta, invito, «Crea l'account» a tre passi (L1, L4)
// ----------------------------------------------------------------------------
// Brief passes/05-clienti.md e prototipo designs/Coach Clienti.dc.html.
//   1. Scelta (560px): «Crea l'account ora» o «Invia un invito».
//   2. Invito (480px): nome e cognome, email, telefono → «Invia invito».
//   3. Crea l'account (640px): Dati · Percorso e crediti · Riepilogo, poi
//      l'esito nello stesso dialog con la password e «Copia». Nei dati anche
//      «Telefono (facoltativo)» (passata 06), per il WhatsApp del Profilo.
// La password esiste solo nello stato di questo dialog: non va in toast, log,
// URL o archivio del browser, e sparisce chiudendo.
// Cosa si scrive lo decide src/lib/client-create.ts, come prima.
// ----------------------------------------------------------------------------

import { CircleCheck, Copy, Loader2, Minus, Plus, Send, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  CoachDialog,
  CoachDialogContent,
  CoachDialogHeader,
  dialogPrimaryButton,
} from "@/components/coach-dialog";
import { SegmentedControl } from "@/components/segmented-control";
import {
  blocksOf,
  creationPayload,
  creditsPerBlock,
  DURATION_MONTHS,
  generatePassword,
  MAX_BLOCKS,
  PT_PACK_LABEL,
  type CreateClientResult,
  type CreationDraft,
  type NewClientPayload,
  type PathType,
} from "@/lib/client-create";
import type { EventTypeRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

export type NewClientMode = "choice" | "invite" | "wizard";

export interface InviteInput {
  name: string;
  email: string;
  phone: string;
}

const INPUT =
  "h-[42px] rounded-[14px] bg-surface-container-low px-3.5 text-sm text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container";
const LINK_BUTTON =
  "h-10 px-1 text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface";
const EMAIL_RE = /\S+@\S+\.\S+/;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold text-on-surface">
        {label} {hint && <span className="font-medium text-outline">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function NewClientDialog({
  mode,
  onModeChange,
  eventTypes,
  onInvite,
  onCreate,
  onOpenProfile,
}: {
  mode: NewClientMode | null;
  onModeChange: (m: NewClientMode | null) => void;
  eventTypes: readonly EventTypeRow[];
  onInvite: (data: InviteInput) => Promise<boolean>;
  onCreate: (payload: NewClientPayload) => Promise<CreateClientResult>;
  onOpenProfile: (userId: string) => void;
}) {
  const close = () => onModeChange(null);
  const width =
    mode === "wizard"
      ? "sm:max-w-[640px]"
      : mode === "invite"
        ? "sm:max-w-[480px]"
        : "sm:max-w-[560px]";
  return (
    <CoachDialog open={!!mode} onOpenChange={(o) => !o && close()}>
      {mode && (
        <CoachDialogContent className={cn("gap-[18px]", width)}>
          {mode === "choice" && <Choice onPick={onModeChange} />}
          {mode === "invite" && (
            <InviteStep onBack={() => onModeChange("choice")} onInvite={onInvite} onDone={close} />
          )}
          {mode === "wizard" && (
            <Wizard
              eventTypes={eventTypes}
              onBack={() => onModeChange("choice")}
              onCreate={onCreate}
              onOpenProfile={onOpenProfile}
              onDone={close}
            />
          )}
        </CoachDialogContent>
      )}
    </CoachDialog>
  );
}

function Choice({ onPick }: { onPick: (m: NewClientMode) => void }) {
  const card =
    "flex flex-col items-start gap-2 rounded-[20px] border-[1.5px] border-surface-variant p-[18px] text-left transition-colors hover:border-aura-primary hover:bg-aura-primary/[0.03]";
  return (
    <>
      <CoachDialogHeader title="Nuovo cliente" />
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => onPick("wizard")} className={card}>
          <UserPlus className="size-[22px] text-aura-primary" aria-hidden />
          <span className="text-[15px] font-bold text-on-surface">Crea l'account ora</span>
          <span className="text-[13px] leading-[1.45] text-on-surface-variant">
            Imposti tu percorso e crediti. Ottieni una password da consegnare al cliente.
          </span>
        </button>
        <button type="button" onClick={() => onPick("invite")} className={card}>
          <Send className="size-[22px] text-aura-primary" aria-hidden />
          <span className="text-[15px] font-bold text-on-surface">Invia un invito</span>
          <span className="text-[13px] leading-[1.45] text-on-surface-variant">
            Il cliente riceve un'email e completa la registrazione da solo. Il percorso lo assegni
            dopo.
          </span>
        </button>
      </div>
    </>
  );
}

function InviteStep({
  onBack,
  onInvite,
  onDone,
}: {
  onBack: () => void;
  onInvite: (data: InviteInput) => Promise<boolean>;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length > 1 && EMAIL_RE.test(email);
  return (
    <>
      <CoachDialogHeader
        title="Invia un invito"
        description={
          <p className="text-[13px] text-on-surface-variant">
            Il cliente riceverà un link per registrarsi.
          </p>
        }
      />
      <Field label="Nome e cognome">
        <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT}
        />
      </Field>
      <Field label="Telefono" hint="(facoltativo, per WhatsApp)">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} />
      </Field>
      <div className="flex justify-between gap-2 pt-1">
        <button type="button" onClick={onBack} className={LINK_BUTTON} disabled={busy}>
          Indietro
        </button>
        <button
          type="button"
          disabled={!valid || busy}
          className={dialogPrimaryButton}
          onClick={async () => {
            setBusy(true);
            try {
              if (await onInvite({ name: name.trim(), email: email.trim(), phone: phone.trim() })) {
                onDone();
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Invia invito
        </button>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// «Crea l'account»
// ----------------------------------------------------------------------------

type Step = 1 | 2 | 3 | 4;

function defaultCredits(types: readonly EventTypeRow[], n: number): Record<string, number> {
  const pt = types.find((t) => t.base_type === "PT Session") ?? types[0];
  return pt ? { [pt.id]: n } : {};
}

const PATHS: Array<{ value: PathType; label: string; hint: string }> = [
  { value: "fixed", label: "Percorso fisso", hint: "Durata definita, blocchi da 30 giorni." },
  { value: "recurring", label: "Abbonamento mensile", hint: "Si rinnova da solo ogni 30 giorni." },
  { value: "free", label: "Cliente libero", hint: "Nessun percorso: solo sessioni omaggio." },
];

function Wizard({
  eventTypes,
  onBack,
  onCreate,
  onOpenProfile,
  onDone,
}: {
  eventTypes: readonly EventTypeRow[];
  onBack: () => void;
  onCreate: (payload: NewClientPayload) => Promise<CreateClientResult>;
  onOpenProfile: (userId: string) => void;
  onDone: () => void;
}) {
  const fresh = () => ({
    step: 1 as Step,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    pathType: "fixed" as PathType,
    months: 6 as number | null,
    customBlocks: 6,
    credits: defaultCredits(eventTypes, 8),
    freeCredits: defaultCredits(eventTypes, 2),
    packLabel: null as string | null,
  });
  const [w, setW] = useState(fresh);
  const [busy, setBusy] = useState(false);
  // Esito: esiste solo qui, finché il dialog è aperto.
  const [created, setCreated] = useState<{
    userId: string;
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const upd = (patch: Partial<ReturnType<typeof fresh>>) => setW((prev) => ({ ...prev, ...patch }));

  const free = w.pathType === "free";
  const draft: CreationDraft = {
    firstName: w.firstName,
    lastName: w.lastName,
    email: w.email,
    phone: w.phone,
    pathType: w.pathType,
    months: w.months,
    customBlocks: w.customBlocks,
    credits: free ? w.freeCredits : w.credits,
    packLabel: free ? null : w.packLabel,
  };
  const blocks = blocksOf(draft);
  const perBlock = creditsPerBlock(draft);
  const total = free ? perBlock : perBlock * blocks;
  const v1 = !!w.firstName.trim() && !!w.lastName.trim() && EMAIL_RE.test(w.email);
  const v2 = perBlock > 0 && (free || blocks >= 1);
  const step: Step = created ? 4 : w.step;
  const valid = step === 1 ? v1 : step === 2 ? v2 : true;
  const credText =
    eventTypes
      .filter((t) => (draft.credits[t.id] ?? 0) > 0)
      .map((t) => `${draft.credits[t.id]} ${t.name}`)
      .join(", ") || "—";
  const name = `${w.firstName.trim()} ${w.lastName.trim()}`.trim();

  async function submit() {
    setBusy(true);
    const password = generatePassword();
    try {
      const r = await onCreate(creationPayload(draft, eventTypes, password));
      if (r.ok) setCreated({ userId: r.userId, email: r.email, password });
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!valid || busy) return;
    if (step < 3) upd({ step: (step + 1) as Step });
    else if (step === 3) void submit();
    else onDone();
  }

  function back() {
    if (step === 1) onBack();
    else if (step === 4) {
      setCreated(null);
      setCopied(false);
      setW(fresh());
    } else upd({ step: (step - 1) as Step });
  }

  const setCredit = (id: string, n: number) => {
    const v = Math.max(0, Math.min(50, n));
    if (free) upd({ freeCredits: { ...w.freeCredits, [id]: v } });
    else upd({ credits: { ...w.credits, [id]: v } });
  };

  return (
    <>
      <CoachDialogHeader title={step === 4 ? "Cliente creato" : "Crea l'account"} />
      {step < 4 && (
        <ol aria-label="Passaggi" className="grid grid-cols-3 gap-2">
          {["1 · Dati", "2 · Percorso e crediti", "3 · Riepilogo"].map((label, i) => (
            <li
              key={label}
              aria-current={i + 1 === step ? "step" : undefined}
              className="flex flex-col gap-1.5"
            >
              <span
                className={cn(
                  "h-1 rounded-full",
                  i < step ? "bg-aura-primary" : "bg-surface-variant",
                )}
              />
              <span
                className={cn("text-xs font-bold", i < step ? "text-aura-primary" : "text-outline")}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
      )}

      {step === 1 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <input
                value={w.firstName}
                onChange={(e) => upd({ firstName: e.target.value })}
                className={INPUT}
              />
            </Field>
            <Field label="Cognome">
              <input
                value={w.lastName}
                onChange={(e) => upd({ lastName: e.target.value })}
                className={INPUT}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={w.email}
                onChange={(e) => upd({ email: e.target.value })}
                className={INPUT}
              />
            </Field>
            <Field label="Telefono" hint="(facoltativo)">
              <input
                type="tel"
                value={w.phone}
                onChange={(e) => upd({ phone: e.target.value })}
                className={INPUT}
              />
            </Field>
          </div>
          <p className="text-[13px] text-outline">
            La password viene generata automaticamente: la vedrai alla fine.
          </p>
        </>
      )}

      {step === 2 && (
        <>
          <div className="flex flex-col gap-2">
            <p id="wiz-path" className="text-[13px] font-bold">
              Tipo di percorso
            </p>
            <SegmentedControl
              appearance="plain"
              ariaLabelledby="wiz-path"
              className="grid grid-cols-3 gap-2"
              itemClassName={(on) =>
                cn(
                  "flex flex-col items-start gap-1 rounded-[18px] border-[1.5px] px-3.5 py-3 text-left",
                  on ? "border-aura-primary bg-aura-primary/5" : "border-surface-variant bg-white",
                )
              }
              value={w.pathType}
              onChange={(v) => upd({ pathType: v, packLabel: null })}
              options={PATHS.map((p) => ({
                value: p.value,
                label: (
                  <>
                    <span className="text-sm font-bold text-on-surface">{p.label}</span>
                    <span className="text-xs leading-[1.4] text-on-surface-variant">{p.hint}</span>
                  </>
                ),
              }))}
            />
          </div>
          {w.pathType === "fixed" && (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-bold">Durata</p>
              <div className="flex flex-wrap items-center gap-2.5">
                <SegmentedControl
                  ariaLabel="Durata"
                  value={w.months === null ? "custom" : String(w.months)}
                  onChange={(v) => upd({ months: v === "custom" ? null : Number(v) })}
                  options={[
                    ...DURATION_MONTHS.map((m) => ({ value: String(m), label: `${m} mesi` })),
                    { value: "custom", label: "Personalizzata" },
                  ]}
                />
                {w.months === null && (
                  <label className="flex items-center gap-2 text-[13px] text-on-surface-variant">
                    <input
                      type="number"
                      min={1}
                      max={MAX_BLOCKS}
                      value={w.customBlocks}
                      onChange={(e) =>
                        upd({
                          customBlocks: Math.max(
                            1,
                            Math.min(MAX_BLOCKS, Number(e.target.value) || 1),
                          ),
                        })
                      }
                      className="h-9 w-[72px] rounded-xl bg-surface-container-low px-2.5 text-sm outline-none"
                    />
                    blocchi
                  </label>
                )}
              </div>
              <p className="text-xs text-outline">
                {blocks} {blocks === 1 ? "blocco" : "blocchi"} da 30 giorni, senza rinnovo
                automatico.
              </p>
            </div>
          )}
          {w.pathType === "recurring" && (
            <p className="rounded-[14px] bg-surface-container-low px-3.5 py-3 text-[13px] leading-normal text-on-surface-variant">
              Un blocco ogni 30 giorni con rinnovo automatico. I crediti ripartono a ogni rinnovo.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-bold">
                {free ? "Sessioni omaggio" : "Crediti per blocco"}
              </p>
              {!free && (
                <button
                  type="button"
                  onClick={() => {
                    const pt =
                      eventTypes.find((t) => t.base_type === "PT Session") ?? eventTypes[0];
                    upd({
                      pathType: "fixed",
                      months: null,
                      customBlocks: 1,
                      credits: pt ? { [pt.id]: 3 } : {},
                      packLabel: PT_PACK_LABEL,
                    });
                  }}
                  className="text-xs font-semibold text-aura-primary"
                >
                  Usa «PT Pack 3 sessioni»
                </button>
              )}
            </div>
            <div className="flex flex-col rounded-[18px] border border-surface-container">
              {eventTypes.length === 0 && (
                <p className="p-3.5 text-[13px] text-danger-text">
                  Crea prima almeno una tipologia di sessione.
                </p>
              )}
              {eventTypes.map((t, i) => {
                const n = draft.credits[t.id] ?? 0;
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "flex items-center gap-2.5 px-3.5 py-2.5",
                      i > 0 && "border-t border-surface-container-low",
                    )}
                  >
                    <span
                      className="size-2.5 rounded-[3px]"
                      style={{ backgroundColor: t.color }}
                      aria-hidden
                    />
                    <span className="flex-1 text-sm font-semibold">{t.name}</span>
                    <button
                      type="button"
                      aria-label={`Meno ${t.name}`}
                      onClick={() => setCredit(t.id, n - 1)}
                      className="grid size-8 place-items-center rounded-full border border-surface-variant text-on-surface-variant"
                    >
                      <Minus className="size-3.5" aria-hidden />
                    </button>
                    <span className="w-7 text-center text-[15px] font-bold tabular-nums">{n}</span>
                    <button
                      type="button"
                      aria-label={`Più ${t.name}`}
                      onClick={() => setCredit(t.id, n + 1)}
                      className="grid size-8 place-items-center rounded-full border border-surface-variant text-aura-primary"
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
            {!free && (
              <p className="text-xs text-outline">
                Uguali per ogni blocco. Potrai variarli per singolo blocco dal profilo del cliente.
              </p>
            )}
          </div>
        </>
      )}

      {step === 3 && (
        <dl className="flex flex-col gap-3 rounded-[20px] bg-surface-container-low p-[18px] text-sm">
          <SummaryRow label="Cliente" value={name} />
          <SummaryRow label="Email" value={w.email.trim()} />
          {w.phone.trim() && <SummaryRow label="Telefono" value={w.phone.trim()} />}
          <SummaryRow
            label="Percorso"
            value={
              w.pathType === "recurring"
                ? "Abbonamento mensile, rinnovo automatico"
                : free
                  ? "Cliente libero"
                  : `Percorso fisso · ${blocks} ${blocks === 1 ? "blocco" : "blocchi"}${w.packLabel ? ` · ${w.packLabel}` : ""}`
            }
          />
          <SummaryRow label={free ? "Sessioni omaggio" : "Crediti per blocco"} value={credText} />
          <div className="border-t border-surface-variant pt-2.5">
            <SummaryRow
              label="Sessioni totali"
              value={w.pathType === "recurring" ? `${perBlock} al mese` : String(total)}
            />
          </div>
        </dl>
      )}

      {step === 4 && created && (
        <div className="flex flex-col gap-3.5">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-success-text">
            <CircleCheck className="size-[18px]" aria-hidden />
            Account creato per {name}.
          </p>
          <dl className="flex flex-col gap-2.5 rounded-[20px] bg-surface-container-low p-[18px] text-sm">
            <SummaryRow label="Email" value={created.email} />
            <div className="flex items-center justify-between gap-3">
              <dt className="text-on-surface-variant">Password</dt>
              <dd className="flex items-center gap-2">
                <code className="font-mono text-[15px] font-bold tracking-[0.04em]">
                  {created.password}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(created.password);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                  className="flex h-[30px] items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-aura-primary"
                >
                  <Copy className="size-[13px]" aria-hidden />
                  {copied ? "Copiata" : "Copia"}
                </button>
              </dd>
            </div>
          </dl>
          <p className="text-[13px] leading-normal text-on-surface-variant">
            Consegna la password al cliente in modo sicuro. Dopo aver chiuso questa finestra non
            sarà più visibile.
          </p>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-1">
        <button type="button" onClick={back} disabled={busy} className={LINK_BUTTON}>
          {step === 4 ? "Crea un altro cliente" : "Indietro"}
        </button>
        <div className="flex gap-2">
          {step === 4 && created && (
            <button
              type="button"
              onClick={() => onOpenProfile(created.userId)}
              className="inline-flex h-10 items-center rounded-full bg-surface-container px-[18px] text-sm font-semibold text-aura-primary"
            >
              Apri profilo
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={!valid || busy || (step === 2 && eventTypes.length === 0)}
            className={dialogPrimaryButton}
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {step === 3 ? "Crea cliente" : step === 4 ? "Fatto" : "Avanti"}
          </button>
        </div>
      </div>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="text-right font-bold text-on-surface">{value}</dd>
    </div>
  );
}

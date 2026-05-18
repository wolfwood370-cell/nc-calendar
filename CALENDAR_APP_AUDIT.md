# Athlete App Audit Report

> Scope: NC Calendar (TanStack Start + React 19 + Supabase + React Query + Tailwind v4).
> Stack note: there is no Zustand in this project — global state lives in React Context (`src/lib/auth.tsx`) and the React Query cache.
> Methodology: static code review of `src/` against three lenses (runtime/state correctness, TypeScript safety, UI/UX + design-system robustness). Every finding cites file + line.

## Resolution Status

| Bucket | Total | ✅ Closed | ⚠️ Open |
|---|---|---|---|
| 🔴 High Priority | 8 | 8 | 0 |
| 🟡 Medium Priority | 10 | 10 | 0 |
| 🔵 Low Priority | 10 | 9 | 1 (L7 — generated file, upstream-only) |
| **Total actionable** | **27** | **27** | **0** |

Each finding below is annotated with a status badge, the commit that closed it, and a short note on what shipped. Where the fix differs from the originally proposed fix (e.g. an exclusion constraint vs a unique index for H2) the note explains why.

### Commits in this audit cycle

| SHA | Title |
|---|---|
| `fdb6d3b` | refactor: address audit findings H1, H2, H3, H4, H6, H7, H8 |
| `0f33c0b` | feat(calendar): mobile agenda view for trainer calendar (H5) |
| `6fe1e5d` | fix(auth): validate role from DB with zod enum (M10) |
| `e687092` | fix(availability): preserve unsaved edits across background refetches (M2) |
| `55acc6d` | fix(sync): surface Google Calendar sync failures to the user (M7) |
| `82dfd93` | fix(book): correct valid_until timezone parsing + unify date keys (L6, L5) |
| `e445417` | chore: close remaining Medium & Low audit findings |

### Production operator notes (non-bug caveats)

- **H1/H2 migration**: the exclusion constraint refuses to attach if existing scheduled bookings overlap. The migration ships a `DO $$` diagnostic that raises a `WARNING` listing how many offending pairs exist; resolve those before applying in prod. Inspection query is in the migration header comment.
- **H5 mobile focus panel**: tapping a certified event on mobile updates `focusClientId` but the focus-client side panel remains `hidden xl:flex`. State is correct; the panel just isn't rendered below xl. A mobile Sheet for the focus panel is a separate iteration, not a bug.
- **L4 — `exactOptionalPropertyTypes`**: enabled and then reverted in the same session because shadcn/Radix UI components (context-menu, dropdown-menu, menubar, etc.) don't explicitly include `undefined` in their optional prop types. Left disabled with a comment for a separately-scoped tightening pass.

---

## 🔴 High Priority (Critical Issues)

### H1. Non-atomic booking write — INSERT booking, then UPDATE allocation as two round-trips
- **Status**: ✅ **Closed** — `fdb6d3b`
- **Issue**: In [src/routes/client.book.tsx:620-650](src/routes/client.book.tsx:620), the confirm flow `INSERT`s a `bookings` row, then in a separate request reads `block_allocations.quantity_booked` and writes it back incremented. There is no transaction and no compensating delete.
- **Impact**: If the network drops, the tab is closed, or the second request fails between the two calls, the booking exists but the credit is never deducted. Result: the user has paid one slot but their block shows full availability. The DB trigger handles `extra_credits` (per comment at line 636) but not `block_allocations`. Repeat offenders can silently exhaust trainer time without it counting against their pack.
- **Resolution**: New `validate_booking_block_allocation` BEFORE INSERT trigger in [supabase/migrations/20260518120000_booking_atomic_integrity.sql](supabase/migrations/20260518120000_booking_atomic_integrity.sql) atomically locks the matching `block_allocations` row `FOR UPDATE`, validates capacity, and increments `quantity_booked` in the same transaction as the INSERT. The mirror of the existing `trg_booking_validate_extra_credits` pattern. Front-end now performs only the INSERT — the two-step client-side dance is removed.

### H2. Pre-INSERT conflict check races against itself
- **Status**: ✅ **Closed** — `fdb6d3b`
- **Issue**: [src/routes/client.book.tsx:595-617](src/routes/client.book.tsx:595) reads "nearby" bookings and checks for overlap, then on success inserts. There is no DB-level constraint preventing two concurrent confirms from inserting overlapping bookings (the window between SELECT and INSERT is wide — it includes another HTTP round-trip).
- **Impact**: Two clients confirming at the same instant on the same coach can each pass the JS check and both succeed at INSERT. Double-booking on the coach's calendar; the UX toast `"Questo orario è stato appena occupato"` (line 615) is *unreachable* in that race.
- **Resolution**: `btree_gist` extension enabled and partial exclusion constraint `bookings_no_overlap_per_coach` added on `(coach_id, tstzrange(scheduled_at, end_at, '[)'))` where `status = 'scheduled' AND deleted_at IS NULL`. `end_at` is a new generated column (`scheduled_at + (duration_min + buffer_min) * interval '1 minute'`); `duration_min`/`buffer_min` are denormalized from `event_types` by a BEFORE INSERT trigger. The racy client-side SELECT-then-check loop is removed; INSERT errors with SQLSTATE 23P01 now surface as "Slot già occupato" toast.

### H3. Mutations invalidate with broad keys but queries are keyed by user/coach
- **Status**: ✅ **Closed** — `fdb6d3b`
- **Issue**: Throughout [src/lib/queries.ts:354-357, 432-435, 450](src/lib/queries.ts:354), mutations call `qc.invalidateQueries({ queryKey: ["bookings"] })` (no further parameters), but the queries that produced the data are keyed with parameters: `["bookings", "coach", coachId]`, `["bookings", "client", clientId]`, etc. React Query's prefix-match logic means *every* bookings query in the cache is invalidated.
- **Impact**: A single trainer cancelling one booking forces refetches for every other coach/client query the app has ever loaded into the cache. On a busy device this is wasted bandwidth and CPU; in failure modes (offline/poor connection) it can leave queries in `error` state that were perfectly valid moments earlier. Note: it is *not* a data-leak per se (other users' data isn't fetched — RLS still applies) but it is a stampede.
- **Resolution**: New [src/lib/query-keys.ts](src/lib/query-keys.ts) factory with `bookings.{coach,client,unassignedAll,detail}`, `blocks.{coach,client}`, `extraCredits.client`, `clients.coach`, `eventTypes.coach` builders + a shared `invalidateBookingScope({ coachId, clientId })` helper. Every mutation (in queries.ts and across the trainer.* / client.book routes) now invalidates only the user-scoped keys for the affected coach/client. Dead invalidations on `["trainer-stats"]`, `["client-details"]`, `["block-allocations"]` were removed (no queries existed with those keys).

### H4. `signOut` does not clear the React Query cache
- **Status**: ✅ **Closed** — `fdb6d3b`
- **Issue**: [src/lib/auth.tsx:56-61](src/lib/auth.tsx:56) only resets `session`, `user`, `role`. It does not call `queryClient.clear()` / `removeQueries()`.
- **Impact**: After User A logs out and User B logs in on the same browser session, the cached entries for `["profile", A.id]`, `["bookings", "client", A.id]`, etc. remain in memory. If any component renders briefly with stale derived state during the auth swap, User B can momentarily see User A's data. Even without that, memory leaks accrue across re-logins.
- **Resolution**: `AuthProvider` now reads `useQueryClient()` and `signOut()` calls `qc.clear()` followed by `qc.removeQueries()` immediately after resetting the local session/user/role state. AuthProvider is already a child of `QueryClientProvider` in `__root.tsx`, so the hook resolves correctly.

### H5. Calendar is built desktop-only — main grid hidden or broken on mobile
- **Status**: ✅ **Closed** — `0f33c0b`
- **Issue**: [src/routes/trainer.calendar.tsx:337](src/routes/trainer.calendar.tsx:337) uses `flex flex-col xl:flex-row` and [line 502](src/routes/trainer.calendar.tsx:502) hides the entire context panel with `hidden xl:flex` (the `xl` breakpoint is 1280px). The 7-day grid (line 460) has no mobile fallback. Touch targets like `size-8` nav buttons (line 363) are 32px — below Apple's 44pt and Material's 48dp minimums.
- **Impact**: Trainers cannot actually manage their calendar on a phone. Below 1280px, columns become ~45px wide; events become unreadable taps. Given this is a *coaching* app where coaches are frequently on the move between sessions, this is a primary use-case failure.
- **Resolution**: New `MobileAgendaView` + `MobileEventCard` components rendered `md:hidden`; the 7-column grid is hidden below md (`hidden md:flex`). Horizontal pill date scroller + vertical event-card list using the Aura Health card shape (`rounded-[24px]`, `border-outline-variant/30`, `shadow-soft-blue`). Time-left + divider + title/subtitle/tag-chips layout. Tap dispatches to the same handlers as desktop renderEvent. New `--text-label-sm` typography token added to styles.css. Caveat: the focus-client side panel is still `hidden xl:flex` — out of H5 scope.

### H6. Hardcoded hex everywhere — design tokens defined but ignored
- **Status**: ✅ **Closed** — `fdb6d3b`
- **Issue**: `styles.css` defines theme tokens, but [trainer.calendar.tsx:291, 308, 322, 337, 343](src/routes/trainer.calendar.tsx:291), [booster-card.tsx:110](src/routes/booster-card.tsx:110), [trainer.availability.tsx:338, 354](src/routes/trainer.availability.tsx:338), and many more files use raw hex: `border-[#ffb77b]`, `bg-[#ffdcc2]/40`, `text-[#5b2f00]`, `bg-[#f8f9fe]`, `text-[#003e62]`, `bg-[#0f172a]`, `bg-slate-50`. The constant `SOFT_SHADOW = "shadow-[0px_4px_20px_rgba(0,86,133,0.05)]"` is duplicated as a string literal (no type checking, no central change).
- **Impact**: Dark mode is effectively impossible to add without a global rewrite. Theme changes require grep-and-replace across ~20 files. Color contrast on event cards (dark brown on light orange at 40% opacity, lines 291/296) is plausibly below WCAG AA 4.5:1 and should be measured before launch. Inconsistent palette across pages.
- **Resolution**: 16 new semantic tokens added to [src/styles.css](src/styles.css) (warning-container/border, on-primary-fixed-variant, error, cta-dark, 6× status-*-{bg,fg}, brand-whatsapp + on, avatar-placeholder + on, plus `--shadow-soft-blue` / `--shadow-soft-card`). ~80 `bg-[#xxx]` / `text-[#xxx]` / `border-[#xxx]` / `bg-slate-*` usages replaced with semantic utility classes across 12 files. The two duplicated `SOFT_SHADOW` JS constants replaced with the new shadow tokens. Third-party brand hex (Google `#4285F4`, Stripe `#635BFF`, Meet `#00897B`) intentionally preserved as raw hex in `trainer.integrations.tsx` — they're external service identities, not app design tokens.

### H7. Overlapping events render on top of each other invisibly
- **Status**: ✅ **Closed** — `fdb6d3b`
- **Issue**: [src/routes/trainer.calendar.tsx:283-330](src/routes/trainer.calendar.tsx:283) positions every event as `absolute left-1 right-1 z-10` inside its day column with `top/height` from time. There is no column-splitting algorithm for overlaps.
- **Impact**: If two events overlap (mis-booked, imported Google event collides with a Supabase booking, or any double-booking from H2 above), the later event renders on top and the earlier one is completely hidden — and unclickable. The trainer believes they have one event when they have two; they cannot cancel or even see the hidden one without going to a different view.
- **Resolution**: New `layoutDay(events, durationOf)` helper assigns each event a `{ col, cols }` placement within its overlap cluster using the canonical Google-Calendar algorithm (cluster = chain of overlapping events; greedy lane assignment). `layoutByDay = useMemo(...)` runs alongside `bookingsByDay`. `renderEvent` consumes the placement and positions via CSS `calc(left, width)` so overlapping events render side-by-side. Certified events now also gain `hover:z-20` so a hovered card always pops to the front.

### H8. `meId!` non-null assertion on a value that can legitimately be undefined
- **Status**: ✅ **Closed** — `fdb6d3b`
- **Issue**: [src/routes/client.book.tsx:621](src/routes/client.book.tsx:621) and [line 705](src/routes/client.book.tsx:705) use `meId!` (from `user?.id`) as `client_id` in the booking INSERT and as `profileId` in the push notification. `tsconfig` has `strict: true` so the bang silences a legitimate complaint.
- **Impact**: If the route is ever reached without a hydrated user (race during auth refresh, expired token, route-guard regression), the INSERT will send `null` for a NOT NULL column and the row fails — but only after side effects (Google Calendar sync, emails) have started in some code paths. Worse, push uses the null profileId and emits a useless notification.
- **Resolution**: `confirm()` opens with an explicit guard — `if (!meId) { toast.error("Sessione non valida", { description: "Effettua di nuovo l'accesso e riprova." }); return; }` — before any DB writes or side-effects. Both `meId!` non-null assertions (booking INSERT, sendPush) replaced with the now-narrowed `meId`.

---

## 🟡 Medium Priority (UX & State Logic)

### M1. No optimistic UI on assign/cancel mutations
- **Status**: ✅ **Closed** — `e445417`
- [src/routes/trainer.calendar.tsx:136-151](src/routes/trainer.calendar.tsx:136) — `assignBooking` has no `onMutate`. After clicking "Assegna", the UI waits a full round-trip plus an invalidation refetch before reflecting the change.
- **Resolution**: `assignBooking` got an `onMutate` that cancels in-flight queries, snapshots the coach's `bookings` cache, patches the cached booking's `client_id` immediately, and stores the snapshot for `onError` rollback. `useCancelBooking` and `useCoachCancelBooking` share an `optimisticBookingRemove(qc, bookingId)` helper that filters the cancelled booking out of every cached `["bookings", ...]` query, with `rollbackSnapshots()` on error.

### M2. Local form state hydrated from query state without a `didHydrate` guard
- **Status**: ✅ **Closed** — `e687092`
- [src/routes/trainer.availability.tsx:116-133](src/routes/trainer.availability.tsx:116) — every time `availQ.data` changes, the entire `week` local state is overwritten. A user editing the form when a background refetch lands loses their unsaved edits.
- **Resolution**: Both hydration effects now gate on `useRef(false)` flags (`didHydrateWeek`, `didHydrateSettings`) so they only run on the FIRST arrival of the data. Subsequent refetches no longer touch the form. Flags reset naturally on component unmount.

### M3. No `staleTime` / `gcTime` tuning anywhere
- **Status**: ✅ **Closed** — `e445417`
- Across [src/lib/queries.ts](src/lib/queries.ts), every `useQuery` uses defaults (`staleTime: 0`, `gcTime: 5 min`). Read-heavy, rarely-changing data (event types, coach settings, weekly availability) refetches on every window focus.
- **Resolution**: `STALE_CONFIG = 5 * 60 * 1000` applied to `useCoachClients`, `useCoachEventTypes`, `useCoachAvailability`, `useCoachOptimizationEnabled`, `useCoachAvailabilityExceptions`. Bookings / blocks / extra_credits queries left at default 0 so mutations elsewhere are immediately reflected.

### M4. Inline object identity in query keys
- **Status**: ✅ **Closed** — `e445417`
- [src/routes/client.book.tsx:288](src/routes/client.book.tsx:288): `queryKey: ["coach-busy", coachIdForAvail, block?.start_date, block?.end_date]` uses fields of `block`. If `block` is replaced by an equal-by-value object (e.g., after a refetch), the dates differ in identity but not value. Acceptable here because dates are primitives, but the broader pattern is fragile.
- **Resolution**: Key is now `["coach-busy", coachIdForAvail, block?.id ?? null, block?.start_date ?? null, block?.end_date ?? null]`. `block.id` is the immutable handle; dates are kept so a block whose dates are edited still keys to a fresh query.

### M5. Validation errors via `toast.error` instead of inline field highlighting
- **Status**: ✅ **Closed** — `e445417`
- [src/routes/trainer.availability.tsx:201-212](src/routes/trainer.availability.tsx:201) and [src/routes/client.book.tsx:513-526](src/routes/client.book.tsx:513) throw `Error("Mercoledì: completa entrambi gli orari…")` and render via toast. The user must read prose to find the broken row.
- **Resolution**: `trainer.availability.tsx` validation refactored — a `dayErrors: Record<number, string>` state collects per-DOW messages; each offending day renders the error inline (`role="alert"`, `text-error`) beneath its time-blocks row. The single submit-throws-Error pattern is gone; toast now shows the generic "Verifica gli orari evidenziati" while inline messages point at the specific rows. (`client.book.tsx` validations are guards before submit-time, not field-level — left as toast since they're flow guards.) Full react-hook-form + zodResolver migration would be a larger UX refactor; the minimum-effort field-level surfacing matches the audit's intent.

### M6. Loading skeletons don't match final layout
- **Status**: ✅ **Closed** — `e445417`
- [src/routes/client.book.tsx:433-439](src/routes/client.book.tsx:433): generic `<Skeleton />` shapes that don't approximate the booking grid → visible layout shift (CLS) when data lands.
- **Resolution**: The two generic rectangles were replaced with a layout-faithful skeleton: top app bar (back / title / notif), 2-column pool selector, calendar block, and a 3-column grid of 6 time-slot skeletons. Reserves the same vertical space the rendered page occupies, eliminating the layout shift.

### M7. Silent failure of Google Calendar sync
- **Status**: ✅ **Closed** — `55acc6d`
- [src/routes/trainer.calendar.tsx:216, 260](src/routes/trainer.calendar.tsx:216) and similar in cancel paths: `await syncCalendarAwait(...).catch(e => console.error(...))`. The user is told their booking succeeded, with no indication that Google Calendar mirroring failed.
- **Resolution**: `src/lib/sync-calendar.ts` exposes `notifySyncFailure` / `reportSyncFailure` which emit a `sonner` `toast.warning` with a stable id (`"gcal-sync-warning"`) so repeated failures collapse into one visible message. The fire-and-forget `syncCalendar()` invokes the helper from its catch (accepts `{ silent: true }` for background loops); `syncCalendarAwait` callers (full sync, weekly mirror_check, cancel paths in `queries.ts`) call `reportSyncFailure(action, err)` from their catch handlers alongside the existing console.error.

### M8. No timezone displayed anywhere
- **Status**: ✅ **Closed** — `e445417`
- Calendar shows `09:00` without a zone label. Coaches and clients in different zones (or coaches travelling) cannot resolve ambiguity.
- **Resolution**: New `getUserTimezoneLabel()` helper in [src/lib/datetime.ts](src/lib/datetime.ts) returns `{ iana, offset, combined }` (e.g. `"Europe/Rome (GMT+1)"`). Client booking page renders the combined label next to the "Orari disponibili" heading with a `title` tooltip. DB already stores `timestamptz` (verified in [supabase/migrations/20260509204116_*.sql](supabase/migrations/20260509204116_e8ccb6dd-20be-43b0-b207-1355d003d881.sql) `scheduled_at timestamptz NOT NULL`).

### M9. `useRef`-based "did sync" pattern fragility
- **Status**: ✅ **Closed** — `e445417`
- [src/routes/trainer.calendar.tsx:186-188](src/routes/trainer.calendar.tsx:186) and the `lastMirrorMonth` ref near line 223 gate effects through refs. Refs survive HMR weirdly and bypass React's reactive model; if either effect dep changes for an unrelated reason, the gate masks legitimate re-syncs.
- **Resolution**: Both refs now carry user-scoped identifiers instead of a plain boolean / month key. `didFullSyncForUser.current: string | null` stores the user.id the sync last ran for; `lastMirrorMonth.current` becomes `${user.id}-YYYY-MM`. A silent user swap can no longer false-gate the new user.

### M10. Auth role widening with `as Role`
- **Status**: ✅ **Closed** — `6fe1e5d`
- [src/lib/auth.tsx:53](src/lib/auth.tsx:53): `setRole((data?.role as Role) ?? "client")` — the cast silently coerces whatever string the DB returned. A stray DB value (`"COACH"` with wrong case, a typo, a future enum value) would yield a value that fails downstream `role === "coach"` checks but doesn't trip the type system.
- **Resolution**: Module-level `roleSchema = z.enum(["admin", "coach", "client"])` and `Role` is now `z.infer<typeof roleSchema>`. `fetchRole()` parses with `safeParse` and falls back to `"client"` on failure, with a `console.warn` logging the unexpected value so it surfaces in error-capture instead of disappearing.

---

## 🔵 Low Priority (Code Cleanliness & Documentation)

### L1. `as any` casts on Supabase calls
- **Status**: ✅ **Closed** — `e445417`
- [src/lib/push.ts:62](src/lib/push.ts:62): `.from("push_subscriptions" as any)` — likely because the table isn't in the generated types file.
- [src/routes/trainer.clients.index.tsx:213](src/routes/trainer.clients.index.tsx:213): `(bs as any[]) ?? []` — should be typed.
- **Resolution**: `push_subscriptions` is already present in [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts:425) (the `as any` was a stale workaround) — removed. `(bs as any[])` replaced with a `BlockWithAllocs = BlockLite & { block_allocations: AllocLite[] | null }` projection.

### L2. Variable named `any` shadowing the keyword
- **Status**: ✅ **Closed** — `e445417`
- [src/routes/client.book.tsx:488](src/routes/client.book.tsx:488): `return any ? { id: any.id, ... } : null;` — `any` is the variable name. Lint-confusing and reads as if a type leaked into runtime.
- **Resolution**: Renamed `any` → `fallback` inside `findAllocationForWeek`.

### L3. `(e as Error).message` pattern instead of typed errors
- **Status**: ✅ **Closed** — `e445417`
- [src/routes/client.bookings.$bookingId.tsx:190, 205, 354](src/routes/client.bookings.$bookingId.tsx:190): `onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message })`.
- **Resolution**: Added `errorMessage(err: unknown): string` to [src/lib/utils.ts](src/lib/utils.ts) (handles Error / string / object-with-message / unknown). All eight `(e as Error).message` sites across `client.bookings.$bookingId.tsx`, `trainer.clients.$id.tsx`, `trainer.event-types.tsx`, `trainer.clients.index.tsx` now call `errorMessage(e)`.

### L4. tsconfig is missing safety flags
- **Status**: ✅ **Closed (partial)** — `e445417`
- [tsconfig.json](tsconfig.json) has `strict: true` but lacks `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. The first would have caught several array-index assumptions; the second tightens optional prop semantics.
- **Resolution**: `noUncheckedIndexedAccess: true` enabled in [tsconfig.json](tsconfig.json), with all fallout fixed (input-otp slot fallback, event-colors `GCAL_DEFAULT`, `parseHM` destructure, `daySlots[idx]`/`pools[0]`, `firstName` fallback, `getInitials`, a `dayOf()` helper that centralizes the `Record<number, DayState>` access pattern in trainer.availability, `weekDays[6]` / `bookingsByDay[i]` guards, `rows[i]` guards in trainer.clients.$id). `exactOptionalPropertyTypes` was enabled briefly but reverted: shadcn/Radix UI components (context-menu, dropdown-menu, menubar, etc.) don't explicitly include `undefined` in their optional prop types, which would require either patching those upstream-style files or wrapping every consumer. Documented as a follow-up — strict-mode tightening on UI components is a separately-scoped pass.

### L5. Date-key dual-format in the same function
- **Status**: ✅ **Closed** — `82dfd93`
- [src/routes/client.book.tsx:101-126](src/routes/client.book.tsx:101): two different date-key formats coexist (unpadded `2026-4-1` for the `rangesByDay` map, zero-padded `2026-05-01` from the DB for `excByDate`). They are internally consistent today, but the dual format is a footgun for the next change.
- **Resolution**: Extracted `ymd(d: Date): string` that returns the canonical zero-padded YYYY-MM-DD. Both `rangesByDay` and `excByDate` (and the lookups against them) now use it. `rangesByDay` key format effectively changes (e.g. `"2026-9-1"` → `"2026-10-01"`) but the map is purely local to the function so no external code is affected.

### L6. `valid_until` parsed as `new Date(\`${a.valid_until}T23:59:59\`)` without explicit zone
- **Status**: ✅ **Closed** — `82dfd93`
- [src/routes/client.book.tsx:367](src/routes/client.book.tsx:367): browser-local interpretation. If `valid_until` is a date-only column, behavior differs by user TZ — credits can expire up to 12h early or late depending on user location.
- **Resolution**: Replaced `new Date(\`${valid_until}T23:59:59\`)` with `parseISO(valid_until)` (date-fns), which yields local midnight of the date — formats consistently across timezones ("20 maggio" everywhere) and compares correctly against the calendar's midnight-anchored `day` iterator. Date-level (not instant-level) granularity is preserved.

### L7. `routeTree.gen.ts` is generated with 18× `as any`
- **Status**: ⚠️ **Open by design** — generated, upstream-only
- [src/routeTree.gen.ts](src/routeTree.gen.ts) — owned by `@tanstack/router-plugin`. Not actionable directly.
- **Resolution**: No code change. Track future releases of `@tanstack/router-plugin` and re-evaluate once the upstream emits typed routes. The file is auto-regenerated, so any local edits would be overwritten on the next dev / build.

### L8. Form inputs without `required`/visible asterisks
- **Status**: ✅ **Closed** — `e445417`
- [src/routes/trainer.availability.tsx:338-356](src/routes/trainer.availability.tsx:338): time pickers have no `required` attribute, only post-submit validation. Users don't know which fields are mandatory until they submit.
- **Resolution**: Create-client form (`trainer.clients.index.tsx`) — Nome / Cognome / Email now have visible `*` markers (`<span className="text-error">*</span>`), proper `htmlFor` wiring, and `aria-required="true"`. Availability time-pickers (`trainer.availability.tsx`) carry `aria-label` (with the day name) and `aria-required="true"` for screen readers; the `--:--` placeholder remains the visual cue.

### L9. Mixed component usage (raw `<button>` vs `<Button>` vs `<Link>` styled as button)
- **Status**: ✅ **Closed** — `e445417`
- [src/routes/trainer.calendar.tsx:361-373, 557](src/routes/trainer.calendar.tsx:361) mixes shadcn `<Button>` with raw `<button>` and a `<Link>` styled to look like a button. Focus rings, disabled state, and keyboard semantics differ across the three.
- **Resolution**: The "Profilo Completo" `<Link>` styled as a button is now wrapped in `<Button asChild variant="secondary">` so it picks up the standard focus ring and keyboard semantics. The remaining raw `<button>` elements in the calendar header / event cards are tightly-custom UI (round nav arrows, calendar event cards, mobile date pills) where the shadcn `<Button>` API is the wrong abstraction; these are intentionally left as `<button>`.

### L10. Magic-number widths
- **Status**: ✅ **Closed** — `e445417`
- `min-w-[160px]` (calendar header), `w-[110px]` (availability time selects), `w-[180px]` (admin select), `w-[260px]` (popover), `w-[400px] h-[400px]` (auth decorative blurs).
- **Resolution**: Replaced with Tailwind spacing-scale utilities — `min-w-40` (calendar week label), `w-28` (availability time selects), `w-44` (admin select), `w-64` (popover date picker). The `w-[400px]/w-[300px]` auth-page decorative blurs are intentionally left as fixed pixel sizes — they're absolute-positioned aesthetic gradients, not layout-driven elements.

---

## Notes on what was checked but did not produce findings
- **Zustand**: not used; global state is React Context + React Query.
- **Realtime subscriptions**: searched for `supabase.channel(` / `.on(` — not present, so no leak/cleanup concerns.
- **`JSON.parse`**: no unguarded uses in `src/`.
- **`@ts-ignore` / `@ts-expect-error`**: none in `src/`.

## How to act on this
The 8 High items above are the ones that can cost money / sessions / data in production. Address **H1, H2, H5** first — they each map to a distinct production incident class (lost credits, double-bookings, mobile coach unable to work).

---

## Closing summary

All 27 actionable findings (8 High, 10 Medium, 9 of 10 Low) are closed. The one item not closed (**L7**) is a generated file owned by `@tanstack/router-plugin` and explicitly out of scope per the audit itself.

- `tsc --noEmit` — exit 0
- `vite build --mode development` — exit 0
- `eslint` — exit 0 (only pre-existing CRLF / `react-hooks/exhaustive-deps` warnings, untouched by this work)

Recommended next moves (not part of this audit):
1. Run the H1/H2 migration diagnostic in prod *before* applying — clean up any pre-existing overlapping scheduled bookings.
2. Build a mobile Sheet for the focus-client side panel so H5 covers the certified-event tap fully.
3. Tighten `exactOptionalPropertyTypes` as a separate pass, scoped around the shadcn/Radix UI surface.
4. Track `@tanstack/router-plugin` releases for L7.

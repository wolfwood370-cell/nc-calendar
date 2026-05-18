# Athlete App Audit Report

> Scope: NC Calendar (TanStack Start + React 19 + Supabase + React Query + Tailwind v4).
> Stack note: there is no Zustand in this project — global state lives in React Context (`src/lib/auth.tsx`) and the React Query cache.
> Methodology: static code review of `src/` against three lenses (runtime/state correctness, TypeScript safety, UI/UX + design-system robustness). Every finding cites file + line.

---

## 🔴 High Priority (Critical Issues)

### H1. Non-atomic booking write — INSERT booking, then UPDATE allocation as two round-trips
- **Issue**: In [src/routes/client.book.tsx:620-650](src/routes/client.book.tsx:620), the confirm flow `INSERT`s a `bookings` row, then in a separate request reads `block_allocations.quantity_booked` and writes it back incremented. There is no transaction and no compensating delete.
- **Impact**: If the network drops, the tab is closed, or the second request fails between the two calls, the booking exists but the credit is never deducted. Result: the user has paid one slot but their block shows full availability. The DB trigger handles `extra_credits` (per comment at line 636) but not `block_allocations`. Repeat offenders can silently exhaust trainer time without it counting against their pack.
- **Fix**: Move the booking + allocation update into a single Supabase RPC (Postgres function) with proper locking (`FOR UPDATE` on the allocation row). Or use Supabase's RLS + a database-side trigger for `block_allocations` mirroring what already exists for `extra_credits`.

### H2. Pre-INSERT conflict check races against itself
- **Issue**: [src/routes/client.book.tsx:595-617](src/routes/client.book.tsx:595) reads "nearby" bookings and checks for overlap, then on success inserts. There is no DB-level constraint preventing two concurrent confirms from inserting overlapping bookings (the window between SELECT and INSERT is wide — it includes another HTTP round-trip).
- **Impact**: Two clients confirming at the same instant on the same coach can each pass the JS check and both succeed at INSERT. Double-booking on the coach's calendar; the UX toast `"Questo orario è stato appena occupato"` (line 615) is *unreachable* in that race.
- **Fix**: Add a Postgres exclusion constraint on `(coach_id, tstzrange(scheduled_at, scheduled_at + duration))` using the `btree_gist` extension, OR a unique partial index on `(coach_id, scheduled_at)` for `status='scheduled'`. Move the conflict check server-side.

### H3. Mutations invalidate with broad keys but queries are keyed by user/coach
- **Issue**: Throughout [src/lib/queries.ts:354-357, 432-435, 450](src/lib/queries.ts:354), mutations call `qc.invalidateQueries({ queryKey: ["bookings"] })` (no further parameters), but the queries that produced the data are keyed with parameters: `["bookings", "coach", coachId]`, `["bookings", "client", clientId]`, etc. React Query's prefix-match logic means *every* bookings query in the cache is invalidated.
- **Impact**: A single trainer cancelling one booking forces refetches for every other coach/client query the app has ever loaded into the cache. On a busy device this is wasted bandwidth and CPU; in failure modes (offline/poor connection) it can leave queries in `error` state that were perfectly valid moments earlier. Note: it is *not* a data-leak per se (other users' data isn't fetched — RLS still applies) but it is a stampede.
- **Fix**: Define query-key factories (e.g., `bookingKeys.coach(coachId)`, `bookingKeys.client(clientId)`) and invalidate the narrowest scope that the mutation touched. Or use `predicate` with explicit role/id matching.

### H4. `signOut` does not clear the React Query cache
- **Issue**: [src/lib/auth.tsx:56-61](src/lib/auth.tsx:56) only resets `session`, `user`, `role`. It does not call `queryClient.clear()` / `removeQueries()`.
- **Impact**: After User A logs out and User B logs in on the same browser session, the cached entries for `["profile", A.id]`, `["bookings", "client", A.id]`, etc. remain in memory. If any component renders briefly with stale derived state during the auth swap, User B can momentarily see User A's data. Even without that, memory leaks accrue across re-logins.
- **Fix**: Inject `useQueryClient()` (or pass a ref) into `AuthProvider` and call `qc.clear()` in `signOut`. Same on auth state change to a different `user.id`.

### H5. Calendar is built desktop-only — main grid hidden or broken on mobile
- **Issue**: [src/routes/trainer.calendar.tsx:337](src/routes/trainer.calendar.tsx:337) uses `flex flex-col xl:flex-row` and [line 502](src/routes/trainer.calendar.tsx:502) hides the entire context panel with `hidden xl:flex` (the `xl` breakpoint is 1280px). The 7-day grid (line 460) has no mobile fallback. Touch targets like `size-8` nav buttons (line 363) are 32px — below Apple's 44pt and Material's 48dp minimums.
- **Impact**: Trainers cannot actually manage their calendar on a phone. Below 1280px, columns become ~45px wide; events become unreadable taps. Given this is a *coaching* app where coaches are frequently on the move between sessions, this is a primary use-case failure.
- **Fix**: Add a `<md` collapse mode: vertical day-list view + day picker; or split into separate `<MobileCalendar/>` and `<DesktopCalendar/>` components. Promote nav buttons to `size-11` (44px) at `<md`.

### H6. Hardcoded hex everywhere — design tokens defined but ignored
- **Issue**: `styles.css` defines theme tokens, but [trainer.calendar.tsx:291, 308, 322, 337, 343](src/routes/trainer.calendar.tsx:291), [booster-card.tsx:110](src/routes/booster-card.tsx:110), [trainer.availability.tsx:338, 354](src/routes/trainer.availability.tsx:338), and many more files use raw hex: `border-[#ffb77b]`, `bg-[#ffdcc2]/40`, `text-[#5b2f00]`, `bg-[#f8f9fe]`, `text-[#003e62]`, `bg-[#0f172a]`, `bg-slate-50`. The constant `SOFT_SHADOW = "shadow-[0px_4px_20px_rgba(0,86,133,0.05)]"` is duplicated as a string literal (no type checking, no central change).
- **Impact**: Dark mode is effectively impossible to add without a global rewrite. Theme changes require grep-and-replace across ~20 files. Color contrast on event cards (dark brown on light orange at 40% opacity, lines 291/296) is plausibly below WCAG AA 4.5:1 and should be measured before launch. Inconsistent palette across pages.
- **Fix**: Map every hex used into named tokens in `styles.css` (`--color-event-unassigned-bg`, `--color-event-certified-bg`, etc.) and replace `bg-[#xxx]` with `bg-event-certified` semantic classes. Move `SOFT_SHADOW` to a CSS variable.

### H7. Overlapping events render on top of each other invisibly
- **Issue**: [src/routes/trainer.calendar.tsx:283-330](src/routes/trainer.calendar.tsx:283) positions every event as `absolute left-1 right-1 z-10` inside its day column with `top/height` from time. There is no column-splitting algorithm for overlaps.
- **Impact**: If two events overlap (mis-booked, imported Google event collides with a Supabase booking, or any double-booking from H2 above), the later event renders on top and the earlier one is completely hidden — and unclickable. The trainer believes they have one event when they have two; they cannot cancel or even see the hidden one without going to a different view.
- **Fix**: Implement the canonical "overlap lanes" algorithm (assign each event to a column index within its overlap cluster, divide `width` by cluster size). Or at minimum: when N events overlap, render a stacked "+N more" chip.

### H8. `meId!` non-null assertion on a value that can legitimately be undefined
- **Issue**: [src/routes/client.book.tsx:621](src/routes/client.book.tsx:621) and [line 705](src/routes/client.book.tsx:705) use `meId!` (from `user?.id`) as `client_id` in the booking INSERT and as `profileId` in the push notification. `tsconfig` has `strict: true` so the bang silences a legitimate complaint.
- **Impact**: If the route is ever reached without a hydrated user (race during auth refresh, expired token, route-guard regression), the INSERT will send `null` for a NOT NULL column and the row fails — but only after side effects (Google Calendar sync, emails) have started in some code paths. Worse, push uses the null profileId and emits a useless notification.
- **Fix**: Replace `meId!` with an early guard at the top of `confirm()`: `if (!meId) { toast.error("Sessione scaduta"); return; }`. The route should already guard against unauthenticated access but defense in depth is cheap.

---

## 🟡 Medium Priority (UX & State Logic)

### M1. No optimistic UI on assign/cancel mutations
- [src/routes/trainer.calendar.tsx:136-151](src/routes/trainer.calendar.tsx:136) — `assignBooking` has no `onMutate`. After clicking "Assegna", the UI waits a full round-trip plus an invalidation refetch before reflecting the change.
- **Fix**: Add `onMutate` to optimistically update the cached booking; `onError` to roll back; `onSettled` to invalidate.

### M2. Local form state hydrated from query state without a `didHydrate` guard
- [src/routes/trainer.availability.tsx:116-133](src/routes/trainer.availability.tsx:116) — every time `availQ.data` changes, the entire `week` local state is overwritten. A user editing the form when a background refetch lands loses their unsaved edits.
- **Fix**: Use a `useRef(false)` "hydrated" flag, or initialize state via `useState(() => initialFromQuery)` once and ignore later changes; alternatively raise `staleTime` for that query.

### M3. No `staleTime` / `gcTime` tuning anywhere
- Across [src/lib/queries.ts](src/lib/queries.ts), every `useQuery` uses defaults (`staleTime: 0`, `gcTime: 5 min`). Read-heavy, rarely-changing data (event types, coach settings, weekly availability) refetches on every window focus.
- **Fix**: Set `staleTime: 5 * 60_000` for stable queries; keep `0` for `["bookings", ...]`.

### M4. Inline object identity in query keys
- [src/routes/client.book.tsx:288](src/routes/client.book.tsx:288): `queryKey: ["coach-busy", coachIdForAvail, block?.start_date, block?.end_date]` uses fields of `block`. If `block` is replaced by an equal-by-value object (e.g., after a refetch), the dates differ in identity but not value. Acceptable here because dates are primitives, but the broader pattern is fragile.
- **Fix**: Standardize on `block?.id` plus dates as primitives; treat keys as a stable contract.

### M5. Validation errors via `toast.error` instead of inline field highlighting
- [src/routes/trainer.availability.tsx:201-212](src/routes/trainer.availability.tsx:201) and [src/routes/client.book.tsx:513-526](src/routes/client.book.tsx:513) throw `Error("Mercoledì: completa entrambi gli orari…")` and render via toast. The user must read prose to find the broken row.
- **Fix**: Adopt react-hook-form + zodResolver (the deps are already in `package.json`) and surface field-level errors next to each input.

### M6. Loading skeletons don't match final layout
- [src/routes/client.book.tsx:433-439](src/routes/client.book.tsx:433): generic `<Skeleton />` shapes that don't approximate the booking grid → visible layout shift (CLS) when data lands.
- **Fix**: Build skeletons that mirror the final block shape and dimensions.

### M7. Silent failure of Google Calendar sync
- [src/routes/trainer.calendar.tsx:216, 260](src/routes/trainer.calendar.tsx:216) and similar in cancel paths: `await syncCalendarAwait(...).catch(e => console.error(...))`. The user is told their booking succeeded, with no indication that Google Calendar mirroring failed.
- **Fix**: Surface a non-blocking warning toast: "Prenotazione salvata, ma la sincronizzazione con Google Calendar non è riuscita."

### M8. No timezone displayed anywhere
- Calendar shows `09:00` without a zone label. Coaches and clients in different zones (or coaches travelling) cannot resolve ambiguity.
- **Fix**: Render the user's IANA zone next to the time picker, and store all times as `timestamptz` in Supabase (likely already true — verify).

### M9. `useRef`-based "did sync" pattern fragility
- [src/routes/trainer.calendar.tsx:186-188](src/routes/trainer.calendar.tsx:186) and the `lastMirrorMonth` ref near line 223 gate effects through refs. Refs survive HMR weirdly and bypass React's reactive model; if either effect dep changes for an unrelated reason, the gate masks legitimate re-syncs.
- **Fix**: Move the "have we synced for this user?" decision into a React Query mutation with a stable key, or co-locate as state.

### M10. Auth role widening with `as Role`
- [src/lib/auth.tsx:53](src/lib/auth.tsx:53): `setRole((data?.role as Role) ?? "client")` — the cast silently coerces whatever string the DB returned. A stray DB value (`"COACH"` with wrong case, a typo, a future enum value) would yield a value that fails downstream `role === "coach"` checks but doesn't trip the type system.
- **Fix**: Validate with `z.enum(["client", "coach", "admin"]).safeParse(data?.role)` and fall back to `"client"` on failure.

---

## 🔵 Low Priority (Code Cleanliness & Documentation)

### L1. `as any` casts on Supabase calls
- [src/lib/push.ts:62](src/lib/push.ts:62): `.from("push_subscriptions" as any)` — likely because the table isn't in the generated types file.
- [src/routes/trainer.clients.index.tsx:213](src/routes/trainer.clients.index.tsx:213): `(bs as any[]) ?? []` — should be typed.
- **Fix**: Regenerate Supabase types (`supabase gen types typescript`) so `push_subscriptions` is included; replace `any[]` with the real row type.

### L2. Variable named `any` shadowing the keyword
- [src/routes/client.book.tsx:488](src/routes/client.book.tsx:488): `return any ? { id: any.id, ... } : null;` — `any` is the variable name. Lint-confusing and reads as if a type leaked into runtime.
- **Fix**: Rename to `match` or `found`.

### L3. `(e as Error).message` pattern instead of typed errors
- [src/routes/client.bookings.$bookingId.tsx:190, 205, 354](src/routes/client.bookings.$bookingId.tsx:190): `onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message })`.
- **Fix**: Use `error instanceof Error ? error.message : String(error)` or a small `errorMessage(e: unknown)` helper.

### L4. tsconfig is missing safety flags
- [tsconfig.json](tsconfig.json) has `strict: true` but lacks `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. The first would have caught several array-index assumptions; the second tightens optional prop semantics.
- **Fix**: Enable both. Expect some churn — fix the resulting errors before merging.

### L5. Date-key dual-format in the same function
- [src/routes/client.book.tsx:101-126](src/routes/client.book.tsx:101): two different date-key formats coexist (unpadded `2026-4-1` for the `rangesByDay` map, zero-padded `2026-05-01` from the DB for `excByDate`). They are internally consistent today, but the dual format is a footgun for the next change.
- **Fix**: Use one helper `dateKey(d: Date): string` that always returns the zero-padded ISO date.

### L6. `valid_until` parsed as `new Date(\`${a.valid_until}T23:59:59\`)` without explicit zone
- [src/routes/client.book.tsx:367](src/routes/client.book.tsx:367): browser-local interpretation. If `valid_until` is a date-only column, behavior differs by user TZ — credits can expire up to 12h early or late depending on user location.
- **Fix**: Treat as end-of-day in the coach's TZ on the server, or as UTC 23:59:59Z everywhere with intent clearly documented.

### L7. `routeTree.gen.ts` is generated with 18× `as any`
- [src/routeTree.gen.ts](src/routeTree.gen.ts) — owned by `@tanstack/router-plugin`. Not actionable directly.
- **Fix**: Keep the router plugin up to date and verify the upstream casts go away in newer versions.

### L8. Form inputs without `required`/visible asterisks
- [src/routes/trainer.availability.tsx:338-356](src/routes/trainer.availability.tsx:338): time pickers have no `required` attribute, only post-submit validation. Users don't know which fields are mandatory until they submit.
- **Fix**: Mark required fields with `*` in labels and add `aria-required`.

### L9. Mixed component usage (raw `<button>` vs `<Button>` vs `<Link>` styled as button)
- [src/routes/trainer.calendar.tsx:361-373, 557](src/routes/trainer.calendar.tsx:361) mixes shadcn `<Button>` with raw `<button>` and a `<Link>` styled to look like a button. Focus rings, disabled state, and keyboard semantics differ across the three.
- **Fix**: Use shadcn `<Button asChild>` for the `<Link>` case; standardize on `<Button>` for actions.

### L10. Magic-number widths
- `min-w-[160px]` (calendar header), `w-[110px]` (availability time selects), `w-[180px]` (admin select), `w-[260px]` (popover), `w-[400px] h-[400px]` (auth decorative blurs).
- **Fix**: Promote to named tokens or replace with content-driven sizing (e.g., `min-content`, `max-w-prose`).

---

## Notes on what was checked but did not produce findings
- **Zustand**: not used; global state is React Context + React Query.
- **Realtime subscriptions**: searched for `supabase.channel(` / `.on(` — not present, so no leak/cleanup concerns.
- **`JSON.parse`**: no unguarded uses in `src/`.
- **`@ts-ignore` / `@ts-expect-error`**: none in `src/`.

## How to act on this
The 8 High items above are the ones that can cost money / sessions / data in production. Address **H1, H2, H5** first — they each map to a distinct production incident class (lost credits, double-bookings, mobile coach unable to work).

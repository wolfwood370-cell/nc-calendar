/* NC Calendar — prototipo cliente (mobile): funzioni lato cliente sopra NCStore.
   Stesso archivio del lato coach: prenotazioni, spostamenti, annullamenti e acquisti
   del cliente compaiono nel calendario e nella campanella del coach; le azioni del
   coach sulle sessioni del cliente compaiono nelle sue notifiche. */
(function () {
  if (window.NCClient) return;
  var CL = {};
  window.NCClient = CL;
  var ME_KEY = "nc-proto-me";
  var RULES = { noticeH: 24, horizonD: 14, freeH: 24, confirmH: 48, feedbackD: 14 };
  var PERSONAS = [
    { id: "giulia-bianchi", label: "Giulia Bianchi", sub: "Percorso fisso, blocco in corso" },
    { id: "marta-conti", label: "Marta Conti", sub: "Abbonamento, blocco in scadenza" },
    { id: "elena-ricci", label: "Elena Ricci", sub: "Cliente libero, senza percorso" },
    { id: "davide-ferrari", label: "Davide Ferrari", sub: "Percorso concluso" },
  ];
  var PRODUCTS = [
    { id: "pt1", typeId: "pt", qty: 1, price: 40, title: "1 sessione Personal Training", desc: "Per recuperare un allenamento o lavorare su un esercizio." },
    { id: "pt3", typeId: "pt", qty: 3, price: 99, per: "33 € a sessione", best: true, title: "3 sessioni Personal Training", desc: "Un ciclo breve di lavoro tecnico in più nel blocco." },
    { id: "test1", typeId: "test", qty: 1, price: 75, title: "1 test funzionale", desc: "Valutazione di forza, mobilità e postura, con revisione del programma." },
  ];
  var PAGES = { home: "Cliente Home.dc.html", prenota: "Cliente Prenota.dc.html", sessioni: "Cliente Sessioni.dc.html", sessione: "Cliente Sessione.dc.html", booster: "Cliente Booster.dc.html", profilo: "Cliente Profilo.dc.html", notifiche: "Cliente Notifiche.dc.html" };
  var DOW = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  var DOWS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  var MON = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  var MONS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

  function S() { return window.NCStore; }
  function st() { return S().get(); }
  function now() { return S().now(); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function midnight(d, add) { var x = new Date(d); x.setHours(0, 0, 0, 0); if (add) x.setDate(x.getDate() + add); return x; }
  function hm(d) { d = new Date(d); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function endOf(b) { return new Date(new Date(b.start).getTime() + b.dur * 60000); }
  function byStart(a, b) { return new Date(a.start) - new Date(b.start); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function nid(p) { return p + Date.now() + Math.random().toString(36).slice(2, 5); }

  CL.rules = RULES; CL.personas = PERSONAS; CL.products = PRODUCTS; CL.pages = PAGES;
  CL.ready = function () { return !!(window.NCStore && window.NCStore.snap); };
  CL.hm = hm; CL.endOf = endOf; CL.plural = plural; CL.cap = cap;

  /* identità */
  CL.meId = function () { var id = null; try { id = localStorage.getItem(ME_KEY); } catch (e) {} return PERSONAS.some(function (p) { return p.id === id; }) ? id : PERSONAS[0].id; };
  CL.setMe = function (id) { try { localStorage.setItem(ME_KEY, id); } catch (e) {} S().touch(); };
  CL.me = function () { return S().client(CL.meId()); };
  CL.first = function (c) { return (c || CL.me()).name.split(" ")[0]; };
  CL.coach = function () {
    var c = st().coach, ph = c.phone || "+39 347 555 01 23";
    return { name: c.name, first: c.name.split(" ")[0], email: c.email, phone: ph, wa: "https://wa.me/" + ph.replace(/\D/g, ""), tel: "tel:" + ph.replace(/\s/g, ""), mail: "mailto:" + c.email };
  };

  /* navigazione: le pagine aperte da una scheda ricordano da dove si arriva */
  CL.href = function (page, params) {
    var q = params ? Object.keys(params).filter(function (k) { return params[k] != null && params[k] !== ""; }).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&") : "";
    return encodeURI(PAGES[page]) + (q ? "?" + q : "");
  };
  CL.go = function (page, params) { location.href = CL.href(page, params); };
  CL.here = function () { return decodeURI(location.pathname.split("/").pop()) + location.search; };
  CL.push = function (page, params) { var p = Object.assign({}, params || {}); p.back = CL.here(); CL.go(page, p); };
  CL.param = function (k) { return S().param(k); };
  CL.back = function (fallback) {
    var b = CL.param("back");
    if (b && /^Cliente [A-Za-z]+\.dc\.html/.test(b)) { var i = b.indexOf("?"); location.href = i < 0 ? encodeURI(b) : encodeURI(b.slice(0, i)) + b.slice(i); return; }
    CL.go(fallback || "home");
  };

  /* formattazione */
  CL.dayLong = function (d) { d = new Date(d); return cap(DOW[d.getDay()]) + " " + d.getDate() + " " + MON[d.getMonth()]; };
  CL.dayShort = function (d) { d = new Date(d); return DOWS[d.getDay()] + " " + d.getDate() + " " + MONS[d.getMonth()]; };
  CL.dayRel = function (d) { var diff = Math.round((midnight(d) - midnight(Date.now())) / 86400000); return diff === 0 ? "Oggi" : diff === 1 ? "Domani" : diff === -1 ? "Ieri" : CL.dayLong(d); };
  CL.range = function (b) { return hm(b.start) + "–" + hm(endOf(b)); };
  CL.until = function (b) {
    var m = Math.round((new Date(b.start).getTime() - now()) / 60000);
    if (m <= 0) return "";
    if (m < 60) return "tra " + m + " min";
    var days = Math.round((midnight(b.start) - midnight(Date.now())) / 86400000);
    if (days === 0) { var h = Math.floor(m / 60); return "tra " + plural(h, "ora", "ore"); }
    if (days === 1) return "domani";
    return "tra " + days + " giorni";
  };
  CL.clockLabel = function () { var d = new Date(now()); return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); };
  CL.place = function (t) { return t && t.location === "online" ? "Online · videochiamata Google Meet" : "Studio · " + ((t && t.address) || "Via Roma 12, Bologna"); };
  CL.tint = function (hex) { return hex + "1a"; };

  /* adattamento della cornice alla finestra */
  CL.fit = function () {
    var W = window.innerWidth, H = window.innerHeight, s = Math.min(1, (H - 48) / 874);
    if (W < 460) s = Math.min(s, (W - 16) / 402);
    s = Math.max(0.55, s);
    return { w: Math.round(402 * s) + "px", h: Math.round(874 * s) + "px", t: "scale(" + s.toFixed(3) + ")" };
  };

  /* percorso e crediti: una sola definizione di "disponibili" (audit H1) */
  function win(c) {
    if (!c) return null;
    if (c.pathType === "free") return { from: c.creditsFrom ? S().parseDate(c.creditsFrom) : midnight(Date.now(), -3650), to: midnight(Date.now(), 3650), end: null, free: true, ended: false };
    var end = midnight(Date.now(), c.blockEndOff != null ? c.blockEndOff : 27);
    return { from: S().addDays(end, -27), to: S().addDays(end, 1), end: end, free: false, ended: c.blockEndOff != null && c.blockEndOff < 0 };
  }
  CL.win = win;
  CL.pools = function (c) {
    c = c || CL.me(); var w = win(c), out = [];
    Object.keys(c.credits || {}).forEach(function (k) {
      var t = S().type(k); if (!t || t.deleted) return;
      var total = c.credits[k][1], done = 0, booked = 0, lost = 0;
      st().bookings.forEach(function (b) {
        if (b.clientId !== c.id || b.typeId !== k || b.orphan || b.noCredit) return;
        var tt = new Date(b.start); if (tt < w.from || tt >= w.to) return;
        if (b.status === "completed") done++; else if (b.status === "scheduled") booked++; else if (b.status === "no_show" || b.status === "late_cancelled") lost++;
      });
      out.push({ typeId: k, name: t.name, color: t.color, icon: t.icon, dur: t.duration, total: total, done: done, booked: booked, lost: lost, avail: w.ended ? 0 : Math.max(0, total - done - booked - lost), bookable: t.bookable !== false, message: t.message || "", location: t.location, address: t.address, description: t.description });
    });
    return out.sort(function (a, b) { return b.total - a.total; });
  };
  CL.available = function (c) { return CL.pools(c).reduce(function (s, p) { return s + p.avail; }, 0); };
  CL.block = function (c) {
    c = c || CL.me(); var w = win(c);
    if (c.pathType === "free") return { free: true, recurring: false, ended: false, title: "I tuoi crediti", label: "Cliente libero", sub: "Crediti senza scadenza", end: null };
    var rec = c.pathType === "recurring", n = c.block ? c.block[0] : 1, of = c.block ? c.block[1] : 1;
    var week = Math.min(4, Math.max(1, Math.floor((midnight(Date.now()) - w.from) / (7 * 86400000)) + 1));
    var days = c.blockEndOff, endL = CL.dayLong(w.end).toLowerCase();
    var sub = w.ended ? "Concluso " + CL.dayLong(w.end).toLowerCase()
      : rec ? "Settimana " + week + " di 4 · " + (c.autoRenew ? "si rinnova " + CL.dayLong(S().addDays(w.end, 1)).toLowerCase() : "termina " + endL)
      : "Valgono fino a " + endL + (days === 0 ? " · ultimo giorno" : days === 1 ? " · domani l'ultimo giorno" : " · " + days + " giorni");
    return { free: false, recurring: rec, ended: w.ended, n: n, of: of, week: week, end: w.end, from: w.from, daysLeft: days, title: "I tuoi crediti", label: rec ? "Abbonamento mensile · blocco " + n : "Blocco " + n + " di " + of, sub: sub, endLabel: endL, nextFrom: CL.dayLong(S().addDays(w.end, 1)).toLowerCase() };
  };

  /* sessioni */
  CL.upcoming = function (c) { c = c || CL.me(); var t = now(); return st().bookings.filter(function (b) { return b.clientId === c.id && b.status === "scheduled" && endOf(b).getTime() > t; }).sort(byStart); };
  CL.history = function (c) {
    c = c || CL.me(); var t = now();
    return st().bookings.filter(function (b) {
      if (b.clientId !== c.id || b.status === "ignored") return false;
      if (b.status === "cancelled" || b.status === "late_cancelled") return true;
      return endOf(b).getTime() <= t;
    }).sort(function (a, b) { return new Date(b.start) - new Date(a.start); });
  };
  CL.mine = function (id) { var b = S().booking(id); return b && b.clientId === CL.meId() && b.status !== "ignored" ? b : null; };
  CL.status = function (b) {
    var t = now(), s = new Date(b.start).getTime(), e = endOf(b).getTime();
    if (b.status === "completed") return { key: "done", label: "Svolta", bg: "#ecfdf5", fg: "#047857", icon: "CircleCheck", line: "Svolta · credito usato" };
    if (b.status === "no_show") return { key: "noshow", label: "Assente", bg: "#fef2f2", fg: "#b91c1c", icon: "UserX", line: "Assente · il credito è stato scalato" };
    if (b.status === "cancelled") return { key: "cancelled", label: "Annullata", bg: "#eceef2", fg: "#41474f", icon: "CalendarX", line: "Annullata · il credito è tornato disponibile" };
    if (b.status === "late_cancelled") return { key: "late", label: "Annullata tardi", bg: "#fff7ed", fg: "#c2410c", icon: "CalendarX", line: "Annullata con meno di 24 ore · credito scalato" };
    if (e <= t) return { key: "verify", label: "In verifica", bg: "#eceef2", fg: "#41474f", icon: "Hourglass", line: "In verifica · il coach deve ancora registrarla" };
    if (s <= t) return { key: "now", label: "In corso", bg: "rgba(0,86,133,0.1)", fg: "#003e62", icon: "Timer", line: "In corso" };
    if (b.confirmed) return { key: "confirmed", label: "Confermata", bg: "#ecfdf5", fg: "#047857", icon: "CircleCheck", line: "Presenza confermata" };
    if (s - t <= RULES.confirmH * 3600000) return { key: "toconfirm", label: "Da confermare", bg: "#fff7ed", fg: "#c2410c", icon: "Clock", line: "Conferma la tua presenza" };
    return { key: "booked", label: "Prenotata", bg: "rgba(0,86,133,0.08)", fg: "#005685", icon: "CalendarCheck", line: "Prenotata" };
  };
  CL.hoursTo = function (b) { return (new Date(b.start).getTime() - now()) / 3600000; };
  CL.canMove = function (b) { return b.status === "scheduled" && CL.hoursTo(b) >= RULES.freeH; };
  CL.freeCancel = function (b) { return CL.hoursTo(b) >= RULES.freeH; };
  CL.freeUntil = function (b) { var d = new Date(new Date(b.start).getTime() - RULES.freeH * 3600000); return CL.dayLong(d).toLowerCase() + " alle " + hm(d); };

  /* orari: un solo generatore per prenotare e spostare (audit B2) */
  function busyRanges(excludeId) {
    var out = [];
    st().bookings.forEach(function (b) {
      if (b.id === excludeId || ["cancelled", "late_cancelled", "ignored"].indexOf(b.status) >= 0) return;
      var s0 = new Date(b.start).getTime();
      if (b.allDay) { var d0 = midnight(b.start).getTime(); out.push({ s: d0, e: d0 + 86400000 }); return; }
      var t = b.typeId ? S().type(b.typeId) : null;
      out.push({ s: s0, e: s0 + (b.dur + (t && t.buffer ? t.buffer : 0)) * 60000 });
    });
    (st().external || []).forEach(function (x) { if (x.status !== "open") return; var t0 = new Date(x.start).getTime(); out.push({ s: t0, e: t0 + x.dur * 60000 }); });
    return out;
  }
  CL.slotDays = function (typeId, opts) {
    opts = opts || {};
    var c = opts.client || CL.me(), t = S().type(typeId), w = win(c);
    if (!t || !w || w.ended) return { days: [], until: null, limitedByBlock: false, ended: !!(w && w.ended) };
    var cand = t.duration + (t.buffer || 0), minStart = now() + RULES.noticeH * 3600000;
    var today = midnight(Date.now()), last = S().addDays(today, RULES.horizonD), byBlock = false;
    if (w.end && w.end < last) { last = w.end; byBlock = true; }
    var busy = busyRanges(opts.exclude), avail = st().availability || {}, days = [];
    for (var d = new Date(today); d <= last; d = S().addDays(d, 1)) {
      var iso = S().isoDate(d), dow = d.getDay(), base = d.getTime();
      var ranges = (avail[dow] || []).map(function (r) { return [Math.round(r[0] * 60), Math.round(r[1] * 60)]; });
      var ex = S().exceptionsOn(iso);
      var day = { date: new Date(d), iso: iso, dow: DOWS[dow], num: d.getDate(), mon: MONS[d.getMonth()], slots: [], reason: null };
      if (!ranges.length || ex.some(function (x) { return x.allDay; })) { day.reason = "chiuso"; days.push(day); continue; }
      var cands = {};
      ranges.forEach(function (r) { for (var m = Math.ceil(r[0] / 60) * 60; m + cand <= r[1]; m += 60) cands[m] = 1; });
      busy.forEach(function (r) { if (r.e > base && r.e < base + 86400000) { var mi = Math.round((r.e - base) / 60000); if (!cands[mi]) cands[mi] = 2; } });
      Object.keys(cands).map(Number).sort(function (a, b) { return a - b; }).forEach(function (m) {
        var s0 = base + m * 60000, e0 = s0 + cand * 60000;
        if (s0 < minStart) return;
        if (!ranges.some(function (r) { return m >= r[0] && m + cand <= r[1]; })) return;
        if (ex.some(function (x) { return !x.allDay && m < x.end * 60 && m + cand > x.start * 60; })) return;
        if (busy.some(function (r) { return s0 < r.e && e0 > r.s; })) return;
        var sd = new Date(s0);
        day.slots.push({ start: sd.toISOString(), time: hm(sd), end: hm(new Date(s0 + t.duration * 60000)), part: sd.getHours() < 13 ? "Mattina" : sd.getHours() < 17 ? "Pomeriggio" : "Sera", injected: cands[m] === 2 });
      });
      /* Orari consigliati, come booking-slots.ts: accanto alle sessioni già in agenda; nei giorni vuoti primo, centrale e ultimo. */
      if (day.slots.length && st().optimization !== false) {
        var hasBusy = busy.some(function (r) { return r.e - r.s < 86400000 && r.s < base + 86400000 && r.e > base; });
        if (hasBusy) day.slots.forEach(function (x) { if (x.injected) x.rec = true; });
        else { var L = day.slots.length - 1; [0, Math.floor(L / 2), L].forEach(function (i) { day.slots[i].rec = true; }); }
        day.recWhy = hasBusy ? "Subito dopo le altre sessioni della giornata: meno attese per te e per lo studio." : "Tengono compatta la giornata dello studio.";
      }
      if (!day.slots.length) day.reason = base + 86400000 <= minStart ? "preavviso" : "pieno";
      days.push(day);
    }
    return { days: days, until: last, limitedByBlock: byBlock };
  };
  CL.firstFree = function (c) {
    c = c || CL.me(); var best = null;
    CL.pools(c).forEach(function (p) {
      if (!p.bookable || p.avail <= 0) return;
      CL.slotDays(p.typeId, { client: c }).days.some(function (d) { if (d.slots.length) { var s = d.slots[0]; if (!best || s.start < best.start) best = { start: s.start, typeId: p.typeId, name: p.name }; return true; } return false; });
    });
    return best;
  };
  function slotOk(typeId, iso, exclude) { return CL.slotDays(typeId, { exclude: exclude }).days.some(function (d) { return d.slots.some(function (s) { return s.start === iso; }); }); }
  function coachNote(o) { o.id = nid("n"); o.created = new Date().toISOString(); o.read = false; st().notifications.unshift(o); }

  /* azioni del cliente (restituiscono un token per "Ripristina") */
  CL.book = function (typeId, iso) {
    var c = CL.me(), t = S().type(typeId), p = CL.pools(c).filter(function (x) { return x.typeId === typeId; })[0];
    if (!t || !p || p.avail <= 0) return { error: "Non hai crediti disponibili per " + (t ? t.name : "questa tipologia") + "." };
    if (!p.bookable) return { error: p.message || "Questa tipologia si prenota con il coach." };
    if (!slotOk(typeId, iso)) return { error: "Questo orario non è più libero: scegline un altro." };
    var u = S().snap(), id = nid("b");
    st().bookings.push({ id: id, clientId: c.id, typeId: typeId, start: iso, dur: t.duration, status: "scheduled", gcal: true, confirmed: new Date(iso).getTime() - now() <= RULES.confirmH * 3600000, byClient: true, bookedAt: new Date().toISOString() });
    coachNote({ kind: "created", clientId: c.id, bookingId: id, when: iso });
    S().commitState(); return { id: id, undo: u };
  };
  CL.move = function (id, iso) {
    var b = CL.mine(id); if (!b) return { error: "Sessione non trovata." };
    if (!CL.canMove(b)) return { error: "Mancano meno di 24 ore: la sessione non si può più spostare." };
    if (!slotOk(b.typeId, iso, id)) return { error: "Questo orario non è più libero: scegline un altro." };
    var u = S().snap(), from = b.start;
    b.start = iso; b.confirmed = new Date(iso).getTime() - now() <= RULES.confirmH * 3600000;
    coachNote({ kind: "rescheduled", clientId: b.clientId, bookingId: id, from: from, when: iso });
    S().commitState(); return { undo: u, from: from };
  };
  CL.cancel = function (id) {
    var b = CL.mine(id); if (!b || b.status !== "scheduled") return { error: "Sessione non trovata." };
    var late = !CL.freeCancel(b), u = S().snap();
    b.status = late ? "late_cancelled" : "cancelled";
    coachNote({ kind: "cancelled", late: late, clientId: b.clientId, bookingId: id, when: b.start });
    S().commitState(); return { undo: u, late: late };
  };
  CL.confirm = function (id) { var b = CL.mine(id); if (!b) return; b.confirmed = true; b.confirmedAt = new Date().toISOString(); S().commitState(); };
  CL.feedbackOf = function (id) { return (st().feedback || {})[id] || null; };
  CL.setFeedback = function (id, rating, note) { var s = st(); if (!s.feedback) s.feedback = {}; s.feedback[id] = { rating: rating, note: note || "", at: new Date().toISOString() }; S().commitState(); };
  CL.canRate = function (b) { return b && b.status === "completed" && !b.orphan && new Date(b.start).getTime() >= now() - RULES.feedbackD * 86400000; };
  CL.pendingFeedback = function (c) { return CL.history(c).filter(function (b) { return CL.canRate(b) && !CL.feedbackOf(b.id); })[0] || null; };

  /* crediti extra (audit S1–S5) */
  CL.canBuy = function (c) { c = c || CL.me(); return !c.archived && (c.pathType === "fixed" || c.pathType === "recurring") && c.blockEndOff != null && c.blockEndOff >= 0; };
  CL.purchases = function (c) { c = c || CL.me(); var w = win(c); return (st().purchases || []).filter(function (p) { return p.clientId === c.id && (!w.from || new Date(p.at) >= w.from); }).sort(function (a, b) { return new Date(b.at) - new Date(a.at); }); };
  CL.product = function (id) { return PRODUCTS.filter(function (p) { return p.id === id; })[0] || null; };
  CL.buy = function (productId) {
    var c = CL.me(), p = CL.product(productId);
    if (!p || !CL.canBuy(c)) return { error: "Acquisto non disponibile." };
    var s = st();
    if (!c.credits[p.typeId]) c.credits[p.typeId] = [0, 0];
    c.credits[p.typeId][1] += p.qty;
    s.purchases = (s.purchases || []).concat([{ id: nid("pu"), clientId: c.id, productId: p.id, typeId: p.typeId, qty: p.qty, price: p.price, at: new Date().toISOString() }]);
    coachNote({ kind: "purchase", clientId: c.id, typeId: p.typeId, qty: p.qty, price: p.price, when: new Date().toISOString() });
    S().commitState(); return { ok: true };
  };

  /* preferenze del telefono (simulate) */
  CL.pref = function (k, def) { var p = (st().prefs || {})[CL.meId()] || {}; return p[k] == null ? def : p[k]; };
  CL.setPref = function (k, v) { var s = st(); if (!s.prefs) s.prefs = {}; var p = s.prefs[CL.meId()] || (s.prefs[CL.meId()] = {}); p[k] = v; S().commitState(); };

  /* notifiche: promemoria calcolati + azioni del coach (audit H8) */
  function tname(id) { var t = S().type(id); return t ? t.name : "Sessione"; }
  function feedItem(f) {
    var co = CL.coach().first, b = f.bookingId ? S().booking(f.bookingId) : null, tn = b ? tname(b.typeId) : "";
    var at = function (iso) { return CL.dayShort(iso) + " alle " + hm(iso); };
    var M = {
      moved: ["Repeat", "#005685", co + " ha spostato una sessione", tn + " · " + (f.from ? CL.dayShort(f.from) + " " + hm(f.from) + " → " : "") + (f.when ? at(f.when) : "")],
      cancelled: ["CalendarX", "#b91c1c", co + " ha annullato una sessione", tn + " di " + (f.when ? at(f.when) : "") + (f.charge ? " · credito scalato" : " · credito restituito")],
      booked: ["CalendarPlus", "#005685", "Nuova sessione in agenda", tn + " · " + (f.when ? at(f.when) : "") + " · inserita da " + co],
      noshow: ["UserX", "#b91c1c", "Assenza registrata", tn + " di " + (f.when ? at(f.when) : "") + " · il credito è stato scalato"],
      credits: ["Coins", "#047857", "Crediti aggiunti", "+" + f.qty + " " + tname(f.typeId) + " da " + co],
      renewed: ["Layers", "#047857", "È iniziato un nuovo blocco", (f.block ? "Blocco " + f.block + " · " : "") + "i nuovi crediti sono disponibili"],
      path: ["Rocket", "#047857", "Nuovo percorso", (f.plan || "Percorso") + " · i crediti sono disponibili"],
      bia: ["Activity", "#039be5", "Nuova misurazione BIA", "Peso " + String(f.weight).replace(".", ",") + " kg · massa magra " + String(f.muscle).replace(".", ",") + " kg"],
    };
    var m = M[f.kind] || ["Bell", "#005685", "Aggiornamento", ""];
    var go = b && b.clientId === CL.meId() ? ["sessione", { id: b.id }] : ["home", null];
    return { id: f.id, icon: m[0], color: m[1], title: m[2], body: m[3], created: f.created, read: !!f.read, feed: true, go: go };
  }
  CL.notifications = function (c) {
    c = c || CL.me(); var s = st(), reads = (s.clientReads || {})[c.id] || [], list = [];
    CL.upcoming(c).forEach(function (b) {
      if (CL.status(b).key !== "toconfirm") return;
      var since = Math.max(new Date(b.start).getTime() - RULES.confirmH * 3600000, b.bookedAt ? new Date(b.bookedAt).getTime() : 0);
      list.push({ id: "confirm-" + b.id, icon: "CalendarCheck", color: "#c2410c", title: "Conferma la tua presenza", body: tname(b.typeId) + " · " + CL.dayRel(b.start).toLowerCase() + " alle " + hm(b.start), created: new Date(since).toISOString(), go: ["sessione", { id: b.id }] });
    });
    var blk = CL.block(c), av = CL.available(c);
    if (!blk.free && !blk.ended && av > 0 && blk.daysLeft <= 7) list.push({ id: "use-" + c.id + "-" + blk.n + "-" + av, icon: "Hourglass", color: "#c2410c", title: "Crediti da usare", body: plural(av, "credito", "crediti") + " da prenotare entro " + blk.endLabel, created: new Date(midnight(blk.end).getTime() - 7 * 86400000).toISOString(), go: ["prenota", null] });
    else if (!blk.ended && av > 0 && av <= 2) list.push({ id: "low-" + c.id + "-" + av, icon: "Coins", color: "#c2410c", title: av === 1 ? "Ti resta 1 credito" : "Ti restano " + av + " crediti", body: CL.canBuy(c) ? "Puoi aggiungerne con un Booster." : "Per continuare parla con " + CL.coach().first + ".", created: new Date(now() - 3600000).toISOString(), go: [CL.canBuy(c) ? "booster" : "home", null] });
    var pf = CL.pendingFeedback(c);
    if (pf) list.push({ id: "fb-" + pf.id, icon: "Star", color: "#b45309", title: "Com'è andata?", body: "Valuta la sessione di " + CL.dayLong(pf.start).toLowerCase(), created: endOf(pf).toISOString(), go: ["sessione", { id: pf.id }] });
    (s.clientFeed || []).forEach(function (f) { if (f.clientId === c.id) list.push(feedItem(f)); });
    list.forEach(function (n) { n.unread = n.feed ? !n.read : reads.indexOf(n.id) < 0; });
    return list.sort(function (a, b) { return new Date(b.created) - new Date(a.created); });
  };
  function mark(id, s, cid) {
    var f = (s.clientFeed || []).filter(function (x) { return x.id === id; })[0];
    if (f) { f.read = true; return; }
    if (!s.clientReads) s.clientReads = {};
    var r = s.clientReads[cid] || (s.clientReads[cid] = []);
    if (r.indexOf(id) < 0) r.push(id);
  }
  CL.markRead = function (id) { mark(id, st(), CL.meId()); S().commitState(); };
  CL.markAllRead = function () { var s = st(), cid = CL.meId(); CL.notifications().forEach(function (n) { if (n.unread) mark(n.id, s, cid); }); S().commitState(); };
  CL.unread = function () { return CL.notifications().filter(function (n) { return n.unread; }).length; };
})();

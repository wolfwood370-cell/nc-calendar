/* NC Calendar — prototipo coach: archivio dati condiviso tra le pagine.
   Stato in localStorage, date relative a oggi (si rigenera ogni giorno). */
(function () {
  if (window.NCStore) return;
  var KEY = "nc-proto-v10";
  var PAGES = {
    panoramica: { file: "Coach Panoramica.dc.html", ready: true },
    calendario: { file: "Coach Calendario.dc.html", ready: true },
    clienti: { file: "Coach Clienti.dc.html", ready: true },
    cliente: { file: "Coach Cliente.dc.html", ready: true },
    tipologie: { file: "Coach Tipologie.dc.html", ready: true },
    disponibilita: { file: "Coach Disponibilita.dc.html", ready: true },
    integrazioni: { file: "Coach Integrazioni.dc.html", ready: true },
  };
  var TYPES = [
    { id: "pt", name: "Personal Training", color: "#003e62", duration: 60, icon: "Dumbbell" },
    { id: "bia", name: "Misurazione BIA", color: "#039be5", duration: 30, icon: "Scale" },
    { id: "test", name: "Test funzionale", color: "#0b8043", duration: 45, icon: "Activity" },
    { id: "cons", name: "Consulenza", color: "#8e24aa", duration: 30, icon: "MessageCircle" },
  ];
  var TYPE_EXTRA = {
    pt: { description: "Allenamento individuale in sala.", buffer: 10, location: "studio", address: "Via Roma 12, Bologna", bookable: true, message: "" },
    bia: { description: "Analisi della composizione corporea.", buffer: 5, location: "studio", address: "Via Roma 12, Bologna", bookable: true, message: "" },
    test: { description: "Valutazione di forza, mobilità e resistenza.", buffer: 15, location: "studio", address: "Via Roma 12, Bologna", bookable: false, message: "Per prenotare il test scrivimi su WhatsApp." },
    cons: { description: "Colloquio conoscitivo o di aggiornamento.", buffer: 0, location: "online", address: "", bookable: true, message: "" },
  };
  var DOW = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  var DOWS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  var MON = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  var MONS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

  function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function midnight(off) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (off || 0)); return d; }
  function at(off, h, m) { var d = midnight(off); d.setHours(h, m || 0, 0, 0); return d.toISOString(); }
  function isoOff(off) { var d = midnight(off); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function workOff(off) { var o = off; while ([0, 6].indexOf(midnight(o).getDay()) >= 0) o++; return o; }
  function slug(n) { return String(n).toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""); }
  function initials(n) { return String(n).split(" ").map(function (w) { return w[0] || ""; }).join("").slice(0, 2).toUpperCase(); }

  function seed() {
    var C = [
      ["Giulia Bianchi", "giulia.b@email.it", "+39 340 118 22 09", "fixed", "Percorso Fisso", [3, 6], { pt: [3, 5], bia: [1, 2], test: [1, 1] }, 74, 96, "Ricomposizione corporea"],
      ["Luca Verdi", "luca.verdi@email.it", "+39 347 220 71 33", "recurring", "Abbonamento Mensile", [2, 4], { pt: [4, 8], bia: [0, 1] }, 29, 88, "Ipertrofia e forza"],
      ["Sara Neri", "sara.neri@email.it", "+39 333 902 44 12", "fixed", "Percorso Fisso", [6, 6], { pt: [4, 5], bia: [2, 2], test: [1, 1] }, 12, 74, "Dimagrimento"],
      ["Andrea Gallo", "a.gallo@email.it", "+39 348 771 09 55", "fixed", "PT Pack 12", [1, 3], { pt: [5, 12], bia: [0, 1], test: [1, 1] }, 110, 91, "Preparazione atletica"],
      ["Marta Conti", "marta.c@email.it", "+39 340 556 88 21", "recurring", "Abbonamento Mensile", [4, 4], { pt: [3, 8], bia: [1, 1] }, 4, 80, "Tonificazione"],
      ["Davide Ferrari", "d.ferrari@email.it", "+39 351 224 66 90", "fixed", "Percorso Fisso", [6, 6], { pt: [8, 8], bia: [2, 2], test: [1, 1] }, -20, 100, "Recupero post-infortunio"],
      ["Elena Ricci", "elena.ricci@email.it", "+39 349 118 33 74", "free", "Cliente Libero", [0, 0], { pt: [2, 4], bia: [0, 1] }, null, 85, "Mantenimento"],
      ["Paolo Moretti", "p.moretti@email.it", "+39 346 700 12 48", "fixed", "Percorso Fisso", [2, 6], { pt: [2, 5], bia: [1, 2], test: [1, 1] }, 148, 93, "Forza massimale"],
      ["Chiara Russo", "chiara.russo@email.it", "+39 342 881 20 17", "recurring", "Abbonamento Mensile", [1, 4], { pt: [2, 8] }, 21, null, "Postura"],
    ];
    var clients = C.map(function (r) {
      return { id: slug(r[0]), name: r[0], email: r[1], phone: r[2], pathType: r[3], plan: r[4], block: r[5], credits: r[6], blockEndOff: r[7], att: r[8], goal: r[9], archived: false };
    });
    var todayDow = midnight(0).getDay();
    var S = todayDow === 0 ? [] : todayDow === 6 ? [["elena-ricci", "pt", 9, 0, "completed"], ["paolo-moretti", "bia", 10, 30], ["giulia-bianchi", "pt", 11, 30]] : [
      ["luca-verdi", "pt", 7, 30, "completed"], ["giulia-bianchi", "pt", 9, 0], ["paolo-moretti", "bia", 10, 30],
      ["elena-ricci", "cons", 12, 30], ["sara-neri", "test", 15, 0], ["andrea-gallo", "pt", 18, 0], ["marta-conti", "pt", 19, 30],
    ];
    var bookings = S.map(function (r, i) {
      var t = TYPES.filter(function (x) { return x.id === r[1]; })[0];
      return { id: "b" + i, clientId: r[0], typeId: r[1], start: at(0, r[2], r[3]), dur: t.duration, status: r[4] || "scheduled" };
    });
    var w1 = workOff(1), w2 = workOff(w1 + 1), w3 = workOff(w2 + 1);
    bookings.push({ id: "b20", clientId: "giulia-bianchi", typeId: "pt", start: at(w2, 10, 0), dur: 60, status: "scheduled", confirmed: true });
    bookings.push({ id: "b21", clientId: "chiara-russo", typeId: "pt", start: at(w1, 18, 0), dur: 60, status: "scheduled" });
    var PAT = {
      1: [["luca-verdi", "pt", 7, 30], ["giulia-bianchi", "pt", 9, 0], ["chiara-russo", "pt", 12, 30], ["andrea-gallo", "pt", 18, 0], ["marta-conti", "pt", 19, 30]],
      2: [["paolo-moretti", "pt", 8, 0], ["sara-neri", "pt", 10, 0], ["luca-verdi", "pt", 18, 30]],
      3: [["andrea-gallo", "pt", 7, 30], ["marta-conti", "bia", 9, 0], ["giulia-bianchi", "pt", 11, 0], ["chiara-russo", "cons", 16, 0], ["paolo-moretti", "pt", 18, 0]],
      4: [["sara-neri", "pt", 8, 30], ["luca-verdi", "test", 10, 0], ["andrea-gallo", "bia", 12, 0], ["marta-conti", "pt", 18, 0]],
      5: [["giulia-bianchi", "pt", 7, 30], ["paolo-moretti", "pt", 9, 30], ["chiara-russo", "pt", 17, 30], ["andrea-gallo", "pt", 18, 30]],
      6: [["elena-ricci", "pt", 9, 0], ["paolo-moretti", "bia", 10, 30]],
    };
    var dow = midnight(0).getDay(), mondayOff = dow === 0 ? -6 : 1 - dow, n = 100;
    for (var hoff = mondayOff - 56; hoff < mondayOff; hoff++) {
      var hwd = midnight(hoff).getDay(), hwk = Math.floor((hoff - mondayOff) / 7);
      (PAT[hwd] || []).forEach(function (r, i) {
        if ((r[1] === "bia" || r[1] === "test") && ((hwk % 4) + 4) % 4 !== 0) return;
        var t = TYPES.filter(function (x) { return x.id === r[1]; })[0];
        var k = (hoff * 7 + i * 3) & 31;
        var status = k % 11 === 0 ? "no_show" : k % 17 === 0 ? "cancelled" : "completed";
        bookings.push({ id: "h" + (n++), clientId: r[0], typeId: r[1], start: at(hoff, r[2], r[3]), dur: t.duration, status: status, gcal: true });
      });
    }
    bookings.push({ id: "o" + (n++), clientId: "giulia-bianchi", typeId: "pt", start: at(mondayOff - 3, 17, 0), dur: 60, status: "completed", gcal: true, orphan: true, title: "PT Giulia (da Google)" });
    for (var off = mondayOff; off <= mondayOff + 13; off++) {
      if (off === 0) continue;
      var wd = midnight(off).getDay(), wk = Math.floor((off - mondayOff) / 7);
      (PAT[wd] || []).forEach(function (r, i) {
        if ((r[1] === "bia" || r[1] === "test") && wk % 4 !== 0) return;
        var start = at(off, r[2], r[3]);
        var clash = bookings.some(function (b) { return b.start === start; });
        if (clash) return;
        var t = TYPES.filter(function (x) { return x.id === r[1]; })[0];
        var status = off < 0 ? ((off + i) % 9 === 0 ? "no_show" : "completed") : "scheduled";
        bookings.push({ id: "b" + (n++), clientId: r[0], typeId: r[1], start: start, dur: t.duration, status: status, confirmed: off > 0 && off <= 3 && i % 2 === 0, gcal: !(off === 2 && i === 2) });
      });
      if (wd === 2 || wd === 4) bookings.push({ id: "p" + (n++), personal: true, title: "Allenamento personale", start: at(off, 13, 0), dur: 60, status: "scheduled" });
    }
    bookings.push({ id: "p" + (n++), personal: true, title: "Commercialista", start: at(0, 14, 0), dur: 60, status: "scheduled" });
    bookings.push({ id: "a" + (n++), allDay: true, title: "Compleanno Sara Neri", start: at(mondayOff + 2, 0, 0), dur: 1440, status: "scheduled" });
    bookings.push({ id: "a" + (n++), allDay: true, title: "Studio chiuso · manutenzione", start: at(mondayOff + 12, 0, 0), dur: 1440, status: "scheduled" });
    bookings.forEach(function (b) { if (b.gcal == null) b.gcal = true; });
    var external = [
      { id: "g1", title: "Allenamento", start: at(w1, 8, 0), dur: 60, status: "open" },
      { id: "g2", title: "Valutazione iniziale", start: at(w2, 17, 30), dur: 45, status: "open" },
      { id: "g3", title: "PT – Federica", start: at(w3, 7, 0), dur: 60, status: "open" },
    ];
    var notifications = [
      { id: "n1", kind: "created", clientId: "chiara-russo", bookingId: "b21", when: at(w1, 18, 0), created: new Date(Date.now() - 25 * 60000).toISOString(), read: false },
      { id: "n2", kind: "rescheduled", clientId: "giulia-bianchi", bookingId: "b20", from: at(w1, 9, 0), when: at(w2, 10, 0), created: new Date(Date.now() - 3 * 3600000).toISOString(), read: false },
      { id: "n3", kind: "created", clientId: S.length > 1 ? "paolo-moretti" : "chiara-russo", bookingId: S.length > 1 ? "b1" === "x" ? "b1" : (todayDow === 6 ? "b1" : "b2") : "b21", when: S.length > 1 ? at(0, 10, 30) : at(w1, 18, 0), created: new Date(Date.now() - 26 * 3600000).toISOString(), read: true },
    ];
    var notes = {
      "giulia-bianchi": "Squat 4×6 a 55 kg, buona tenuta. Continuare la mobilità della spalla destra prima dei press.",
      "luca-verdi": "Panca in progressione (+2,5 kg). Chiede più lavoro sulle braccia.",
      "sara-neri": "Lombalgia assente questa settimana. Riprendere gli stacchi rumeni leggeri.",
      "andrea-gallo": "Sprint 6×30 m, tempi in calo nelle ultime due ripetute: gestire il recupero.",
      "marta-conti": "Ha ridotto le sessioni per lavoro: proporre il rinnovo a 2 sessioni a settimana.",
      "paolo-moretti": "Massimale stacco stimato 150 kg. Test BIA programmato.",
    };
    // Blocchi da 4 settimane allineati al lunedì: blockEndOff = giorni alla fine del blocco in corso (0–27).
    var WEEK_IN_BLOCK = { "marta-conti": 3, "sara-neri": 2, "luca-verdi": 1, "giulia-bianchi": 2, "andrea-gallo": 0, "paolo-moretti": 1, "chiara-russo": 1 };
    clients.forEach(function (c) {
      if (c.pathType === "free" || c.blockEndOff == null) return;
      if (c.blockEndOff < 0) { c.blockEndOff = mondayOff - 1 - 7 * Math.max(1, Math.round(-c.blockEndOff / 7)); return; }
      var wk = WEEK_IN_BLOCK[c.id] != null ? WEEK_IN_BLOCK[c.id] : c.blockEndOff % 4;
      c.blockEndOff = mondayOff - wk * 7 + 27;
    });
    // Crediti coerenti con le sessioni: totale = sessioni del blocco in corso + residuo voluto.
    var LEFT = { "giulia-bianchi": { pt: 3, bia: 1, test: 1 }, "luca-verdi": { pt: 4, test: 1 }, "sara-neri": { pt: 1, test: 0 }, "andrea-gallo": { pt: 5, bia: 0, test: 1 }, "marta-conti": { pt: 3, bia: 0 }, "paolo-moretti": { pt: 4, bia: 0 }, "chiara-russo": { pt: 5, cons: 0 }, "elena-ricci": { pt: 2, cons: 0 } };
    clients.forEach(function (c) {
      if (!LEFT[c.id]) return;
      var from, to;
      if (c.pathType === "free") { c.creditsFrom = isoOff(mondayOff - 14); from = midnight(mondayOff - 14); to = midnight(3650); }
      else { to = midnight(c.blockEndOff + 1); from = midnight(c.blockEndOff - 27); }
      var used = {};
      bookings.forEach(function (b) { if (b.clientId !== c.id || b.orphan || ["completed", "no_show", "scheduled"].indexOf(b.status) < 0) return; var t = new Date(b.start); if (t >= from && t < to) used[b.typeId] = (used[b.typeId] || 0) + 1; });
      var cr = {};
      Object.keys(LEFT[c.id]).forEach(function (k) { var tot = (used[k] || 0) + LEFT[c.id][k]; if (tot > 0) cr[k] = [0, tot]; });
      Object.keys(used).forEach(function (k) { if (!cr[k]) cr[k] = [0, used[k]]; });
      c.credits = cr;
    });
    var LIM = { "giulia-bianchi": "Fastidio spalla destra (in gestione)", "sara-neri": "Lombalgia occasionale", "davide-ferrari": "Pregressa ricostruzione LCA" };
    var BIA = {
      "giulia-bianchi": [[-150, 64.2, 24.1, 29.8], [-120, 63.5, 24.4, 28.9], [-90, 62.9, 24.6, 28.1], [-60, 62.1, 24.9, 27.2], [-30, 61.6, 25.1, 26.4], [-5, 61.2, 25.3, 25.9]],
      "luca-verdi": [[-120, 78.4, 35.2, 18.5], [-80, 79.1, 35.9, 18.1], [-40, 79.8, 36.6, 17.6], [-10, 80.2, 37.0, 17.2]],
      "sara-neri": [[-140, 71.0, 25.0, 33.4], [-100, 69.6, 25.1, 32.0], [-60, 68.3, 25.3, 30.6], [-20, 67.4, 25.4, 29.7]],
      "paolo-moretti": [[-90, 84.0, 40.1, 16.8], [-45, 84.6, 40.8, 16.4]],
    };
    clients.forEach(function (c) {
      c.limits = LIM[c.id] || "";
      c.privateNote = "";
      c.autoRenew = c.pathType === "recurring";
      c.weekShifts = {};
      c.bia = (BIA[c.id] || []).map(function (r) { var d = midnight(r[0]); return { date: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"), weight: r[1], muscle: r[2], fat: r[3] }; });
    });
    var availability = { 1: [[7, 14], [15, 21]], 2: [[7, 14], [15, 21]], 3: [[7, 14], [15, 21]], 4: [[7, 14], [15, 21]], 5: [[7, 14], [15, 21]], 6: [[8, 13]] };
    var invitations = [
      { id: "i1", name: "Federica Longo", email: "federica.longo@email.it", phone: "+39 345 220 18 40", sent: new Date(Date.now() - 3 * 86400000).toISOString() },
      { id: "i2", name: "Matteo Sala", email: "m.sala@email.it", phone: "", sent: new Date(Date.now() - 9 * 86400000).toISOString() },
    ];
    clients.forEach(function (c) { c.created = new Date(Date.now() - (60 + c.name.length * 9) * 86400000).toISOString(); });
    clients.push({ id: "roberto-fontana", name: "Roberto Fontana", email: "r.fontana@email.it", phone: "+39 338 410 55 02", pathType: "fixed", plan: "Percorso Fisso", block: [3, 3], credits: { pt: [10, 12], bia: [1, 1] }, blockEndOff: -40, att: 82, goal: "Mobilità", archived: true, created: new Date(Date.now() - 200 * 86400000).toISOString() });
    return { v: 10, exceptions: [{ id: "x1", from: isoOff(mondayOff + 10), to: isoOff(mondayOff + 10), allDay: false, start: 14, end: 18, reason: "Corso di aggiornamento" }, { id: "x2", from: isoOff(mondayOff + 18), to: isoOff(mondayOff + 20), allDay: true, start: null, end: null, reason: "Ferie" }], types: TYPES.map(function (t) { return Object.assign({}, t, TYPE_EXTRA[t.id]); }), day: dayKey(new Date()), invitations: invitations, notes: notes, availability: availability, lastSync: new Date(Date.now() - 4 * 60000).toISOString(), coach: { name: "Marco Rossi", email: "marco@ncstudio.it" }, clients: clients, bookings: bookings, external: external, notifications: notifications, ytd: { pt: 312, bia: 64, test: 38, cons: 44 } };
  }

  var state;
  try { state = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { state = null; }
  if (!state || state.v !== 10 || state.day !== dayKey(new Date())) state = seed();
  var listeners = [];
  var toast = null, toastTimer = null, undoStack = {};

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function emit() { listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  function commit() { save(); emit(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    try { var s = JSON.parse(e.newValue || "null"); if (s && s.v === 10) { state = s; emit(); } } catch (err) {}
  });

  function snapshot(label) { var id = "u" + Date.now() + Math.random().toString(36).slice(2, 6); undoStack[id] = clone(state); return id; }

  var API = {
    pages: PAGES,
    get types() { return (state.types || TYPES).filter(function (t) { return !t.deleted; }); },
    get: function () { return state; },
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    reset: function () { state = seed(); undoStack = {}; commit(); },
    type: function (id) { return byId(state.types || TYPES, id); },
    client: function (id) { return byId(state.clients, id); },
    initials: initials,
    href: function (page, params) {
      var p = PAGES[page]; if (!p) return "#";
      var q = params ? Object.keys(params).filter(function (k) { return params[k] != null; }).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&") : "";
      return encodeURI(p.file) + (q ? "?" + q : "");
    },
    go: function (page, params) {
      var p = PAGES[page];
      if (!p || !p.ready) { API.showToast({ msg: "Questa pagina è la prossima da rivedere.", tone: "info" }); return; }
      var target = API.href(page, params);
      if (API.leaveGuard && !API.leaveGuard(target)) return;
      location.href = target;
    },
    param: function (k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } },

    /* formattazione */
    fmtTime: function (iso) { var d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); },
    fmtDur: function (m) { return m >= 60 ? Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "") : m + "m"; },
    fmtDay: function (iso) { var d = new Date(iso); return DOWS[d.getDay()] + " " + d.getDate() + " " + MONS[d.getMonth()]; },
    fmtLongToday: function () { var d = new Date(); var s = DOW[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()]; return s.charAt(0).toUpperCase() + s.slice(1); },
    fmtDateOff: function (off) { var d = midnight(off); return d.getDate() + " " + MONS[d.getMonth()] + " " + d.getFullYear(); },
    ago: function (iso) {
      var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
      if (m < 1) return "adesso"; if (m < 60) return m + " min fa";
      var h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? " ora fa" : " ore fa");
      var g = Math.round(h / 24); return g === 1 ? "ieri" : g + " giorni fa";
    },

    /* regole condivise */
    creditsOf: function (c) {
      var out = {}; if (!c) return out;
      var keys = Object.keys(c.credits || {});
      if (c.pathType !== "free" && c.blockEndOff != null && c.blockEndOff < 0) { keys.forEach(function (k) { out[k] = [c.credits[k][1], c.credits[k][1]]; }); return out; }
      var from, to;
      if (c.pathType === "free") { from = c.creditsFrom ? API.parseDate(c.creditsFrom) : midnight(-3650); to = midnight(3650); }
      else { var end = midnight(c.blockEndOff != null ? c.blockEndOff : 27); from = API.addDays(end, -27); to = API.addDays(end, 1); }
      keys.forEach(function (k) { out[k] = [0, c.credits[k][1]]; });
      state.bookings.forEach(function (b) {
        if (b.clientId !== c.id || b.orphan || b.noCredit || !out[b.typeId]) return;
        if (["completed", "no_show", "scheduled", "late_cancelled"].indexOf(b.status) < 0) return;
        var t = new Date(b.start); if (t >= from && t < to) out[b.typeId][0]++;
      });
      keys.forEach(function (k) { out[k][0] = Math.min(out[k][0], out[k][1]); });
      return out;
    },
    remaining: function (c) { var cr = API.creditsOf(c), r = 0; Object.keys(cr).forEach(function (k) { r += Math.max(0, cr[k][1] - cr[k][0]); }); return r; },
    attendance: function (id) {
      var now = API.now(), from = now - 56 * 86400000, d = 0, n = 0;
      state.bookings.forEach(function (b) { if (b.clientId !== id || b.orphan) return; var t = new Date(b.start).getTime(); if (t < from || t > now) return; if (b.status === "completed") d++; if (b.status === "no_show") n++; });
      return d + n ? Math.round((d / (d + n)) * 100) : null;
    },
    getClock: function () { try { return localStorage.getItem("nc-proto-clock") || "10:40"; } catch (e) { return "10:40"; } },
    setClock: function (v) { if (!v || v === API.getClock()) return; try { localStorage.setItem("nc-proto-clock", v); } catch (e) {} emit(); },
    now: function () { var c = API.getClock(); if (c === "reale") return Date.now(); var p = c.split(":"); var d = new Date(); d.setHours(+p[0], +p[1], 0, 0); return d.getTime(); },
    renewalInfo: function (c) {
      // Regola unica "in scadenza" (audit P4): ≤ 2 crediti residui oppure blocco che termina entro 7 giorni.
      if (c.archived || c.pathType === "free") return null;
      var rem = API.remaining(c);
      var days = c.blockEndOff;
      if (days != null && days < 0 && rem === 0) return null;
      var byCredits = rem <= 2, byDate = days != null && days >= 0 && days <= 7;
      if (!byCredits && !byDate) return null;
      var reason = byDate ? (days === 0 ? "Il blocco scade oggi" : days === 1 ? "Il blocco scade domani" : "Il blocco scade tra " + days + " giorni") : rem === 0 ? "Crediti esauriti" : rem === 1 ? "1 credito rimasto" : rem + " crediti rimasti";
      return { clientId: c.id, remaining: rem, days: days, reason: reason, sort: byDate ? days : 10 + rem };
    },
    renewals: function () {
      return state.clients.map(API.renewalInfo).filter(Boolean).sort(function (a, b) { return a.sort - b.sort; });
    },
    todaySessions: function (now) {
      now = now || API.now();
      var s = midnight(0).getTime(), e = midnight(1).getTime();
      var list = state.bookings.filter(function (b) { var t = new Date(b.start).getTime(); return b.clientId && !b.personal && !b.allDay && !b.orphan && t >= s && t < e && b.status !== "cancelled" && b.status !== "late_cancelled" && b.status !== "ignored"; })
        .sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
      var nextMarked = false;
      return list.map(function (b) {
        var st = new Date(b.start).getTime(), en = st + b.dur * 60000, phase;
        if (b.status === "completed") phase = "done";
        else if (b.status === "no_show") phase = "noshow";
        else if (en <= now) phase = "toconfirm";
        else if (st <= now) phase = "now";
        else if (!nextMarked) { phase = "next"; nextMarked = true; }
        else phase = "later";
        return { b: b, phase: phase, minsTo: Math.round((st - now) / 60000) };
      });
    },
    openExternal: function () { return state.external.filter(function (x) { return x.status === "open"; }).sort(function (a, b) { return new Date(a.start) - new Date(b.start); }); },
    searchClients: function (q) {
      q = String(q || "").trim().toLowerCase(); if (!q) return [];
      var qd = q.replace(/\D/g, "");
      return state.clients.filter(function (c) { return !c.archived && (c.name.toLowerCase().indexOf(q) >= 0 || c.email.indexOf(q) >= 0 || (qd.length > 2 && c.phone.replace(/\D/g, "").indexOf(qd) >= 0)); }).slice(0, 6);
    },
    unreadCount: function () { return state.notifications.filter(function (n) { return !n.read; }).length; },

    /* azioni (restituiscono un token per "Annulla") */
    setBookingStatus: function (id, status) {
      var b = byId(state.bookings, id); if (!b) return null;
      var u = snapshot();
      b.status = status;
      commit(); return u;
    },
    assignExternal: function (id, clientId, typeId, useCredit) { return API.resolveExternal(id, "assigned", { clientId: clientId, typeId: typeId, useCredit: useCredit }); },
    markPersonal: function (id) { return API.resolveExternal(id, "personal"); },
    renew: function (clientId) {
      var c = API.client(clientId); if (!c) return null;
      var u = snapshot();
      Object.keys(c.credits).forEach(function (k) { c.credits[k] = [0, c.credits[k][1]]; });
      if (c.block && c.block[1]) { if (c.block[0] >= c.block[1]) c.block[1] += 1; c.block[0] += 1; }
      c.blockEndOff = (c.blockEndOff != null && c.blockEndOff > 0 ? c.blockEndOff : 0) + 28;
      if (c.pathType === "fixed" && c.block[0] > c.block[1]) c.block[1] = c.block[0];
      commit(); return u;
    },
    /* calendario */
    isoDate: function (d) { d = new Date(d); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); },
    parseDate: function (str) { if (!str) return null; var p = String(str).split("-"); if (p.length !== 3) return null; var d = new Date(+p[0], +p[1] - 1, +p[2]); return isNaN(d) ? null : d; },
    mondayOf: function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); var w = x.getDay(); x.setDate(x.getDate() + (w === 0 ? -6 : 1 - w)); return x; },
    addDays: function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; },
    dayLabel: function (d) { d = new Date(d); return { dow: DOWS[d.getDay()], num: d.getDate(), mon: MONS[d.getMonth()], long: DOW[d.getDay()].charAt(0).toUpperCase() + DOW[d.getDay()].slice(1) + " " + d.getDate() + " " + MON[d.getMonth()] }; },
    rangeLabel: function (a, b) { a = new Date(a); b = new Date(b); if (a.getMonth() === b.getMonth()) return a.getDate() + " – " + b.getDate() + " " + MON[a.getMonth()] + " " + a.getFullYear(); return a.getDate() + " " + MONS[a.getMonth()] + " – " + b.getDate() + " " + MONS[b.getMonth()] + " " + b.getFullYear(); },
    bookingsBetween: function (a, b) { var s = new Date(a).getTime(), e = new Date(b).getTime(); return state.bookings.filter(function (x) { var t = new Date(x.start).getTime(); return x.status !== "cancelled" && x.status !== "late_cancelled" && x.status !== "ignored" && t >= s && t < e; }); },
    externalBetween: function (a, b) { var s = new Date(a).getTime(), e = new Date(b).getTime(); return state.external.filter(function (x) { var t = new Date(x.start).getTime(); return x.status === "open" && t >= s && t < e; }); },
    booking: function (id) { return byId(state.bookings, id); },
    external: function (id) { return byId(state.external, id); },
    lastNote: function (clientId) { return (state.notes || {})[clientId] || null; },
    notOnGoogle: function () { var now = API.now(); return state.bookings.filter(function (b) { return b.status === "scheduled" && !b.personal && !b.allDay && b.gcal === false && new Date(b.start).getTime() > now - 86400000; }); },
    createBooking: function (o) {
      var u = snapshot();
      var id = (o.personal ? "p" : "b") + Date.now();
      var t = o.typeId ? API.type(o.typeId) : null;
      state.bookings.push({ id: id, clientId: o.clientId || null, typeId: o.typeId || null, personal: !!o.personal, title: o.title || null, start: o.start, dur: o.dur || (t ? t.duration : 60), status: "scheduled", gcal: true, note: o.note || null });
      commit(); return { undo: u, id: id };
    },
    updateBooking: function (id, patch) { var b = byId(state.bookings, id); if (!b) return null; var u = snapshot(); Object.keys(patch).forEach(function (k) { b[k] = patch[k]; }); commit(); return u; },
    cancelBooking: function (id, charge) { var b = byId(state.bookings, id); if (!b) return null; var u = snapshot(); b.status = charge ? "late_cancelled" : "cancelled"; commit(); return u; },
    deleteBooking: function (id) { var b = byId(state.bookings, id); if (!b) return null; var u = snapshot(); b.status = "ignored"; commit(); return u; },
    isLate: function (b) { return new Date(b.start).getTime() - API.now() < 24 * 3600000; },
    resolveExternal: function (id, kind, o) {
      var x = byId(state.external, id); if (!x) return null;
      var u = snapshot();
      x.status = kind;
      o = o || {};
      if (kind === "assigned") { var t = API.type(o.typeId); state.bookings.push({ id: "b" + Date.now(), clientId: o.clientId, typeId: o.typeId, start: x.start, dur: t ? t.duration : x.dur, status: "scheduled", gcal: true, noCredit: !o.useCredit }); }
      if (kind === "personal") state.bookings.push({ id: "p" + Date.now(), personal: true, title: x.title, start: x.start, dur: x.dur, status: "scheduled", gcal: true });
      if (kind === "cons") state.bookings.push({ id: "c" + Date.now(), clientId: null, typeId: "cons", title: x.title, start: x.start, dur: x.dur, status: "scheduled", gcal: true });
      commit(); return u;
    },
    repairGcal: function (id) { var b = byId(state.bookings, id); if (!b) return null; var u = snapshot(); b.gcal = true; commit(); return u; },
    syncNow: function () { state.lastSync = new Date().toISOString(); commit(); },
    /* clienti */
    clientStatus: function (c) {
      if (c.archived) return "archived";
      if (c.pathType !== "free" && c.blockEndOff != null && c.blockEndOff < 0 && API.remaining(c) === 0) return "completed";
      if (API.renewalInfo(c)) return "expiring";
      return "active";
    },
    totals: function (c) { var cr = API.creditsOf(c), u = 0, t = 0; Object.keys(cr).forEach(function (k) { u += cr[k][0]; t += cr[k][1]; }); return { used: u, total: t, left: Math.max(0, t - u) }; },
    nextSession: function (clientId, now) { now = now || API.now(); var n = null; state.bookings.forEach(function (b) { if (b.clientId === clientId && b.status === "scheduled") { var t = new Date(b.start).getTime(); if (t > now && (!n || t < new Date(n.start).getTime())) n = b; } }); return n; },
    lastActivity: function (clientId) { var l = null; state.bookings.forEach(function (b) { if (b.clientId === clientId && b.status === "completed") { if (!l || new Date(b.start) > new Date(l.start)) l = b; } }); return l; },
    setArchived: function (id, on) { var c = API.client(id); if (!c) return null; var u = snapshot(); c.archived = !!on; commit(); return u; },
    deleteClient: function (id) { var u = snapshot(); state.clients = state.clients.filter(function (c) { return c.id !== id; }); state.bookings = state.bookings.filter(function (b) { return b.clientId !== id; }); commit(); return u; },
    createClient: function (o) {
      var u = snapshot();
      var name = (o.first + " " + o.last).trim(), id = slug(name) + "-" + Date.now().toString(36).slice(-4);
      var credits = {}; Object.keys(o.credits || {}).forEach(function (k) { if (o.credits[k] > 0) credits[k] = [0, o.credits[k]]; });
      var plan = o.pathType === "recurring" ? "Abbonamento Mensile" : o.pathType === "free" ? "Cliente Libero" : "Percorso Fisso";
      state.clients.push({ id: id, name: name, email: o.email, phone: o.phone || "", pathType: o.pathType, plan: plan, block: o.pathType === "free" ? [0, 0] : [1, o.blocks || 1], credits: credits, blockEndOff: o.pathType === "free" ? null : Math.round((API.mondayOf(new Date()).getTime() - midnight(0).getTime()) / 86400000) + 27, att: null, goal: "", archived: false, created: new Date().toISOString() });
      commit(); return { undo: u, id: id };
    },
    invite: function (o) { var u = snapshot(); state.invitations.unshift({ id: "i" + Date.now(), name: o.name, email: o.email, phone: o.phone || "", sent: new Date().toISOString() }); commit(); return u; },
    resendInvite: function (id) { var i = byId(state.invitations, id); if (!i) return null; i.sent = new Date().toISOString(); commit(); return true; },
    cancelInvite: function (id) { var u = snapshot(); state.invitations = state.invitations.filter(function (i) { return i.id !== id; }); commit(); return u; },
    /* profilo */
    clientBookings: function (id) { return state.bookings.filter(function (b) { return b.clientId === id && b.status !== "ignored"; }).sort(function (a, b) { return new Date(b.start) - new Date(a.start); }); },
    updateClient: function (id, patch, silent) { var c = API.client(id); if (!c) return null; var u = silent ? null : snapshot(); Object.keys(patch).forEach(function (k) { c[k] = patch[k]; }); commit(); return u; },
    blocksOf: function (c) {
      if (!c || c.pathType === "free" || !c.block || !c.block[1]) return [];
      var cur = Math.max(1, c.block[0]), end = midnight(c.blockEndOff != null ? c.blockEndOff : 27), curStart = API.addDays(end, -27);
      var total = c.pathType === "recurring" ? cur : c.block[1];
      var out = [];
      for (var i = 1; i <= total; i++) { var st = API.addDays(curStart, (i - cur) * 28); out.push({ n: i, start: st, end: API.addDays(st, 27), current: i === cur }); }
      return out;
    },
    addBia: function (id, m) { var c = API.client(id); if (!c) return null; var u = snapshot(); c.bia = (c.bia || []).concat([m]).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); commit(); return u; },
    removeBia: function (id, date) { var c = API.client(id); if (!c) return null; var u = snapshot(); c.bia = (c.bia || []).filter(function (m) { return m.date !== date; }); commit(); return u; },
    addExtraCredits: function (id, typeId, qty) { var c = API.client(id); if (!c) return null; var u = snapshot(); if (!c.credits[typeId]) c.credits[typeId] = [0, 0]; c.credits[typeId][1] += qty; commit(); return u; },
    newPath: function (id, o) {
      var c = API.client(id); if (!c) return null; var u = snapshot();
      var credits = {}; Object.keys(o.credits).forEach(function (k) { if (o.credits[k] > 0) credits[k] = [0, o.credits[k]]; });
      c.pathType = o.pathType; c.plan = o.pathType === "recurring" ? "Abbonamento Mensile" : "Percorso Fisso";
      c.block = [1, o.pathType === "recurring" ? 1 : o.blocks]; c.credits = credits; c.blockEndOff = 27 + (o.startOff || 0); c.weekShifts = {}; c.archived = false;
      commit(); return u;
    },
    setLeaveGuard: function (fn) { API.leaveGuard = fn || null; },
    leaveGuard: null,
    /* tipologie */
    typeUsage: function (id) {
      var m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0); var m1 = new Date(m0); m1.setMonth(m1.getMonth() + 1);
      var month = state.bookings.filter(function (b) { var t = new Date(b.start); return b.typeId === id && b.status !== "cancelled" && b.status !== "ignored" && t >= m0 && t < m1; }).length;
      var future = state.bookings.filter(function (b) { return b.typeId === id && b.status === "scheduled" && new Date(b.start).getTime() > API.now(); }).length;
      var clients = state.clients.filter(function (c) { return !c.archived && c.credits[id] && c.credits[id][1] > 0; }).length;
      return { month: month, future: future, clients: clients };
    },
    saveType: function (o) {
      var u = snapshot();
      if (o.id && byId(state.types, o.id)) { var t = byId(state.types, o.id); Object.keys(o).forEach(function (k) { t[k] = o[k]; }); }
      else { o.id = slug(o.name) + "-" + Date.now().toString(36).slice(-4); o.icon = o.icon || "Dumbbell"; state.types.push(o); }
      commit(); return { undo: u, id: o.id };
    },
    patchType: function (id, patch) { var t = byId(state.types, id); if (!t) return null; var u = snapshot(); Object.keys(patch).forEach(function (k) { t[k] = patch[k]; }); commit(); return u; },
    deleteType: function (id) { var t = byId(state.types, id); if (!t) return null; var u = snapshot(); t.deleted = true; commit(); return u; },
    /* disponibilità */
    setAvailability: function (map) { var u = snapshot(); state.availability = JSON.parse(JSON.stringify(map)); commit(); return u; },
    exceptionsOn: function (iso) { return (state.exceptions || []).filter(function (x) { return iso >= x.from && iso <= x.to; }); },
    addException: function (o) { var u = snapshot(); o.id = "x" + Date.now(); state.exceptions = (state.exceptions || []).concat([o]).sort(function (a, b) { return a.from < b.from ? -1 : 1; }); commit(); return u; },
    removeException: function (id) { var u = snapshot(); state.exceptions = (state.exceptions || []).filter(function (x) { return x.id !== id; }); commit(); return u; },
    markNotificationRead: function (id) { var n = byId(state.notifications, id); if (n && !n.read) { n.read = true; commit(); } },
    markAllRead: function () { state.notifications.forEach(function (n) { n.read = true; }); commit(); },
    undo: function (token) { if (!token || !undoStack[token]) return false; state = undoStack[token]; delete undoStack[token]; commit(); return true; },

    /* toast globale: la pagina lo mostra, header e dialog lo richiamano */
    getToast: function () { return toast; },
    showToast: function (t) {
      toast = { id: Date.now(), msg: t.msg, tone: t.tone || "ok", undo: t.undo || null };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast = null; emit(); }, t.undo ? 8000 : 3200);
      emit();
    },
    dismissToast: function () { toast = null; clearTimeout(toastTimer); emit(); },
    undoToast: function () { if (toast && toast.undo) API.undo(toast.undo); toast = null; clearTimeout(toastTimer); emit(); },
  };
  if (!window.__ncArrowKeys) {
    window.__ncArrowKeys = true;
    document.addEventListener("keydown", function (e) {
      if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].indexOf(e.key) < 0) return;
      var el = e.target; if (!el || !el.getAttribute) return;
      var role = el.getAttribute("role"); if (role !== "radio" && role !== "tab") return;
      var group = el.closest('[role="radiogroup"],[role="tablist"]'); if (!group) return;
      var items = Array.prototype.filter.call(group.querySelectorAll('[role="radio"],[role="tab"]'), function (x) { return !x.disabled && x.closest('[role="radiogroup"],[role="tablist"]') === group; });
      var i = items.indexOf(el); if (i < 0) return;
      var n = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      e.preventDefault(); items[n].focus(); items[n].click();
    }, true);
  }
  window.NCStore = API;
})();

/* NC Calendar — shared client-side data source.
   One source of truth for Giulia's app across Dashboard / Booking / Detail / Store.
   Persists to localStorage; seeds once. Also mirrors BIA from the coach store if present. */
(function () {
  "use strict";

  var KEY = "ncapp-giulia-v1";
  var COACH_KEY = "ncclient-giulia-bianchi"; // written by the coach side
  var BOOKINGS_KEY = "ncbookings-v1";        // shared coach<->client booking channel
  var CLIENT_ID = "giulia-bianchi";
  var CLIENT_NAME = "Giulia Bianchi";

  var MONTHS = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  var MSHORT = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
  var DOW = ["dom","lun","mar","mer","gio","ven","sab"];
  var TODAY = new Date(2026, 6, 3); // 3 luglio 2026

  var TYPES = {
    PT:   { label: "Sessione PT",     short: "PT",   dur: 60 },
    BIA:  { label: "BIA",             short: "BIA",  dur: 30 },
    TEST: { label: "Test Funzionale", short: "Test", dur: 45 }
  };

  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
  function parseISO(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1]-1, +p[2]); }

  function defaults() {
    return {
      name: "Giulia",
      initial: "G",
      block: { n: 3, total: 6, size: 8, deadline: "30 luglio" },
      pools: { PT: { total: 5 }, BIA: { total: 2 }, TEST: { total: 1 } },
      credits: { PT: 0, BIA: 0, TEST: 0 },
      seq: 100,
      sessions: [
        // upcoming
        { id: "s1", type: "PT",  date: "2026-07-04", time: "10:00", block: 3, status: "upcoming", confirmed: false, feedback: null, coach: "Marco Rossi", location: "Via Roma 42, Milano",
          note: "Ottimo lavoro sugli stacchi la scorsa settimana. Oggi lavoriamo sul controllo eccentrico e sulla mobilità dell'anca. Se hai fastidi alla spalla, avvisami all'inizio." },
        { id: "s2", type: "PT",  date: "2026-07-09", time: "09:00", block: 3, status: "upcoming", confirmed: false, feedback: null, coach: "Marco Rossi", location: "Via Roma 42, Milano", note: "" },
        // past
        { id: "p1", type: "PT",  date: "2026-06-26", time: "09:00", block: 3, status: "done", confirmed: true, feedback: null, coach: "Marco Rossi", location: "Via Roma 42, Milano", note: "" },
        { id: "p2", type: "BIA", date: "2026-06-23", time: "18:30", block: 3, status: "done", confirmed: true, feedback: 5, coach: "Marco Rossi", location: "Via Roma 42, Milano", note: "" },
        { id: "p3", type: "PT",  date: "2026-06-19", time: "09:00", block: 3, status: "done", confirmed: true, feedback: 4, coach: "Marco Rossi", location: "Via Roma 42, Milano", note: "" }
      ],
      bia: [
        { m: "feb", date: "2026-02", weight: 68.4, muscle: 41.2, fat: 26.1 },
        { m: "mar", date: "2026-03", weight: 67.1, muscle: 41.8, fat: 25.0 },
        { m: "apr", date: "2026-04", weight: 66.2, muscle: 42.3, fat: 24.2 },
        { m: "mag", date: "2026-05", weight: 65.0, muscle: 42.9, fat: 23.3 },
        { m: "giu", date: "2026-06", weight: 64.1, muscle: 43.4, fat: 22.6 }
      ]
    };
  }

  var state = null;

  function load() {
    if (state) return state;
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) { try { state = JSON.parse(raw); } catch (e) { state = null; } }
    if (!state) state = defaults();
    // mirror BIA from coach store when available (keeps client & coach in sync)
    try {
      var craw = localStorage.getItem(COACH_KEY);
      if (craw) {
        var c = JSON.parse(craw);
        if (c && Array.isArray(c.bia) && c.bia.length) state.bia = c.bia.slice();
      }
    } catch (e) {}
    if (!window.__ncSynced) { window.__ncSynced = true; try { syncBookings(); } catch (e) {} }
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ---- derived ----
  function curBlock() { return state.block.n; }
  function inCurBlock(s) { return (s.block || state.block.n) === state.block.n; }
  function poolFor(type) {
    var p = state.pools[type] || { total: 0 };
    var used = state.sessions.filter(function (s) {
      return s.type === type && inCurBlock(s) && (s.status === "done" || s.status === "upcoming");
    }).length;
    var extra = (state.credits && state.credits[type]) || 0;
    return { used: used, total: p.total + extra, base: p.total, credits: extra, left: Math.max(0, p.total + extra - used) };
  }

  function upcoming() {
    return state.sessions
      .filter(function (s) { return s.status === "upcoming"; })
      .sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
  }
  function past() {
    return state.sessions
      .filter(function (s) { return s.status === "done" || s.status === "cancelled"; })
      .sort(function (a, b) { return (a.date + a.time) > (b.date + b.time) ? -1 : 1; });
  }
  function next() { return upcoming()[0] || null; }
  function byId(id) { return state.sessions.filter(function (s) { return s.id === id; })[0] || null; }

  function blockStats() {
    var b = state.block;
    var done = state.sessions.filter(function (s) { return s.status === "done" && inCurBlock(s); }).length;
    var booked = state.sessions.filter(function (s) { return s.status === "upcoming" && inCurBlock(s); }).length;
    var open = Math.max(0, b.size - done - booked);
    var complete = (done + booked) >= b.size && open === 0 && done >= b.size; // all sessions of the block done
    var lastBlock = b.n >= b.total;
    return { n: b.n, total: b.total, size: b.size, done: done, booked: booked, open: open, deadline: b.deadline, complete: complete, lastBlock: lastBlock, empty: (done === 0 && booked === 0) };
  }

  // ---- mutations ----
  function book(opts) {
    load();
    var id = "s" + (++state.seq);
    state.sessions.push({
      id: id, type: opts.type, date: opts.date, time: opts.time, block: state.block.n,
      status: "upcoming", confirmed: false, feedback: null, coach: "Marco Rossi", location: "Via Roma 42, Milano", note: ""
    });
    save(); syncBookings();
    return id;
  }
  function reschedule(id, date, time) {
    load(); var s = byId(id); if (!s) return false;
    s.date = date; s.time = time; s.status = "upcoming"; s.confirmed = false; save(); syncBookings(); return true;
  }
  function cancel(id) {
    load(); var s = byId(id); if (!s) return false;
    s.status = "cancelled"; save(); syncBookings(); return true;
  }
  function restore(id) {
    load(); var s = byId(id); if (!s) return false;
    s.status = "upcoming"; save(); syncBookings(); return true;
  }
  function confirmAttendance(id) {
    load(); var s = byId(id); if (!s) return false;
    s.confirmed = true; save(); syncBookings(); return true;
  }
  function setFeedback(id, rating) {
    load(); var s = byId(id); if (!s) return false;
    s.feedback = rating; save(); return true;
  }
  // sessions in the past that are done, attended, but not yet rated
  function pendingFeedback() {
    return past().filter(function (s) { return s.status === "done" && (s.feedback === null || s.feedback === undefined); })[0] || null;
  }
  // next upcoming session within `hours` that still needs confirmation
  function reminderDue(hours) {
    var n = next(); if (!n || n.confirmed) return null;
    var d = parseISO(n.date), tp = n.time.split(":");
    var when = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +tp[0], +tp[1], 0);
    var diffH = (when - TODAY) / 3600000;
    return (diffH >= 0 && diffH <= (hours || 48)) ? n : null;
  }
  // publish this client's bookings to the shared coach<->client channel
  function syncBookings() {
    var all = [];
    try { all = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]"); } catch (e) { all = []; }
    all = all.filter(function (b) { return b.clientId !== CLIENT_ID; }); // drop this client's old rows
    state.sessions.forEach(function (s) {
      if (s.status === "upcoming") {
        all.push({
          id: CLIENT_ID + ":" + s.id, clientId: CLIENT_ID, clientName: CLIENT_NAME,
          type: s.type, date: s.date, time: s.time, confirmed: !!s.confirmed, source: "client"
        });
      }
    });
    try { localStorage.setItem(BOOKINGS_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function addCredits(type, n) {
    load();
    if (!state.credits) state.credits = { PT: 0, BIA: 0, TEST: 0 };
    state.credits[type] = (state.credits[type] || 0) + n; save();
  }
  function resetAll() { try { localStorage.removeItem(KEY); localStorage.removeItem(BOOKINGS_KEY); localStorage.removeItem(NOTIF_READ_KEY); } catch (e) {} state = null; load(); syncBookings(); }

  // advance to the next block (renewal). Old sessions stay as history (their block tag).
  function renewBlock() {
    load();
    if (state.block.n < state.block.total) {
      state.block.n += 1;
      state.credits = { PT: 0, BIA: 0, TEST: 0 };
      save(); syncBookings();
      return true;
    }
    return false;
  }

  // demo scenarios for review
  function scenario(name) {
    load();
    if (name === "empty") {
      state.block.n = 1;
      state.sessions = [];
      state.credits = { PT: 0, BIA: 0, TEST: 0 };
    } else if (name === "endblock") {
      // current block fully completed, nothing upcoming
      var n = state.block.n, size = state.block.size;
      var types = ["PT","BIA","PT","TEST","PT","BIA","PT","PT"];
      var sess = [];
      for (var i = 0; i < size; i++) {
        var day = 3 + i; var dd = new Date(2026, 5, day); // giugno
        sess.push({ id: "eb" + i, type: types[i % types.length], date: iso(dd), time: "09:00", block: n,
          status: "done", confirmed: true, feedback: (i % 3 === 0 ? null : 4 + (i % 2)), coach: "Marco Rossi", location: "Via Roma 42, Milano", note: "" });
      }
      state.sessions = sess;
    } else { // normal
      state = defaults();
    }
    save(); syncBookings();
  }

  // ---- notifications (client) ----
  var NOTIF_READ_KEY = "ncnotif-read-giulia";
  function readSet() { try { return JSON.parse(localStorage.getItem(NOTIF_READ_KEY) || "[]"); } catch (e) { return []; } }
  function notifications() {
    load();
    var list = [];
    var n = next();
    if (n && !n.confirmed) {
      list.push({ id: "confirm-" + n.id, kind: "confirm", icon: "bell", color: "#039BE5",
        title: "Conferma la tua presenza", sub: TYPES[n.type].label + " · " + relativeDay(n.date).toLowerCase() + " alle " + n.time });
    }
    var bs = blockStats();
    if (bs.open > 0) list.push({ id: "block-" + bs.n, kind: "block", icon: "cal", color: "#ea580c",
      title: "Sessioni da prenotare", sub: "Hai " + bs.open + " sessioni da prenotare entro il " + bs.deadline });
    var lastB = (state.bia || [])[ (state.bia || []).length - 1 ];
    if (lastB) list.push({ id: "bia-" + lastB.date, kind: "bia", icon: "chart", color: "#0b8043",
      title: "Nuova misurazione BIA", sub: "Peso " + lastB.weight + " kg · massa " + lastB.muscle + " kg (" + lastB.m + ")" });
    ["PT","BIA","TEST"].forEach(function (k) {
      var p = poolFor(k); if (p.left <= 0 && p.total > 0) list.push({ id: "credit-" + k, kind: "credit", icon: "spark", color: "#8E24AA",
        title: "Pool " + (k==="PT"?"Sessioni PT":k==="BIA"?"BIA":"Test") + " esaurito", sub: "Acquista un Booster per prenotare ancora" });
    });
    var pf = pendingFeedback();
    if (pf) list.push({ id: "fb-" + pf.id, kind: "feedback", icon: "chat", color: "#4361ee",
      title: "Com'è andata?", sub: "Lascia un feedback sulla sessione del " + fmtShort(pf.date) });
    var read = readSet();
    list.forEach(function (x) { x.unread = read.indexOf(x.id) < 0; });
    return list;
  }
  function unreadCount() { return notifications().filter(function (x) { return x.unread; }).length; }
  function markAllRead() {
    var ids = notifications().map(function (x) { return x.id; });
    try { localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(ids)); } catch (e) {}
  }

  // ---- formatting ----
  function fmtLong(dateISO) {
    var d = parseISO(dateISO);
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  function fmtShort(dateISO) {
    var d = parseISO(dateISO);
    return DOW[d.getDay()] + " " + d.getDate() + " " + MSHORT[d.getMonth()];
  }
  function relativeDay(dateISO) {
    var d = parseISO(dateISO);
    var diff = Math.round((d - TODAY) / 86400000);
    if (diff === 0) return "Oggi";
    if (diff === 1) return "Domani";
    if (diff > 1 && diff < 7) return DOW[d.getDay()].charAt(0).toUpperCase() + DOW[d.getDay()].slice(1) + " " + d.getDate();
    return d.getDate() + " " + MSHORT[d.getMonth()];
  }
  function endTime(time, dur) {
    var p = time.split(":"); var m = (+p[0]) * 60 + (+p[1]) + (dur || 60);
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }

  // ---- navigation (shared bottom nav) ----
  var PAGES = {
    home: "Client Dashboard.dc.html",
    calendar: "Client Booking.dc.html",
    store: "Client Store.dc.html",
    profile: "Client Profile.dc.html"
  };
  function go(page, hash) {
    var url = PAGES[page] || page;
    location.href = encodeURI(url) + (hash ? ("#" + hash) : "");
  }
  // wire a 4-item bottom nav: [home, calendar, store, profile]
  var NAV_LABELS = { home: "Home", calendar: "Prenota", store: "Store", profile: "Profilo" };
  function wireNav(navEl, active) {
    if (!navEl) return;
    var order = ["home", "calendar", "store", "profile"];
    var items = [].slice.call(navEl.children);
    items.forEach(function (a, i) {
      var page = order[i];
      a.style.cursor = "pointer";
      a.setAttribute("role", "button");
      a.setAttribute("aria-label", NAV_LABELS[page] || page);
      var on = page === active;
      if (on) a.setAttribute("aria-current", "page");
      a.style.background = on ? "#005685" : "none";
      a.style.color = on ? "#91cbff" : "#41474f";
      a.onclick = function (e) { e.preventDefault(); if (!on) go(page); };
    });
  }

  // inject shared a11y + page-transition styles once
  (function () {
    try {
      if (document.getElementById("nc-a11y")) return;
      var s = document.createElement("style"); s.id = "nc-a11y";
      s.textContent = ":focus-visible{outline:2px solid #005685;outline-offset:2px;}\n@media (prefers-reduced-motion: no-preference){@keyframes ncPageIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}body{animation:ncPageIn .28s ease both;}}";
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  })();

  window.NCClient = {
    TYPES: TYPES, MONTHS: MONTHS, MSHORT: MSHORT, TODAY: TODAY,
    load: load, save: save, iso: iso, parseISO: parseISO,
    poolFor: poolFor, upcoming: upcoming, past: past, next: next, byId: byId, blockStats: blockStats,
    book: book, reschedule: reschedule, cancel: cancel, restore: restore, addCredits: addCredits, resetAll: resetAll,
    confirmAttendance: confirmAttendance, setFeedback: setFeedback, pendingFeedback: pendingFeedback, reminderDue: reminderDue, syncBookings: syncBookings,
    renewBlock: renewBlock, scenario: scenario,
    notifications: notifications, unreadCount: unreadCount, markAllRead: markAllRead,
    BOOKINGS_KEY: BOOKINGS_KEY, CLIENT_ID: CLIENT_ID, CLIENT_NAME: CLIENT_NAME,
    fmtLong: fmtLong, fmtShort: fmtShort, relativeDay: relativeDay, endTime: endTime,
    go: go, wireNav: wireNav, PAGES: PAGES,
    get state() { return load(); }
  };
})();

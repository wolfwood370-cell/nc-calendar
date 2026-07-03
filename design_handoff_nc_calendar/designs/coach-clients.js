/* NC Calendar — shared COACH-side client roster.
   Single source of truth for the Clients grid and the Client Detail profile.
   For Giulia (who has the client app) the "next session" is overlaid live
   from the shared bookings channel written by client-store.js. */
(function () {
  "use strict";

  function slug(n) { return String(n).toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""); }

  var clients = [
    { name:"Giulia Bianchi", email:"giulia.b@email.it",   phone:"+39 340 118 22 09", plan:"Percorso Fisso",      status:"Attivo",     block:[3,6], credits:{PT:[3,5],BIA:[1,2],Test:[1,1]}, expiry:"15 set 2026", expDays:74,  goal:"Ricomposizione corporea", limit:"Fastidio spalla dx (in gestione)", next:"gio 3 lug \u00b7 10:00", last:"ieri",        lastDays:1,  att:96 },
    { name:"Luca Verdi",     email:"luca.verdi@email.it", phone:"+39 347 220 71 33", plan:"Abbonamento Mensile", status:"Attivo",     block:[2,4], credits:{PT:[4,8],BIA:[0,1],Test:[0,0]}, expiry:"31 lug 2026", expDays:29,  goal:"Ipertrofia e forza",      limit:"\u2014",                            next:"gio 2 lug \u00b7 10:30", last:"oggi",        lastDays:0,  att:88 },
    { name:"Sara Neri",      email:"sara.neri@email.it",  phone:"+39 333 902 44 12", plan:"Percorso Fisso",      status:"In Scadenza",block:[6,6], credits:{PT:[4,5],BIA:[2,2],Test:[1,1]}, expiry:"6 lug 2026",  expDays:3,   goal:"Dimagrimento",            limit:"Lombalgia occasionale",             next:"gio 2 lug \u00b7 15:00", last:"3 giorni fa", lastDays:3,  att:74 },
    { name:"Andrea Gallo",   email:"a.gallo@email.it",    phone:"+39 348 771 09 55", plan:"PT Pack 12",          status:"Attivo",     block:[1,3], credits:{PT:[5,12],BIA:[0,1],Test:[1,1]},expiry:"20 ott 2026", expDays:110, goal:"Preparazione atletica",   limit:"\u2014",                            next:"gio 2 lug \u00b7 18:00", last:"ieri",        lastDays:1,  att:91 },
    { name:"Marta Conti",    email:"marta.c@email.it",    phone:"+39 340 556 88 21", plan:"Abbonamento Mensile", status:"In Scadenza",block:[4,4], credits:{PT:[7,8],BIA:[1,1],Test:[0,0]}, expiry:"6 lug 2026",  expDays:4,   goal:"Tonificazione",           limit:"\u2014",                            next:null,               last:"1 sett. fa",  lastDays:7,  att:80 },
    { name:"Davide Ferrari", email:"d.ferrari@email.it",  phone:"+39 351 224 66 90", plan:"Percorso Fisso",      status:"Completato", block:[6,6], credits:{PT:[8,8],BIA:[2,2],Test:[1,1]}, expiry:"\u2014",       expDays:999, goal:"Recupero post-infortunio",limit:"Pregressa ricostruzione LCA",       next:null,               last:"1 mese fa",   lastDays:30, att:100 },
    { name:"Elena Ricci",    email:"elena.ricci@email.it",phone:"+39 349 118 33 74", plan:"Cliente Libero",      status:"Attivo",     block:[0,0], credits:{PT:[2,4],BIA:[0,1],Test:[0,1]}, expiry:"a consumo",   expDays:500, goal:"Mantenimento",            limit:"\u2014",                            next:"sab 4 lug \u00b7 09:00", last:"4 giorni fa", lastDays:4,  att:85 },
    { name:"Paolo Moretti",  email:"p.moretti@email.it",  phone:"+39 346 700 12 48", plan:"Percorso Fisso",      status:"Attivo",     block:[2,6], credits:{PT:[2,5],BIA:[1,2],Test:[1,1]}, expiry:"28 nov 2026", expDays:148, goal:"Forza massimale",         limit:"\u2014",                            next:"ven 3 lug \u00b7 11:00", last:"2 giorni fa", lastDays:2,  att:93 }
  ];

  clients.forEach(function (c) { c.slug = slug(c.name); c.initials = c.name.split(" ").map(function (w) { return w[0]; }).join(""); });

  // Overlay Giulia's live next session from the shared client<->coach channel
  function withLive() {
    var DOW = ["dom","lun","mar","mer","gio","ven","sab"], MSHORT = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
    var book = [];
    try { book = JSON.parse(localStorage.getItem("ncbookings-v1") || "[]"); } catch (e) { book = []; }
    var mine = book.filter(function (b) { return b.clientId === "giulia-bianchi"; })
                   .sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
    var g = clients[0];
    if (mine.length) {
      var n = mine[0], p = String(n.date).split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
      g.next = DOW[d.getDay()] + " " + d.getDate() + " " + MSHORT[d.getMonth()] + " \u00b7 " + n.time;
      g.nextConfirmed = !!n.confirmed;
      g.upcomingCount = mine.length;
    }
    return clients;
  }

  var bySlug = {}; clients.forEach(function (c, i) { bySlug[c.slug] = i; });

  // ---- archive persistence (shared across grid/table/reload) ----
  var ARCH_KEY = "nccoach-archived";
  function getArchived() { try { return JSON.parse(localStorage.getItem(ARCH_KEY) || "[]"); } catch (e) { return []; } }
  function isArchived(slug) { return getArchived().indexOf(slug) >= 0; }
  function setArchived(slug, on) {
    var a = getArchived(); var i = a.indexOf(slug);
    if (on && i < 0) a.push(slug);
    else if (!on && i >= 0) a.splice(i, 1);
    try { localStorage.setItem(ARCH_KEY, JSON.stringify(a)); } catch (e) {}
  }

  window.COACHData = { clients: clients, bySlug: bySlug, slug: slug, withLive: withLive, getArchived: getArchived, isArchived: isArchived, setArchived: setArchived };

  (function () {
    try {
      if (document.getElementById("nc-a11y")) return;
      var s = document.createElement("style"); s.id = "nc-a11y";
      s.textContent = ":focus-visible{outline:2px solid #005685;outline-offset:2px;}\n@media (prefers-reduced-motion: no-preference){@keyframes ncPageIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}body{animation:ncPageIn .28s ease both;}}";
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  })();
})();

// Custom push handler appended via workbox importScripts.
// Passata 08 del lato cliente: il tocco su una notifica porta alla sua pagina
// anche con l'app già aperta. Prima metteva solo il fuoco sulla prima
// finestra, che restava dov'era, e un indirizzo di un'altra origine si apriva
// così com'era; ora l'indirizzo si risolve sull'origine del service worker, e
// senza indirizzo, o di un'altra origine, si va alla Home. Prima il fuoco, poi
// la pagina: il browser lascia dare il fuoco solo per poco dopo il tocco, e
// navigate() finisce quando la pagina nuova è caricata, che su una rete lenta
// può essere tardi. La prova sta in src/lib/push-sw.test.ts.
self.addEventListener("push", (event) => {
  let data = { title: "NC Calendar", body: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.png",
      badge: "/favicon.png",
      data: data.url ? { url: data.url } : undefined,
    }),
  );
});

// L'indirizzo da aprire: quello della notifica, risolto sull'origine del
// service worker; senza, o di un'altra origine, la Home.
function notificationTarget(data) {
  const home = new URL("/", self.location.origin).href;
  const raw = data && typeof data.url === "string" ? data.url : "";
  if (!raw) return home;
  try {
    const target = new URL(raw, self.location.origin);
    return target.origin === self.location.origin ? target.href : home;
  } catch {
    return home;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = notificationTarget(event.notification.data);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      for (const c of list) {
        if (!("focus" in c)) continue;
        if (c.url === url) {
          // Già sulla pagina: il fuoco, e un messaggio con l'indirizzo. La
          // pagina non cambia indirizzo, e senza il messaggio l'agenda del
          // telefono restava sul giorno toccato a mano invece di tornare a
          // quello della notifica (passata 11 del lato cliente:
          // src/lib/notification-open.ts).
          try {
            await c.focus();
          } catch {
            // Il fuoco non è più concesso: la pagina è comunque quella giusta.
          }
          if ("postMessage" in c) {
            try {
              c.postMessage({ type: "nc-notification-open", url });
            } catch {
              // Niente: la pagina resta quella giusta.
            }
          }
          return;
        }
        if (!("navigate" in c)) continue;
        try {
          await c.focus();
        } catch {
          // Il fuoco non è più concesso: la finestra si sposta lo stesso.
        }
        try {
          const moved = await c.navigate(url);
          if (moved) return;
        } catch {
          // Una finestra che questo service worker non controlla non si
          // sposta: si prova la prossima.
        }
      }
      await self.clients.openWindow(url);
    }),
  );
});

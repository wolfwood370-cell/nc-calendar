// ----------------------------------------------------------------------------
// Finestre temporali assolute per le query di dashboard coach.
// Tutte le funzioni sono no-arg e ritornano un Date riferito a "now",
// allineato sui boundary canonici (00:00:00 inizio, 23:59:59.999 fine).
//
// NB: distinte volutamente dalle omonime di date-fns (che prendono un
// argomento Date). Questi helper sono specifici della dashboard coach
// dove serve solo "ora" come riferimento implicito.
// ----------------------------------------------------------------------------

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function sevenDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function thirtyDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

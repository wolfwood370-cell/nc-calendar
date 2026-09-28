// Audit V5, passata 10 (C9): la presenza di un cliente è la stessa in
// Clienti e nel Profilo anche quando nell'archivio c'è una sessione di un
// altro coach. La lista Clienti la filtra nella query (attendanceCoachId in
// trainer.clients.index.tsx), il Profilo carica tutto e filtra nella
// presenza (profilePresence). Oggi il coach è uno solo, quindi nei dati veri
// nessun numero cambia: il verde qui è l'unica prova del punto.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attendanceCoachId, profilePresence, type AttendanceViewer } from "@/lib/attendance";
import { buildClientRows, type ListClient } from "@/lib/client-list";

const NOW = new Date("2026-09-25T10:40:00+02:00");

const CLIENT: ListClient = {
  id: "c1",
  full_name: "Cliente di prova",
  email: null,
  phone: null,
  pack_label: null,
  status: "active",
  path_type: "free",
  auto_renew_blocks: false,
};

const session = (coach_id: string, status: string, day: number) => ({
  client_id: "c1",
  coach_id,
  event_type_id: null,
  session_type: "PT Session",
  status,
  scheduled_at: `2026-09-${String(day).padStart(2, "0")}T09:00:00+02:00`,
});

// Tre svolte col coach A, un'assenza con il coach B: 100% per A, 75% su tutte.
const ARCHIVE = [
  session("coach-a", "completed", 2),
  session("coach-a", "completed", 9),
  session("coach-a", "completed", 16),
  session("coach-b", "no_show", 23),
];

/** La lista Clienti: la query filtra come trainer.clients.index.tsx, poi buildClientRows. */
function clientsAttendance(viewer: AttendanceViewer): number | null {
  const coach = attendanceCoachId(viewer);
  const rows = coach === null ? ARCHIVE : ARCHIVE.filter((b) => b.coach_id === coach);
  const [row] = buildClientRows(
    { clients: [CLIENT], blocks: [], allocations: [], bookings: rows, extras: [] },
    NOW,
  );
  return row?.attendance ?? null;
}

/** Il Profilo: tutte le sessioni del cliente (profile-load.ts), poi profilePresence. */
function profileAttendance(viewer: AttendanceViewer): number | null {
  return profilePresence(ARCHIVE, viewer, NOW).percent;
}

describe("V5 · stessa presenza in Clienti e nel Profilo", () => {
  it("il coach conta solo le sue sessioni, in tutte e due", () => {
    const coach = { id: "coach-a", isAdmin: false };
    expect(clientsAttendance(coach)).toBe(100);
    expect(profileAttendance(coach)).toBe(clientsAttendance(coach));
  });

  it("l'admin le conta tutte, in tutte e due", () => {
    const admin = { id: "admin", isAdmin: true };
    expect(clientsAttendance(admin)).toBe(75);
    expect(profileAttendance(admin)).toBe(clientsAttendance(admin));
  });

  it("le assenze del Profilo sono quelle dello stesso sottoinsieme", () => {
    expect(profilePresence(ARCHIVE, { id: "coach-a", isAdmin: false }, NOW).absences).toBe(0);
    expect(profilePresence(ARCHIVE, { id: "admin", isAdmin: true }, NOW).absences).toBe(1);
  });
});

describe("V5 · le due pagine usano la regola condivisa", () => {
  it("la query dei Clienti filtra con attendanceCoachId", () => {
    const src = readFileSync("src/routes/trainer.clients.index.tsx", "utf8");
    expect(src).toMatch(
      /const coach = user \? attendanceCoachId\(\{ id: user\.id, isAdmin \}\) : null;/,
    );
    expect(src).toMatch(/if \(coach\) bookQ = bookQ\.eq\("coach_id", coach\);/);
  });
  it("il Profilo conta la presenza con profilePresence", () => {
    const src = readFileSync("src/components/client-profile-desktop.tsx", "utf8");
    expect(src).toMatch(/const presence = profilePresence\(/);
    expect(src).not.toMatch(/presenceSummary\(/);
  });
});

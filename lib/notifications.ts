import type { Member } from "@/lib/member-store";
import type { ServiceEntry } from "@/lib/service-store";

export type HoldEndingAlert = {
  memberId: string;
  memberName: string;
  lastHoldDate: string;
  daysUntilEnd: number; // negative means the last recorded Hold day has already passed
};

const HOLD_ENDING_WINDOW_DAYS = 3;

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Members whose most recently recorded service entry is a Hold day landing
 * within a few days of today. There's no explicit "hold end date" field --
 * this infers "ending soon" from the fact that nothing has been recorded
 * past that Hold day, so a gap (Missing days) is about to open up on the
 * calendar unless staff extend the hold or resume attendance.
 */
export function findHoldsEndingSoon(
  members: Member[],
  serviceEntries: ServiceEntry[],
  today: string,
  windowDays: number = HOLD_ENDING_WINDOW_DAYS
): HoldEndingAlert[] {
  const activeMemberById = new Map(
    members.filter((member) => !member.archivedAt).map((member) => [member.id, member])
  );

  const latestEntryByMember = new Map<string, ServiceEntry>();
  for (const entry of serviceEntries) {
    if (!activeMemberById.has(entry.memberId)) {
      continue;
    }
    const current = latestEntryByMember.get(entry.memberId);
    if (!current || entry.serviceDate > current.serviceDate) {
      latestEntryByMember.set(entry.memberId, entry);
    }
  }

  const alerts: HoldEndingAlert[] = [];
  for (const [memberId, entry] of latestEntryByMember) {
    if (entry.serviceLabel.toLowerCase() !== "hold") {
      continue;
    }
    const daysUntilEnd = daysBetween(today, entry.serviceDate);
    if (daysUntilEnd < -windowDays || daysUntilEnd > windowDays) {
      continue;
    }
    const member = activeMemberById.get(memberId);
    alerts.push({
      memberId,
      memberName: member?.displayName ?? "Unknown member",
      lastHoldDate: entry.serviceDate,
      daysUntilEnd,
    });
  }

  return alerts.sort((left, right) => left.daysUntilEnd - right.daysUntilEnd);
}

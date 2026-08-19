import type { Member } from "@/lib/member-store";
import type { ServiceEntry } from "@/lib/service-store";

export type NotificationSeverity = "critical" | "warning" | "info";

export type NotificationResolution = {
  kind: "extend-status";
  memberId: string;
  statusLabel: string;
  lastStatusDate: string;
};

/**
 * Generic shape the notification bell renders, grouped by `category`.
 * Detection logic for each alert source (findStatusEndingSoon today, more
 * later -- e.g. messages, notes, update warnings) stays in its own
 * domain-specific type/function -- these adapter functions are what map a
 * source's own alerts into this common shape, so new sources plug into the
 * bell without it needing to know their details. `resolution` is optional
 * and only set by sources that offer an inline fix (currently just
 * status-ending alerts, which can be extended by N weeks); sources without
 * one just render as plain informational rows.
 */
export type NotificationItem = {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: NotificationSeverity;
  memberId?: string;
  resolution?: NotificationResolution;
};

const statusDisplayLabels: Record<string, string> = {
  hold: "Hold",
  medical: "Medical",
  vacation: "Vacation",
};

const trackedEndingStatuses = new Set(Object.keys(statusDisplayLabels));

export type StatusEndingAlert = {
  memberId: string;
  memberName: string;
  statusLabel: string;
  lastStatusDate: string;
  daysUntilEnd: number; // negative means the last recorded day has already passed
};

const STATUS_ENDING_LOOKAHEAD_DAYS = 3;
const STATUS_ENDED_LOOKBACK_DAYS = 7;

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Members whose most recently recorded service entry is a Hold/Medical/
 * Vacation day landing near today -- up to a few days out if it hasn't
 * happened yet, or up to a week back if it already has. There's no explicit
 * "end date" field for these statuses -- this infers "ending soon"/"ended"
 * from the fact that nothing has been recorded past that day, so a gap
 * (Missing days) is about to open up on the calendar (or already has) unless
 * staff extend the status or resume attendance.
 */
export function findStatusEndingSoon(
  members: Member[],
  serviceEntries: ServiceEntry[],
  today: string,
  lookaheadDays: number = STATUS_ENDING_LOOKAHEAD_DAYS,
  lookbackDays: number = STATUS_ENDED_LOOKBACK_DAYS
): StatusEndingAlert[] {
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

  const alerts: StatusEndingAlert[] = [];
  for (const [memberId, entry] of latestEntryByMember) {
    const statusLabel = entry.serviceLabel.toLowerCase();
    if (!trackedEndingStatuses.has(statusLabel)) {
      continue;
    }
    const daysUntilEnd = daysBetween(today, entry.serviceDate);
    if (daysUntilEnd < -lookbackDays || daysUntilEnd > lookaheadDays) {
      continue;
    }
    const member = activeMemberById.get(memberId);
    alerts.push({
      memberId,
      memberName: member?.displayName ?? "Unknown member",
      statusLabel,
      lastStatusDate: entry.serviceDate,
      daysUntilEnd,
    });
  }

  return alerts.sort((left, right) => left.daysUntilEnd - right.daysUntilEnd);
}

function formatShortDate(dateString: string): string {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function statusEndingDescription(alert: StatusEndingAlert): string {
  const label = statusDisplayLabels[alert.statusLabel] ?? alert.statusLabel;
  if (alert.daysUntilEnd > 0) {
    return `${label} ends in ${alert.daysUntilEnd}d (${formatShortDate(alert.lastStatusDate)})`;
  }
  if (alert.daysUntilEnd === 0) {
    return `${label} ends today (${formatShortDate(alert.lastStatusDate)})`;
  }
  return `${label} ended ${Math.abs(alert.daysUntilEnd)}d ago (${formatShortDate(alert.lastStatusDate)})`;
}

export function statusEndingAlertsToNotifications(
  alerts: StatusEndingAlert[]
): NotificationItem[] {
  return alerts.map((alert) => {
    const label = statusDisplayLabels[alert.statusLabel] ?? alert.statusLabel;
    return {
      id: `status-ending:${alert.statusLabel}:${alert.memberId}`,
      category: `${label} ending soon`,
      title: alert.memberName,
      description: statusEndingDescription(alert),
      severity: alert.daysUntilEnd <= 0 ? "critical" : "warning",
      memberId: alert.memberId,
      resolution: {
        kind: "extend-status",
        memberId: alert.memberId,
        statusLabel: alert.statusLabel,
        lastStatusDate: alert.lastStatusDate,
      },
    };
  });
}

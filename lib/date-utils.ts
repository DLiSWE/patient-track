import type { Member } from "@/lib/member-store";
import { isMemberActiveOnDate } from "@/lib/member-store";
import type { ServiceEntry } from "@/lib/service-store";

export const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type CalendarDay = {
  date: string;
  dayNumber: number;
};

export type SummaryStats = {
  attendanceByWeekday: number[];
  averagePerServiceDay: number;
  busiestCount: number;
  busiestDate: string | null;
  totalServices: number;
  uniqueMembers: number;
};

export function getMonthInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// <input type="month"> should only ever emit a valid "YYYY-MM" string, but
// some browsers (notably Firefox, when decrementing the month spinner past
// January) can emit an out-of-range value like "2026-00". Anything built
// from that goes straight into Supabase date-range filters, so falling back
// to the current month here keeps a malformed value from ever reaching
// Postgres as an invalid date literal.
export function normalizeMonthString(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);

  if (match) {
    const monthNumber = Number(match[2]);
    if (monthNumber >= 1 && monthNumber <= 12) {
      return month;
    }
  }

  return getMonthInputValue();
}

export function getDefaultDateForMonth(month: string) {
  const normalizedMonth = normalizeMonthString(month);
  const today = new Date().toLocaleDateString("en-CA");
  return today.startsWith(`${normalizedMonth}-`) ? today : `${normalizedMonth}-01`;
}

export function isDateInCurrentMonth(date: string) {
  const parsedDate = new Date(date);
  const now = new Date();

  return (
    parsedDate.getFullYear() === now.getFullYear() &&
    parsedDate.getMonth() === now.getMonth()
  );
}

export function getCalendarDays(month: string): Array<CalendarDay | null> {
  const [year, monthNumber] = normalizeMonthString(month).split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const days: Array<CalendarDay | null> = Array.from(
    { length: firstDay.getDay() },
    () => null
  );

  for (let day = 1; day <= totalDays; day += 1) {
    days.push({
      date: getDateString(year, monthIndex, day),
      dayNumber: day,
    });
  }

  return days;
}

export function getSummaryStats(
  entries: ServiceEntry[],
  totalMembers: number
): SummaryStats {
  const uniqueMembers = new Set(entries.map((entry) => entry.memberId)).size;
  const countsByDate = new Map<string, number>();
  const attendanceByWeekday = [0, 0, 0, 0, 0, 0, 0];

  for (const entry of entries) {
    countsByDate.set(entry.serviceDate, (countsByDate.get(entry.serviceDate) ?? 0) + 1);
    attendanceByWeekday[parseDateString(entry.serviceDate).getDay()] += 1;
  }

  let busiestDate: string | null = null;
  let busiestCount = 0;

  for (const [date, count] of countsByDate) {
    if (count > busiestCount) {
      busiestDate = date;
      busiestCount = count;
    }
  }

  return {
    attendanceByWeekday,
    averagePerServiceDay: countsByDate.size ? entries.length / countsByDate.size : 0,
    busiestCount,
    busiestDate,
    totalServices: entries.length,
    uniqueMembers: Math.min(uniqueMembers, totalMembers),
  };
}

export function getExpectedServiceDatesForMonth(
  month: string,
  serviceDays: string,
  recordedDates: Set<string>
) {
  const weekdayIndexes = parseServiceWeekdays(serviceDays);

  if (weekdayIndexes.size === 0) {
    return [];
  }

  return getCalendarDays(month)
    .flatMap((day) => (day ? [day] : []))
    .filter((day) => {
      const date = parseDateString(day.date);
      return weekdayIndexes.has(date.getDay()) && !recordedDates.has(day.date);
    })
    .map((day) => day.date);
}

export function getMonthDateRange(month: string) {
  const [year, monthNumber] = normalizeMonthString(month).split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();

  return {
    start: getDateString(year, monthIndex, 1),
    end: getDateString(year, monthIndex, totalDays),
  };
}

export function getWeekDateRange(referenceDate: string) {
  const date = parseDateString(referenceDate);
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  return {
    start: formatDateString(startOfWeek),
    end: formatDateString(endOfWeek),
  };
}

export function getExpectedServiceDatesInRange(
  startDate: string,
  endDate: string,
  serviceDays: string,
  recordedDates: Set<string>
) {
  const weekdayIndexes = parseServiceWeekdays(serviceDays);

  if (weekdayIndexes.size === 0 || endDate < startDate) {
    return [];
  }

  const dates: string[] = [];
  let current = parseDateString(startDate);
  const end = parseDateString(endDate);

  while (current <= end) {
    const dateString = formatDateString(current);

    if (weekdayIndexes.has(current.getDay()) && !recordedDates.has(dateString)) {
      dates.push(dateString);
    }

    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
  }

  return dates;
}

export function getExpectedMembersByDate(
  month: string,
  members: Member[],
  afterDate: string
) {
  const expectedMembersByDate = new Map<string, Member[]>();

  for (const day of getCalendarDays(month)) {
    if (!day || day.date <= afterDate) {
      continue;
    }

    const date = parseDateString(day.date);
    const expectedMembers = members.filter(
      (member) =>
        isMemberActiveOnDate(member, day.date) &&
        parseServiceWeekdays(member.serviceDays).has(date.getDay())
    );

    if (expectedMembers.length > 0) {
      expectedMembersByDate.set(day.date, expectedMembers);
    }
  }

  return expectedMembersByDate;
}

// Not open Saturdays or Sundays anymore, regardless of what a member's
// serviceDays text says -- strip both out of every parsed result so nothing
// downstream (expected dates, bulk fill, review flags, attendance grid) ever
// treats a weekend as an expected service day.
const closedWeekdays = new Set([0, 6]);

function parseServiceWeekdays(serviceDays: string) {
  const compact = serviceDays.toLowerCase().replace(/[^a-z]/g, "");
  const normalized = serviceDays.toLowerCase();
  let weekdays = new Set<number>();

  if (
    normalized.includes("daily") ||
    normalized.includes("every day") ||
    compact === "sumtwthfsa"
  ) {
    weekdays = new Set([0, 1, 2, 3, 4, 5, 6]);
  } else {
    const compactWeekdays = parseCompactWeekdays(compact);

    if (compactWeekdays.size > 0) {
      weekdays = compactWeekdays;
    } else {
      const tokens = normalized
        .replace(/\//g, " ")
        .replace(/,/g, " ")
        .split(/\s+/)
        .filter(Boolean);

      for (const token of tokens) {
        if (token.startsWith("sun")) {
          weekdays.add(0);
        } else if (token.startsWith("mon")) {
          weekdays.add(1);
        } else if (token.startsWith("tue")) {
          weekdays.add(2);
        } else if (token.startsWith("wed")) {
          weekdays.add(3);
        } else if (token.startsWith("thu")) {
          weekdays.add(4);
        } else if (token.startsWith("fri")) {
          weekdays.add(5);
        } else if (token.startsWith("sat")) {
          weekdays.add(6);
        }
      }
    }
  }

  for (const closedWeekday of closedWeekdays) {
    weekdays.delete(closedWeekday);
  }

  return weekdays;
}

function parseCompactWeekdays(compact: string) {
  const weekdays = new Set<number>();
  let remaining = compact;

  while (remaining) {
    if (remaining.startsWith("su")) {
      weekdays.add(0);
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("th")) {
      weekdays.add(4);
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("sa")) {
      weekdays.add(6);
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("m")) {
      weekdays.add(1);
      remaining = remaining.slice(1);
    } else if (remaining.startsWith("t")) {
      weekdays.add(2);
      remaining = remaining.slice(1);
    } else if (remaining.startsWith("w")) {
      weekdays.add(3);
      remaining = remaining.slice(1);
    } else if (remaining.startsWith("f")) {
      weekdays.add(5);
      remaining = remaining.slice(1);
    } else if (remaining.startsWith("s")) {
      weekdays.add(6);
      remaining = remaining.slice(1);
    } else {
      return new Set<number>();
    }
  }

  return weekdays;
}

function getDateString(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

function formatDateString(date: Date) {
  return getDateString(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateString(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

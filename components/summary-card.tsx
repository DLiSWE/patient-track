"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  ClockIcon,
  LayoutGridIcon,
  CalendarRangeIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";

import {
  attendanceLegendItems,
  getServiceStatusStyle,
  serviceStatusStyles,
} from "@/components/service-calendar";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { type Member, providerOptions } from "@/lib/member-store";
import type { ServiceEntry } from "@/lib/service-store";
import {
  type CalendarDay,
  getCompactWeekdayLabel,
  getDefaultDateForMonth,
  normalizeMonthString,
  type SummaryStats,
  weekdayLabels,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";

type SummaryWidgetKey = "claimStatus" | "attendanceGrid" | "calendar";

const summaryWidgetStorageKey = "sophia-summary-widgets";

const summaryWidgetOptions: Array<{
  key: SummaryWidgetKey;
  label: string;
  description: string;
}> = [
  {
    key: "claimStatus",
    label: "Claim status",
    description: "Required, pending, accepted, and needs-review counts.",
  },
  {
    key: "attendanceGrid",
    label: "Attendance grid",
    description: "Every active member's daily status this month, at a glance.",
  },
  {
    key: "calendar",
    label: "Monthly calendar",
    description:
      "Day-by-day counts, summary stats, weekday volume, and the selected-date list.",
  },
];

const defaultSummaryWidgetVisibility: Record<SummaryWidgetKey, boolean> = {
  claimStatus: true,
  attendanceGrid: true,
  calendar: true,
};

// Attendance grid provider filter. "all" is the default; the other values are
// the member `provider` codes from providerOptions. The selection lives in the
// `?provider=` query string (alongside `?view=summary`) so it survives a reload.
const allProvidersFilterValue = "all";
const providerFilterQueryParam = "provider";

// Segment colors for the Weekly members stacked bar, keyed by provider code.
const weeklyProviderBarColors: Record<string, { bar: string; dot: string }> = {
  empire: { bar: "bg-sky-500", dot: "bg-sky-500" },
  vcm: { bar: "bg-violet-500", dot: "bg-violet-500" },
  swh: { bar: "bg-emerald-500", dot: "bg-emerald-500" },
  hf: { bar: "bg-amber-500", dot: "bg-amber-500" },
};
const otherProviderBarColor = { bar: "bg-zinc-400", dot: "bg-zinc-400" };
const otherProviderLabel = "Other";

// Claim markers drawn on an attendance-grid square. A Required row exists for
// every attended day as soon as it's saved, so marking it would just repeat
// the attendance color; the marks are for claims that have moved on from that.
// White marks are used instead of the claim palette's teal/cyan dots because
// those hues vanish against the emerald Attended square at 16px.
const attendanceGridClaimMarkers: Array<{ status: string; label: string }> = [
  { status: "created", label: "Claim created" },
  { status: "validated", label: "Claim validated" },
  { status: "failed", label: "Claim failed" },
];

function ClaimMarker({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === "created") {
    return (
      <span
        className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        aria-hidden="true"
      />
    );
  }
  if (normalized === "validated") {
    return (
      <CheckIcon
        className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 text-white"
        strokeWidth={3.5}
        aria-hidden="true"
      />
    );
  }
  if (normalized === "failed") {
    return (
      <span
        className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-rose-500 ring-1 ring-background"
        aria-hidden="true"
      />
    );
  }
  return null;
}

const attendanceGridProviderFilterOptions = [
  { label: "All providers", value: allProvidersFilterValue },
  ...providerOptions,
];

function normalizeProviderFilter(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return providerOptions.some((option) => option.value === normalized)
    ? normalized
    : allProvidersFilterValue;
}

export function SummaryCard({
  attendanceGridClaimStatusByMember,
  attendanceGridMembers,
  attendanceGridStatusByMember,
  attendeePage,
  attendeePageCount,
  attendeeSearchQuery,
  calendarDays,
  claimStats,
  countsByDate,
  entries,
  expectedMembersByDate,
  isShowingExpectedMembers,
  memberById,
  month,
  onAttendeePageChange,
  onAttendeeSearchChange,
  onMonthChange,
  onSelectDate,
  selectedDate,
  stats,
  visibleEntries,
  visibleExpectedMembers,
}: {
  // Member id -> service date -> claim status for the selected month.
  attendanceGridClaimStatusByMember: Map<string, Map<string, string>>;
  attendanceGridMembers: Member[];
  attendanceGridStatusByMember: Map<string, Map<string, string>>;
  attendeePage: number;
  attendeePageCount: number;
  attendeeSearchQuery: string;
  calendarDays: Array<CalendarDay | null>;
  claimStats: {
    accepted: number;
    failed: number;
    pending: number;
    required: number;
    submitted: number;
    total: number;
  };
  countsByDate: Map<string, number>;
  // Every service entry in the selected month (all statuses); the weekly
  // member count below only counts the Attended ones.
  entries: ServiceEntry[];
  expectedMembersByDate: Map<string, Member[]>;
  isShowingExpectedMembers: boolean;
  memberById: Map<string, Member>;
  month: string;
  onAttendeePageChange: (page: number) => void;
  onAttendeeSearchChange: (query: string) => void;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
  selectedDate: string;
  stats: SummaryStats;
  visibleEntries: ServiceEntry[];
  visibleExpectedMembers: Member[];
}) {
  const selectedExpectedCount = expectedMembersByDate.get(selectedDate)?.length ?? 0;
  const [gridQuery, setGridQuery] = useState("");
  const searchParams = useSearchParams();
  const [gridProviderFilter, setGridProviderFilter] = useState(() =>
    normalizeProviderFilter(searchParams.get(providerFilterQueryParam))
  );
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [widgetVisibility, setWidgetVisibility] = useState<Record<SummaryWidgetKey, boolean>>(
    defaultSummaryWidgetVisibility
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(summaryWidgetStorageKey);
      if (raw) {
        // Deliberately in an effect, not a lazy useState initializer:
        // localStorage isn't available during SSR/first hydration pass, so
        // reading it here (post-mount) instead of during render is what
        // avoids a hydration mismatch, not what causes one.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWidgetVisibility((current) => ({ ...current, ...JSON.parse(raw) }));
      }
    } catch {
      // Ignore malformed or inaccessible storage (private browsing, etc.).
    }
  }, []);

  function toggleWidget(key: SummaryWidgetKey) {
    setWidgetVisibility((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        window.localStorage.setItem(summaryWidgetStorageKey, JSON.stringify(next));
      } catch {
        // Ignore storage write failures -- the toggle still works for this session.
      }
      return next;
    });
  }

  function handleGridProviderFilterChange(value: string | null) {
    const next = normalizeProviderFilter(value);
    setGridProviderFilter(next);

    try {
      const url = new URL(window.location.href);
      if (next === allProvidersFilterValue) {
        url.searchParams.delete(providerFilterQueryParam);
      } else {
        url.searchParams.set(providerFilterQueryParam, next);
        // Pin the view too, so a reload lands back on this page with the
        // filter applied instead of on the default Members view.
        url.searchParams.set("view", "summary");
      }
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // URL sync is best-effort; the filter still applies for this session.
    }
  }

  const attendanceGridDays = useMemo(
    () => calendarDays.filter((day): day is CalendarDay => Boolean(day)),
    [calendarDays]
  );

  // One row per calendar week of the month (calendarDays is laid out seven
  // cells per week, leading/trailing blanks included): how many distinct
  // members have an Attended entry in that week, plus the attended-service
  // count for context.
  const weeklyMemberCounts = useMemo(() => {
    const attendedMembersByDate = new Map<string, Set<string>>();

    for (const entry of entries) {
      if (entry.serviceLabel.toLowerCase() !== "attended") {
        continue;
      }
      const members = attendedMembersByDate.get(entry.serviceDate) ?? new Set<string>();
      members.add(entry.memberId);
      attendedMembersByDate.set(entry.serviceDate, members);
    }

    const weeks: Array<{
      key: string;
      label: string;
      members: number;
      services: number;
      // Distinct members per provider for the week, in providerOptions order,
      // with an "Other" bucket for members whose provider is blank or unknown.
      byProvider: Array<{ value: string; label: string; count: number }>;
    }> = [];
    const knownProviders = new Set<string>(providerOptions.map((option) => option.value));

    for (let start = 0; start < calendarDays.length; start += 7) {
      const weekDays = calendarDays
        .slice(start, start + 7)
        .filter((day): day is CalendarDay => Boolean(day));

      if (weekDays.length === 0) {
        continue;
      }

      const members = new Set<string>();
      const membersByProvider = new Map<string, Set<string>>();
      let services = 0;

      for (const day of weekDays) {
        const dayMembers = attendedMembersByDate.get(day.date);
        if (dayMembers) {
          services += dayMembers.size;
          for (const memberId of dayMembers) {
            members.add(memberId);
            const provider = memberById.get(memberId)?.provider ?? "";
            const providerKey = knownProviders.has(provider) ? provider : "other";
            const providerMembers =
              membersByProvider.get(providerKey) ?? new Set<string>();
            providerMembers.add(memberId);
            membersByProvider.set(providerKey, providerMembers);
          }
        }
      }

      const byProvider = [
        ...providerOptions.map((option) => ({
          value: option.value,
          label: option.label,
          count: membersByProvider.get(option.value)?.size ?? 0,
        })),
        {
          value: "other",
          label: otherProviderLabel,
          count: membersByProvider.get("other")?.size ?? 0,
        },
      ];

      const first = weekDays[0];
      const last = weekDays[weekDays.length - 1];
      weeks.push({
        key: first.date,
        label:
          first.date === last.date
            ? String(first.dayNumber)
            : `${first.dayNumber}–${last.dayNumber}`,
        members: members.size,
        services,
        byProvider,
      });
    }

    return weeks;
  }, [calendarDays, entries, memberById]);

  const providerFilteredAttendanceGridMembers = useMemo(() => {
    if (gridProviderFilter === allProvidersFilterValue) {
      return attendanceGridMembers;
    }

    return attendanceGridMembers.filter(
      (member) => member.provider === gridProviderFilter
    );
  }, [attendanceGridMembers, gridProviderFilter]);

  const filteredAttendanceGridMembers = useMemo(() => {
    const normalizedQuery = gridQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return providerFilteredAttendanceGridMembers;
    }

    return providerFilteredAttendanceGridMembers.filter((member) =>
      member.displayName.toLowerCase().includes(normalizedQuery)
    );
  }, [gridQuery, providerFilteredAttendanceGridMembers]);

  return (
    <Card className="dark:bg-card/95 dark:ring-white/10">
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <CardDescription>Daily attendance counts and monthly service stats.</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Input
            className="summary-month-input w-40 bg-background text-foreground dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
            type="date"
            value={getDefaultDateForMonth(month)}
            onChange={(event) =>
              onMonthChange(normalizeMonthString(event.target.value.slice(0, 7)))
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsCustomizeOpen(true)}
          >
            <LayoutGridIcon data-icon="inline-start" />
            Customize
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!widgetVisibility.claimStatus &&
        !widgetVisibility.attendanceGrid &&
        !widgetVisibility.calendar ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
            <h3 className="font-medium">No widgets selected</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Use Customize above to add widgets back to this page.
            </p>
          </div>
        ) : null}

        {widgetVisibility.claimStatus ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ClaimWidget
            icon={ClipboardListIcon}
            label="Required"
            value={claimStats.required}
            detail={`${claimStats.total} total this month`}
            tone="violet"
          />
          <ClaimWidget
            icon={ClockIcon}
            label="Pending"
            value={claimStats.pending}
            detail={`${claimStats.submitted} submitted`}
            tone="slate"
          />
          <ClaimWidget
            icon={CheckCircle2Icon}
            label="Accepted"
            value={claimStats.accepted}
            detail="Cleared claims"
            tone="emerald"
          />
          <ClaimWidget
            icon={AlertTriangleIcon}
            label="Needs review"
            value={claimStats.failed}
            detail="Failed claim attempts"
            tone="rose"
          />
        </div>
        ) : null}

        {widgetVisibility.attendanceGrid ? (
        <div className="mb-5 flex flex-col gap-3 rounded-lg border bg-background/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-medium">Attendance grid</h3>
              <p className="text-xs text-muted-foreground">
                Every active member&apos;s daily status this month, at a glance.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="w-40 bg-background text-foreground dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                type="date"
                value={getDefaultDateForMonth(month)}
                onChange={(event) =>
                  onMonthChange(normalizeMonthString(event.target.value.slice(0, 7)))
                }
              />
              <Input
                className="h-9 sm:w-56"
                placeholder="Search members"
                value={gridQuery}
                onChange={(event) => setGridQuery(event.target.value)}
              />
              <Select
                value={gridProviderFilter}
                onValueChange={handleGridProviderFilterChange}
              >
                <SelectTrigger
                  aria-label="Filter attendance grid by provider"
                  className="h-9 w-40 bg-background text-foreground dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                >
                  {attendanceGridProviderFilterOptions.find(
                    (option) => option.value === gridProviderFilter
                  )?.label ?? "All providers"}
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {attendanceGridProviderFilterOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {filteredAttendanceGridMembers.length} of {attendanceGridMembers.length}{" "}
                member{attendanceGridMembers.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {attendanceLegendItems.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5">
                <span
                  className={cn("size-2.5 rounded-full", serviceStatusStyles[item.key]?.dot)}
                />
                {item.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-muted dark:bg-white/10" />
              Not expected
            </span>
            <span className="hidden h-3 self-center border-l dark:border-white/15 sm:inline-block" />
            {attendanceGridClaimMarkers.map((marker) => (
              <span key={marker.status} className="flex items-center gap-1.5">
                <span className="relative inline-block size-4 rounded-sm bg-emerald-500">
                  <ClaimMarker status={marker.status} />
                </span>
                {marker.label}
              </span>
            ))}
          </div>

          {attendanceGridDays.length === 0 || filteredAttendanceGridMembers.length === 0 ? (
            <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              {attendanceGridMembers.length === 0
                ? "No active members"
                : providerFilteredAttendanceGridMembers.length === 0
                  ? "No active members for this provider"
                  : "No matching members"}
            </div>
          ) : (
            <ScrollArea className="h-[32rem] rounded-lg border dark:border-white/10">
              <table className="w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 min-w-40 border-b bg-background px-2 py-1.5 text-left font-medium dark:border-white/10">
                      Member
                    </th>
                    {attendanceGridDays.map((day) => (
                      <th
                        key={day.date}
                        className="sticky top-0 z-10 min-w-7 border-b bg-background px-0.5 py-1.5 text-center font-medium text-muted-foreground dark:border-white/10"
                      >
                        <span className="block text-[10px] leading-tight">
                          {getCompactWeekdayLabel(day.date)}
                        </span>
                        <span className="block">{day.dayNumber}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendanceGridMembers.map((member) => {
                    const memberStatuses = attendanceGridStatusByMember.get(member.id);
                    const memberClaimStatuses = attendanceGridClaimStatusByMember.get(member.id);

                    return (
                      <tr key={member.id}>
                        <td className="sticky left-0 z-10 truncate border-b bg-background px-2 py-1 font-medium dark:border-white/10">
                          {member.displayName}
                        </td>
                        {attendanceGridDays.map((day) => {
                          const status = memberStatuses?.get(day.date);
                          const claimStatus = memberClaimStatuses?.get(day.date);
                          let title: string | undefined;
                          if (status) {
                            title = `${member.displayName} — ${day.date}: ${status}`;
                            if (claimStatus) {
                              title += ` · Claim: ${claimStatus}`;
                            } else if (status.toLowerCase() === "attended") {
                              title += " · No claim row";
                            }
                          }

                          return (
                            <td
                              key={day.date}
                              className="border-b px-0.5 py-1 dark:border-white/10"
                              title={title}
                            >
                              <span
                                className={cn(
                                  "relative mx-auto block size-4 rounded-sm",
                                  status
                                    ? getServiceStatusStyle(status).dot
                                    : "bg-muted dark:bg-white/10"
                                )}
                              >
                                {claimStatus ? <ClaimMarker status={claimStatus} /> : null}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </div>
        ) : null}

        {widgetVisibility.calendar ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-7 gap-1.5">
              {weekdayLabels.map((weekday) => (
                <div
                  key={weekday}
                  className="flex h-7 items-center justify-center text-xs font-medium text-muted-foreground"
                >
                  {weekday}
                </div>
              ))}
              {calendarDays.map((day, index) => {
                if (!day) {
                  return (
                    <div
                      key={`summary-empty-${index}`}
                      className="min-h-20 rounded-lg bg-muted/20 dark:bg-white/[0.02]"
                    />
                  );
                }

                const count = countsByDate.get(day.date) ?? 0;
                const expectedCount = expectedMembersByDate.get(day.date)?.length ?? 0;
                const isSelected = selectedDate === day.date;

                return (
                  <button
                    key={day.date}
                    type="button"
                    className={cn(
                      "flex min-h-20 flex-col items-start justify-between rounded-lg border bg-background p-2 text-left transition-colors hover:bg-muted dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07]",
                      count > 0 &&
                        "border-primary/30 bg-primary/5 dark:border-sky-400/35 dark:bg-sky-400/10",
                      expectedCount > 0 &&
                        count === 0 &&
                        "border-amber-500/35 bg-amber-100/60 dark:border-amber-300/25 dark:bg-amber-300/10",
                      isSelected &&
                        "border-primary bg-accent ring-2 ring-ring/25 dark:border-sky-300/70 dark:bg-sky-300/15 dark:ring-sky-300/20"
                    )}
                    onClick={() => onSelectDate(day.date)}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {day.dayNumber}
                    </span>
                    <span className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <UsersIcon data-icon="inline-start" />
                        {count}
                      </span>
                      {expectedCount > 0 ? (
                        <span className="rounded-sm border border-amber-500/20 bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:border-amber-300/25 dark:bg-amber-300/15 dark:text-amber-100">
                          Exp {expectedCount}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <SummaryMetric label="Services" value={stats.totalServices} />
              <SummaryMetric label="Members" value={stats.uniqueMembers} />
              <SummaryMetric
                label="Avg/day"
                value={stats.averagePerServiceDay.toFixed(1)}
              />
              <SummaryMetric label="Busiest" value={stats.busiestCount} />
            </div>

            <div className="rounded-lg border bg-background/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mb-3 flex items-center gap-2">
                <CalendarRangeIcon
                  data-icon="inline-start"
                  className="text-muted-foreground dark:text-sky-200"
                />
                <h3 className="text-sm font-medium">Weekly members</h3>
                <span className="ml-auto text-xs text-muted-foreground">
                  attended at least once
                </span>
              </div>
              <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {providerOptions.map((option) => (
                  <span key={option.value} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        weeklyProviderBarColors[option.value]?.dot ?? otherProviderBarColor.dot
                      )}
                    />
                    {option.label}
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                {weeklyMemberCounts.map((week) => {
                  const maxMembers = Math.max(
                    ...weeklyMemberCounts.map((item) => item.members),
                    1
                  );
                  const providersWithMembers = week.byProvider.filter(
                    (provider) => provider.count > 0
                  );

                  return (
                    <div
                      key={week.key}
                      className="flex flex-col gap-1"
                      title={`${week.services} attended service${week.services === 1 ? "" : "s"} this week`}
                    >
                      <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2">
                        <span className="text-xs text-muted-foreground">{week.label}</span>
                        <div className="flex h-2 overflow-hidden rounded-full bg-muted dark:bg-white/10">
                          {providersWithMembers.map((provider) => (
                            <div
                              key={provider.value}
                              className={cn(
                                "h-2",
                                weeklyProviderBarColors[provider.value]?.bar ??
                                  otherProviderBarColor.bar
                              )}
                              style={{ width: `${(provider.count / maxMembers) * 100}%` }}
                              title={`${provider.label}: ${provider.count}`}
                            />
                          ))}
                        </div>
                        <span className="text-right text-xs tabular-nums">
                          <span className="font-medium text-foreground">{week.members}</span>
                          <span className="text-muted-foreground"> members</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-[44px_1fr] gap-2">
                        <span />
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                          {providersWithMembers.length === 0 ? (
                            <span>No attendance</span>
                          ) : (
                            providersWithMembers.map((provider) => (
                              <span key={provider.value}>
                                {provider.label}{" "}
                                <span className="font-medium text-foreground">{provider.count}</span>
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border bg-background/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3Icon
                  data-icon="inline-start"
                  className="text-muted-foreground dark:text-sky-200"
                />
                <h3 className="text-sm font-medium">Weekday volume</h3>
              </div>
              <div className="flex flex-col gap-2">
                {weekdayLabels.map((weekday, index) => {
                  const value = stats.attendanceByWeekday[index] ?? 0;
                  const maxValue = Math.max(...stats.attendanceByWeekday, 1);

                  return (
                    <div
                      key={weekday}
                      className="grid grid-cols-[32px_1fr_32px] items-center gap-2"
                    >
                      <span className="text-xs text-muted-foreground">{weekday}</span>
                      <div className="h-2 rounded-full bg-muted dark:bg-white/10">
                        <div
                          className="h-2 rounded-full bg-primary dark:bg-sky-300"
                          style={{ width: `${(value / maxValue) * 100}%` }}
                        />
                      </div>
                      <span className="text-right text-xs text-muted-foreground">
                        {value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border bg-background/60 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                <div>
                  <h3 className="text-sm font-medium">
                    {new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isShowingExpectedMembers
                      ? `${selectedExpectedCount} expected`
                      : `${countsByDate.get(selectedDate) ?? 0} members`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={attendeePage === 0}
                    onClick={() => onAttendeePageChange(Math.max(0, attendeePage - 1))}
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={attendeePage >= attendeePageCount - 1}
                    onClick={() =>
                      onAttendeePageChange(
                        Math.min(attendeePageCount - 1, attendeePage + 1)
                      )
                    }
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
              </div>
              <div className="border-b px-3 py-2 dark:border-white/10">
                <div className="relative">
                  <SearchIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    className="h-9 pl-9"
                    placeholder="Search members"
                    value={attendeeSearchQuery}
                    onChange={(event) => onAttendeeSearchChange(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex min-h-40 flex-col">
                {isShowingExpectedMembers ? (
                  visibleExpectedMembers.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                      {attendeeSearchQuery.trim()
                        ? "No matching members"
                        : "No expected members"}
                    </div>
                  ) : (
                    visibleExpectedMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0 dark:border-white/10"
                      >
                        <span className="truncate text-sm font-medium">
                          {member.displayName}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {member.serviceDays || "No days"}
                        </span>
                      </div>
                    ))
                  )
                ) : visibleEntries.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    {attendeeSearchQuery.trim()
                      ? "No matching members"
                      : "No services recorded"}
                  </div>
                ) : (
                  visibleEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0 dark:border-white/10"
                    >
                      <span className="truncate text-sm font-medium">
                        {memberById.get(entry.memberId)?.displayName ?? "Unknown member"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {entry.serviceLabel}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t px-3 py-2 text-xs text-muted-foreground dark:border-white/10">
                Page {attendeePage + 1} of {attendeePageCount}
              </div>
            </div>
          </div>
        </div>
        ) : null}
      </CardContent>

      <Dialog open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customize this page</DialogTitle>
            <DialogDescription>
              Choose which widgets show on the Summary tab. Saved on this device only.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {summaryWidgetOptions.map((option) => (
              <label
                key={option.key}
                className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm dark:border-white/10"
              >
                <input
                  checked={widgetVisibility[option.key]}
                  className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                  type="checkbox"
                  onChange={() => toggleWidget(option.key)}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" />}>Done</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ClaimWidget({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: typeof ClipboardListIcon;
  label: string;
  tone: "emerald" | "rose" | "slate" | "violet";
  value: number;
}) {
  const toneClassNames = {
    emerald:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
    rose: "border-rose-500/25 bg-rose-500/10 text-rose-900 dark:text-rose-100",
    slate: "border-slate-500/25 bg-slate-500/10 text-slate-900 dark:text-slate-100",
    violet:
      "border-violet-500/25 bg-violet-500/10 text-violet-900 dark:text-violet-100",
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 dark:bg-white/[0.03]",
        toneClassNames[tone]
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon data-icon="inline-start" />
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

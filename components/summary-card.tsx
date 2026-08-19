"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  ClockIcon,
  LayoutGridIcon,
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
import type { Member } from "@/lib/member-store";
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

export function SummaryCard({
  attendanceGridMembers,
  attendanceGridStatusByMember,
  attendeePage,
  attendeePageCount,
  attendeeSearchQuery,
  calendarDays,
  claimStats,
  countsByDate,
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

  const attendanceGridDays = useMemo(
    () => calendarDays.filter((day): day is CalendarDay => Boolean(day)),
    [calendarDays]
  );

  const filteredAttendanceGridMembers = useMemo(() => {
    const normalizedQuery = gridQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return attendanceGridMembers;
    }

    return attendanceGridMembers.filter((member) =>
      member.displayName.toLowerCase().includes(normalizedQuery)
    );
  }, [attendanceGridMembers, gridQuery]);

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
          </div>

          {attendanceGridDays.length === 0 || filteredAttendanceGridMembers.length === 0 ? (
            <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              {attendanceGridMembers.length === 0
                ? "No active members"
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

                    return (
                      <tr key={member.id}>
                        <td className="sticky left-0 z-10 truncate border-b bg-background px-2 py-1 font-medium dark:border-white/10">
                          {member.displayName}
                        </td>
                        {attendanceGridDays.map((day) => {
                          const status = memberStatuses?.get(day.date);

                          return (
                            <td
                              key={day.date}
                              className="border-b px-0.5 py-1 dark:border-white/10"
                              title={
                                status
                                  ? `${member.displayName} — ${day.date}: ${status}`
                                  : undefined
                              }
                            >
                              <span
                                className={cn(
                                  "mx-auto block size-4 rounded-sm",
                                  status
                                    ? getServiceStatusStyle(status).dot
                                    : "bg-muted dark:bg-white/10"
                                )}
                              />
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

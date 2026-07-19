import {
  AlertTriangleIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  ClockIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Member } from "@/lib/member-store";
import type { ServiceEntry } from "@/lib/service-store";
import {
  type CalendarDay,
  type SummaryStats,
  weekdayLabels,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export function SummaryCard({
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

  return (
    <Card className="dark:bg-card/95 dark:ring-white/10">
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <CardDescription>Daily attendance counts and monthly service stats.</CardDescription>
        <CardAction>
          <Input
            className="summary-month-input w-40 bg-background text-foreground dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
            type="month"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
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
      </CardContent>
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

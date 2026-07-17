import {
  BarChart3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
  calendarDays,
  countsByDate,
  expectedMembersByDate,
  isShowingExpectedMembers,
  memberById,
  month,
  onAttendeePageChange,
  onMonthChange,
  onSelectDate,
  selectedDate,
  stats,
  visibleEntries,
  visibleExpectedMembers,
}: {
  attendeePage: number;
  attendeePageCount: number;
  calendarDays: Array<CalendarDay | null>;
  countsByDate: Map<string, number>;
  expectedMembersByDate: Map<string, Member[]>;
  isShowingExpectedMembers: boolean;
  memberById: Map<string, Member>;
  month: string;
  onAttendeePageChange: (page: number) => void;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
  selectedDate: string;
  stats: SummaryStats;
  visibleEntries: ServiceEntry[];
  visibleExpectedMembers: Member[];
}) {
  const selectedExpectedCount = expectedMembersByDate.get(selectedDate)?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <CardDescription>Daily attendance counts and monthly service stats.</CardDescription>
        <CardAction>
          <Input
            className="w-40"
            type="month"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
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
                  return <div key={`summary-empty-${index}`} className="min-h-20" />;
                }

                const count = countsByDate.get(day.date) ?? 0;
                const expectedCount = expectedMembersByDate.get(day.date)?.length ?? 0;
                const isSelected = selectedDate === day.date;

                return (
                  <button
                    key={day.date}
                    type="button"
                    className={cn(
                      "flex min-h-20 flex-col items-start justify-between rounded-lg border p-2 text-left transition-colors hover:bg-muted",
                      isSelected && "border-primary bg-accent"
                    )}
                    onClick={() => onSelectDate(day.date)}
                  >
                    <span className="text-sm font-medium">{day.dayNumber}</span>
                    <span className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <UsersIcon data-icon="inline-start" />
                        {count}
                      </span>
                      {expectedCount > 0 ? (
                        <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
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

            <div className="rounded-lg border p-3">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3Icon data-icon="inline-start" />
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
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
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

            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2">
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
              <div className="flex min-h-40 flex-col">
                {isShowingExpectedMembers ? (
                  visibleExpectedMembers.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                      No expected members
                    </div>
                  ) : (
                    visibleExpectedMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0"
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
                    No services recorded
                  </div>
                ) : (
                  visibleEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0"
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
              <div className="border-t px-3 py-2 text-xs text-muted-foreground">
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
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

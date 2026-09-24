"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CalendarOffIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchOwnProfile } from "@/lib/admin-store";
import { createAuditEvent } from "@/lib/audit-store";
import {
  addClosedDay,
  type ClosedDay,
  fetchClosedDays,
  formatClosedDayTitle,
  removeClosedDay,
} from "@/lib/closed-days-store";
import {
  formatMonthLabel,
  getCalendarDays,
  getMonthInputValue,
  shiftMonth,
  weekdayLabels,
} from "@/lib/date-utils";
import { getTodayDate } from "@/lib/service-store";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

function formatDayLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Click-to-close calendar for center-wide closed days (holidays). Closing a
// day only records it in closed_days; everything that works out expected
// service days reads that list and skips it. Existing service entries and
// claims on the day are never touched -- the toast says how many there are.
export function ClosedDaysCard({ session }: { session: Session }) {
  const [month, setMonth] = useState(getMonthInputValue());
  const [closedDays, setClosedDays] = useState<ClosedDay[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [reason, setReason] = useState("");
  const [busyDate, setBusyDate] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const supabaseClient = supabase;
    let isCancelled = false;

    async function load() {
      const [closedDaysResult, profileResult] = await Promise.all([
        fetchClosedDays(supabaseClient),
        fetchOwnProfile(supabaseClient, session),
      ]);

      if (isCancelled) {
        return;
      }

      setLoadError(closedDaysResult.error?.message ?? null);
      setClosedDays(closedDaysResult.data);
      setCanManage(
        profileResult.data?.role === "manager" || profileResult.data?.role === "super_admin"
      );
      setIsLoading(false);
    }

    void load();

    return () => {
      isCancelled = true;
    };
  }, [session]);

  const closedDayByDate = useMemo(
    () => new Map(closedDays.map((closedDay) => [closedDay.serviceDate, closedDay])),
    [closedDays]
  );
  const today = getTodayDate();
  const upcomingClosedDays = closedDays.filter((closedDay) => closedDay.serviceDate >= today);
  const isReadOnly = !canManage || Boolean(loadError);

  async function recordAudit(action: string, summary: string, metadata: Record<string, unknown>) {
    if (!supabase) {
      return;
    }

    const { error } = await createAuditEvent(supabase, {
      action,
      entityType: "service",
      summary,
      metadata,
      actorEmail: session.user.email ?? null,
    });

    if (error) {
      console.error("Audit event failed", error.message);
    }
  }

  async function closeDay(date: string) {
    if (!supabase) {
      return;
    }

    setBusyDate(date);
    const result = await addClosedDay(supabase, date, reason);

    if (result.error || !result.data) {
      toast.error(result.error ?? "This day could not be closed.");
      setBusyDate(null);
      return;
    }

    const closedDay = result.data;
    setClosedDays((current) =>
      [...current, closedDay].sort((left, right) =>
        left.serviceDate.localeCompare(right.serviceDate)
      )
    );

    const { count } = await supabase
      .from("service_entries")
      .select("id", { count: "exact", head: true })
      .eq("service_date", date);
    const existingCount = count ?? 0;

    await recordAudit(
      "closed_day_added",
      `Closed ${date}${closedDay.reason ? ` (${closedDay.reason})` : ""} for all members.`,
      { date, reason: closedDay.reason, existingServiceEntries: existingCount }
    );
    toast.success(
      `Closed ${formatDayLabel(date)}.${
        existingCount > 0
          ? ` ${existingCount} service ${existingCount === 1 ? "entry" : "entries"} already recorded that day ${existingCount === 1 ? "was" : "were"} kept. Remove them in Services if they shouldn't be there.`
          : ""
      }`
    );
    setBusyDate(null);
  }

  async function reopenDay(date: string) {
    if (!supabase) {
      return;
    }

    setBusyDate(date);
    const result = await removeClosedDay(supabase, date);

    if (result.error) {
      toast.error(result.error);
      setBusyDate(null);
      return;
    }

    const reopened = closedDayByDate.get(date);
    setClosedDays((current) => current.filter((closedDay) => closedDay.serviceDate !== date));
    await recordAudit("closed_day_removed", `Reopened ${date} for all members.`, {
      date,
      reason: reopened?.reason ?? null,
    });
    toast.success(`Reopened ${formatDayLabel(date)}.`);
    setBusyDate(null);
  }

  return (
    <Card className="border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CalendarOffIcon className="size-5" />
        </div>
        <CardTitle>Closed days</CardTitle>
        <CardDescription>
          Click a weekday to close it for every member (holidays, closures); click it again to
          reopen. Closed days are skipped by bulk fill, Continue holds, and expected / missed
          counts, and can&apos;t be marked in the service calendar. Entries already recorded on a
          closed day are kept.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Closed days couldn&apos;t be loaded: {loadError}. If this is a new install, run{" "}
            <code>supabase-closed-days.sql</code> in the Supabase SQL editor.
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-1 rounded-lg border p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous month"
                  onClick={() => setMonth((current) => shiftMonth(current, -1))}
                >
                  <ChevronLeftIcon />
                </Button>
                <span className="min-w-32 text-center text-sm font-medium">
                  {formatMonthLabel(month)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next month"
                  onClick={() => setMonth((current) => shiftMonth(current, 1))}
                >
                  <ChevronRightIcon />
                </Button>
              </div>
              <Field label="Reason for new closures (optional)" htmlFor="closed-day-reason">
                <Input
                  id="closed-day-reason"
                  className="w-56"
                  placeholder="e.g. Thanksgiving"
                  value={reason}
                  disabled={isReadOnly}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {weekdayLabels.map((weekday) => (
                <div
                  key={weekday}
                  className="flex h-7 items-center justify-center text-xs font-medium text-muted-foreground"
                >
                  {weekday}
                </div>
              ))}
              {getCalendarDays(month).map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }

                const dayOfWeek = new Date(`${day.date}T00:00:00`).getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const closedDay = closedDayByDate.get(day.date);
                const isBusy = busyDate === day.date;
                const title = isWeekend
                  ? "Closed on weekends"
                  : closedDay
                    ? `${formatClosedDayTitle(closedDay)}${isReadOnly ? "" : " — click to reopen"}`
                    : isReadOnly
                      ? "Open"
                      : "Open — click to close for everyone";

                return (
                  <button
                    key={day.date}
                    type="button"
                    title={title}
                    aria-pressed={Boolean(closedDay)}
                    disabled={isWeekend || isReadOnly || isLoading || Boolean(busyDate)}
                    onClick={() => void (closedDay ? reopenDay(day.date) : closeDay(day.date))}
                    className={cn(
                      "relative flex aspect-square min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border text-sm font-medium transition-colors",
                      "bg-background hover:bg-muted disabled:cursor-not-allowed",
                      day.date === today && "ring-2 ring-inset ring-primary/60",
                      isWeekend && "border-transparent bg-muted/40 text-muted-foreground/60 hover:bg-muted/40",
                      closedDay &&
                        "border-zinc-800 bg-zinc-950 text-zinc-100 hover:bg-zinc-900 dark:border-zinc-700 dark:bg-black"
                    )}
                  >
                    {isBusy ? <Loader2Icon className="size-4 animate-spin" /> : day.dayNumber}
                    {closedDay ? (
                      <span className="max-w-full truncate px-1 text-[10px] font-normal text-zinc-400">
                        {closedDay.reason || "Closed"}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {!canManage && !isLoading && !loadError ? (
              <p className="text-xs text-muted-foreground">
                Only managers and super admins can close or reopen days.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Upcoming closed days</p>
            {isLoading ? (
              <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Loading closed days
              </div>
            ) : upcomingClosedDays.length === 0 ? (
              <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed px-3 text-sm text-muted-foreground">
                No upcoming closed days
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {upcomingClosedDays.map((closedDay) => (
                  <div
                    key={closedDay.serviceDate}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{formatDayLabel(closedDay.serviceDate)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {closedDay.reason || "No reason given"}
                      </p>
                    </div>
                    {canManage ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busyDate)}
                        onClick={() => void reopenDay(closedDay.serviceDate)}
                      >
                        Reopen
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

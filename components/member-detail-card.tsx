"use client";

import {
  ArrowLeftIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  GaugeIcon,
  PencilIcon,
  TrendingUpIcon,
  UserRoundIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  claimStatusOptions,
  getClaimStatusStyle,
  type Claim,
} from "@/lib/claim-store";
import { getExpectedServiceDatesForMonth } from "@/lib/date-utils";
import { getProviderLabel, type Member } from "@/lib/member-store";
import type { ServiceEntry } from "@/lib/service-store";
import { cn } from "@/lib/utils";

export function MemberDetailCard({
  claims,
  member,
  month,
  onBack,
  onEdit,
  onMonthChange,
  serviceEntries,
}: {
  claims: Claim[];
  member: Member;
  month: string;
  onBack: () => void;
  onEdit: (member: Member) => void;
  onMonthChange: (month: string) => void;
  serviceEntries: ServiceEntry[];
}) {
  const memberServices = serviceEntries
    .filter((entry) => entry.memberId === member.id)
    .sort((left, right) => right.serviceDate.localeCompare(left.serviceDate));
  const memberClaims = claims
    .filter((claim) => claim.memberId === member.id)
    .sort((left, right) => right.serviceDate.localeCompare(left.serviceDate));
  const servicesThisMonth = memberServices.filter((entry) =>
    entry.serviceDate.startsWith(`${month}-`)
  );
  const claimsThisMonth = memberClaims.filter((claim) =>
    claim.serviceDate.startsWith(`${month}-`)
  );
  const expectedDatesThisMonth = getExpectedServiceDatesForMonth(
    month,
    member.serviceDays,
    new Set()
  );
  const attendedDatesThisMonth = new Set(
    servicesThisMonth.map((entry) => entry.serviceDate)
  );
  const missedDatesThisMonth = expectedDatesThisMonth.filter(
    (date) => date <= getTodayDateString() && !attendedDatesThisMonth.has(date)
  );
  const remainingExpectedDates = expectedDatesThisMonth.filter(
    (date) => date > getTodayDateString() && !attendedDatesThisMonth.has(date)
  );
  const expectedThroughToday = expectedDatesThisMonth.filter(
    (date) => date <= getTodayDateString()
  ).length;
  const attendanceRate = expectedThroughToday
    ? Math.round((servicesThisMonth.length / expectedThroughToday) * 100)
    : 0;
  const clearedClaims = claimsThisMonth.filter(
    (claim) => claim.status.toLowerCase() === "accepted"
  ).length;
  const needsReviewClaims = claimsThisMonth.filter(
    (claim) => claim.status.toLowerCase() === "failed"
  ).length;
  const openClaims = claimsThisMonth.filter((claim) =>
    ["required", "pending", "submitted"].includes(claim.status.toLowerCase())
  ).length;
  const claimCounts = claimStatusOptions.map((status) => ({
    ...status,
    count: claimsThisMonth.filter(
      (claim) => claim.status.toLowerCase() === status.value.toLowerCase()
    ).length,
  }));
  const latestClaim = memberClaims[0];
  const lastService = memberServices[0];

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onBack}>
                  <ArrowLeftIcon data-icon="inline-start" />
                  Back
                </Button>
                {member.archivedAt ? (
                  <Badge variant="secondary">Discontinued</Badge>
                ) : null}
              </div>
              <CardTitle className="truncate text-2xl">{member.displayName}</CardTitle>
              <CardDescription>
                {member.provider ? getProviderLabel(member.provider) : "Provider not set"} ·{" "}
                {member.serviceDays || "No service days set"}
              </CardDescription>
            </div>
            <CardAction className="flex shrink-0 gap-2">
              <Input
                className="w-40"
                type="month"
                value={month}
                onChange={(event) => onMonthChange(event.target.value)}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(member)}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
            </CardAction>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailMetric
            icon={UserRoundIcon}
            label="Provider"
            value={member.provider ? getProviderLabel(member.provider) : "Not set"}
          />
          <DetailMetric
            icon={CalendarDaysIcon}
            label="Service days"
            value={member.serviceDays || "Not set"}
          />
          <DetailMetric
            icon={CalendarCheckIcon}
            label="Attendance"
            value={servicesThisMonth.length}
            detail="This month"
          />
          <DetailMetric
            icon={ClipboardListIcon}
            label="Claims"
            value={claimsThisMonth.length}
            detail="This month"
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InsightCard
          icon={GaugeIcon}
          label="Attendance rate"
          value={`${attendanceRate}%`}
          detail={`${servicesThisMonth.length}/${expectedThroughToday || 0} expected through today`}
          tone="sky"
        />
        <InsightCard
          icon={CalendarDaysIcon}
          label="Remaining"
          value={remainingExpectedDates.length}
          detail="Expected later this month"
          tone="violet"
        />
        <InsightCard
          icon={CalendarCheckIcon}
          label="Missed"
          value={missedDatesThisMonth.length}
          detail="Expected dates without attendance"
          tone="amber"
        />
        <InsightCard
          icon={TrendingUpIcon}
          label="Claim cleared"
          value={`${claimsThisMonth.length ? Math.round((clearedClaims / claimsThisMonth.length) * 100) : 0}%`}
          detail={`${clearedClaims} accepted, ${openClaims} still open`}
          tone="emerald"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Claim Status</CardTitle>
            <CardDescription>
              {latestClaim
                ? `Latest claim: ${latestClaim.status} on ${formatDate(latestClaim.serviceDate)}`
                : "No claims recorded for this member"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {claimCounts.map((status) => {
              const style = getClaimStatusStyle(status.value);

              return (
                <div
                  key={status.value}
                  className="flex items-center justify-between rounded-lg border bg-background/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={cn("size-2 rounded-full", style.dot)} />
                    {status.label}
                  </span>
                  <Badge className={style.badge}>{status.count}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>
              {lastService
                ? `Last attended ${formatDate(lastService.serviceDate)}`
                : "No attendance recorded yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {servicesThisMonth.length === 0 ? (
              <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground dark:border-white/10">
                No attendance this month
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {servicesThisMonth.map((entry) => (
                  <Badge
                    key={entry.id}
                    variant="outline"
                    className="h-8 rounded-md px-2.5"
                  >
                    {formatDate(entry.serviceDate)}
                    <span className="text-muted-foreground">{entry.serviceLabel}</span>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Month Snapshot</CardTitle>
            <CardDescription>
              Expected, attended, and remaining service dates for this member.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ProgressRow
              label="Attended"
              value={servicesThisMonth.length}
              total={Math.max(expectedDatesThisMonth.length, servicesThisMonth.length, 1)}
              className="bg-emerald-500"
            />
            <ProgressRow
              label="Remaining"
              value={remainingExpectedDates.length}
              total={Math.max(expectedDatesThisMonth.length, 1)}
              className="bg-violet-500"
            />
            <ProgressRow
              label="Missed"
              value={missedDatesThisMonth.length}
              total={Math.max(expectedThroughToday, 1)}
              className="bg-amber-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Claim Snapshot</CardTitle>
            <CardDescription>Current claim workload for the selected month.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="Open" value={openClaims} />
            <MiniStat label="Accepted" value={clearedClaims} />
            <MiniStat label="Review" value={needsReviewClaims} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Claims</CardTitle>
          <CardDescription>Most recent claim records for this member.</CardDescription>
        </CardHeader>
        <CardContent>
          {memberClaims.length === 0 ? (
            <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground dark:border-white/10">
              No claims yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Last issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberClaims.slice(0, 10).map((claim) => {
                  const style = getClaimStatusStyle(claim.status);

                  return (
                    <TableRow key={claim.id}>
                      <TableCell>{formatDate(claim.serviceDate)}</TableCell>
                      <TableCell>
                        <Badge className={style.badge}>{claim.status}</Badge>
                      </TableCell>
                      <TableCell>{claim.attemptCount}</TableCell>
                      <TableCell className="max-w-72 truncate text-muted-foreground">
                        {claim.lastFailureReason || "None"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailMetric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail?: string;
  icon: typeof UserRoundIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border bg-background/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon data-icon="inline-start" className="text-muted-foreground" />
      </div>
      <p className="truncate text-2xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function InsightCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: typeof UserRoundIcon;
  label: string;
  tone: "amber" | "emerald" | "sky" | "violet";
  value: number | string;
}) {
  const toneClassNames = {
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-950 dark:text-amber-100",
    emerald:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100",
    sky: "border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-100",
    violet:
      "border-violet-500/25 bg-violet-500/10 text-violet-950 dark:text-violet-100",
  };

  return (
    <div className={cn("rounded-lg border p-3", toneClassNames[tone])}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon data-icon="inline-start" />
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ProgressRow({
  className,
  label,
  total,
  value,
}: {
  className: string;
  label: string;
  total: number;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted dark:bg-white/10">
        <div
          className={cn("h-2 rounded-full", className)}
          style={{ width: `${Math.min(100, (value / total) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

function getTodayDateString() {
  return new Date().toLocaleDateString("en-CA");
}

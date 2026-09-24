"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  HomeIcon,
  Loader2Icon,
  ShieldCheckIcon,
  WrenchIcon,
} from "lucide-react";

import { ClosedDaysCard } from "@/components/closed-days-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatMonthLabel,
  getMonthDateRange,
  getMonthInputValue,
  shiftMonth,
} from "@/lib/date-utils";
import { fetchClaimsInRange, type Claim } from "@/lib/claim-store";
import { getProviderLabel, mapMemberRow, type Member, type MemberRow } from "@/lib/member-store";
import { fetchServiceEntriesInRange, type ServiceEntry } from "@/lib/service-store";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const toolCards = [
  {
    title: "Weekend cleanup",
    description:
      "Jump to Services and remove any weekend entries that should not be in the shared log.",
    href: "/workspace?view=services",
    cta: "Open Services",
    icon: CalendarDaysIcon,
  },
  {
    title: "Claims workspace",
    description:
      "Open the Claims dashboard to review required, created, failed, and validated work.",
    href: "/workspace?view=claims",
    cta: "Open Claims",
    icon: ClipboardListIcon,
  },
  {
    title: "Summary checks",
    description:
      "Open Summary for attendance snapshots, month rollups, and quick operational review.",
    href: "/workspace?view=summary",
    cta: "Open Summary",
    icon: ShieldCheckIcon,
  },
];

type RequiredClaimLookupRow = {
  memberId: string;
  memberName: string;
  provider: string;
  requiredCount: number;
  serviceDates: string[];
};

type RequiredClaimBatchRow = {
  id: string;
  memberNames: string[];
  provider: string;
  serviceCount: number;
  serviceDate: string;
};

type WarningSignRow = {
  id: string;
  detail: string;
  memberName: string;
  provider: string;
  serviceDate: string;
  type: "Attended, no claim" | "Claim, no attended service" | "Authorization gap";
};

const memberPreviewLimit = 3;

function formatDateLabel(dateString: string) {
  if (!dateString) {
    return "No date";
  }

  return new Date(`${dateString}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getServiceClaimKey(memberId: string, serviceDate: string) {
  return `${memberId}|${serviceDate}`;
}

function getMemberDisplay(member: Member | undefined) {
  return {
    memberName: member?.displayName ?? "Unknown member",
    provider: member?.provider ? getProviderLabel(member.provider) : "Not set",
  };
}

function getWarningRows(
  claims: Claim[],
  services: ServiceEntry[],
  memberById: Map<string, Member>
): WarningSignRow[] {
  const claimKeySet = new Set(
    claims.map((claim) => getServiceClaimKey(claim.memberId, claim.serviceDate))
  );
  const attendedServiceKeySet = new Set(
    services
      .filter((entry) => entry.serviceLabel.toLowerCase() === "attended")
      .map((entry) => getServiceClaimKey(entry.memberId, entry.serviceDate))
  );
  const warnings: WarningSignRow[] = [];

  for (const entry of services) {
    const member = memberById.get(entry.memberId);
    const { memberName, provider } = getMemberDisplay(member);
    const key = getServiceClaimKey(entry.memberId, entry.serviceDate);

    if (entry.serviceLabel.toLowerCase() === "attended" && !claimKeySet.has(key)) {
      warnings.push({
        id: `attended-no-claim-${key}`,
        detail: "Attended service has no claim row.",
        memberName,
        provider,
        serviceDate: entry.serviceDate,
        type: "Attended, no claim",
      });
    }

    if (entry.serviceLabel.toLowerCase() === "attended" && member?.authExpiresOn) {
      if (entry.serviceDate > member.authExpiresOn) {
        warnings.push({
          id: `auth-gap-${key}`,
          detail: `Auth expires ${formatDateLabel(member.authExpiresOn)}.`,
          memberName,
          provider,
          serviceDate: entry.serviceDate,
          type: "Authorization gap",
        });
      }
    }
  }

  for (const claim of claims) {
    const key = getServiceClaimKey(claim.memberId, claim.serviceDate);

    if (attendedServiceKeySet.has(key)) {
      continue;
    }

    const member = memberById.get(claim.memberId);
    const { memberName, provider } = getMemberDisplay(member);

    warnings.push({
      id: `claim-no-attended-service-${claim.id}`,
      detail: `${claim.status} claim does not match an Attended service entry.`,
      memberName,
      provider,
      serviceDate: claim.serviceDate,
      type: "Claim, no attended service",
    });
  }

  return warnings.sort(
    (left, right) =>
      left.serviceDate.localeCompare(right.serviceDate) ||
      left.type.localeCompare(right.type) ||
      left.memberName.localeCompare(right.memberName)
  );
}

export default function ToolsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getMonthInputValue());
  const [requiredClaimBatches, setRequiredClaimBatches] = useState<
    RequiredClaimBatchRow[]
  >([]);
  const [requiredClaimRows, setRequiredClaimRows] = useState<RequiredClaimLookupRow[]>([]);
  const [requiredClaimTotal, setRequiredClaimTotal] = useState(0);
  const [warningRows, setWarningRows] = useState<WarningSignRow[]>([]);
  const [isLoadingRequiredClaims, setIsLoadingRequiredClaims] = useState(false);
  const [requiredClaimsError, setRequiredClaimsError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setIsCheckingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsCheckingSession(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isCheckingSession) {
      return;
    }

    if (!hasSupabaseConfig || !supabase) {
      router.replace("/login");
      return;
    }

    if (!session) {
      router.replace("/login?redirect=%2Ftools");
    }
  }, [isCheckingSession, router, session]);

  useEffect(() => {
    if (!session || !supabase) {
      return;
    }

    void loadMonthTools(selectedMonth);
  }, [selectedMonth, session]);

  async function loadMonthTools(month: string) {
    if (!supabase) {
      return;
    }

    const { start, end } = getMonthDateRange(month);

    setIsLoadingRequiredClaims(true);
    setRequiredClaimsError(null);

    const [claimsResult, servicesResult] = await Promise.all([
      fetchClaimsInRange(supabase, start, end),
      fetchServiceEntriesInRange(supabase, start, end),
    ]);

    if (claimsResult.error || servicesResult.error) {
      setRequiredClaimsError(
        claimsResult.error?.message ??
          servicesResult.error?.message ??
          "Could not load month tools."
      );
      setRequiredClaimBatches([]);
      setRequiredClaimRows([]);
      setRequiredClaimTotal(0);
      setWarningRows([]);
      setIsLoadingRequiredClaims(false);
      return;
    }

    const claims = claimsResult.data ?? [];
    const services = servicesResult.data ?? [];
    const memberIds = Array.from(
      new Set([
        ...claims.map((claim) => claim.memberId),
        ...services.map((entry) => entry.memberId),
      ])
    );

    if (memberIds.length === 0) {
      setRequiredClaimBatches([]);
      setRequiredClaimRows([]);
      setRequiredClaimTotal(0);
      setWarningRows([]);
      setIsLoadingRequiredClaims(false);
      return;
    }

    const membersResult = await supabase
      .from("members")
      .select(
        "id, display_name, provider, service_days, created_at, updated_at, archived_at, auth_expires_on"
      )
      .in("id", memberIds);

    if (membersResult.error) {
      setRequiredClaimsError(membersResult.error.message);
      setRequiredClaimBatches([]);
      setRequiredClaimRows([]);
      setRequiredClaimTotal(0);
      setWarningRows([]);
      setIsLoadingRequiredClaims(false);
      return;
    }

    const memberById = new Map(
      ((membersResult.data ?? []) as MemberRow[]).map((row) => {
        const member = mapMemberRow(row);
        return [member.id, member];
      })
    );

    const requiredClaims = claims.filter(
      (claim) => claim.status.toLowerCase() === "required"
    );
    const warnings = getWarningRows(claims, services, memberById);
    const groupedRows = new Map<string, RequiredClaimLookupRow>();
    const batchesByProviderDate = new Map<string, RequiredClaimBatchRow>();

    for (const claim of requiredClaims) {
      const member = memberById.get(claim.memberId);
      const memberName = member?.displayName ?? "Unknown member";
      const provider = member?.provider ? getProviderLabel(member.provider) : "Not set";
      let current = groupedRows.get(claim.memberId);

      if (!current) {
        current = {
          memberId: claim.memberId,
          memberName,
          provider,
          requiredCount: 0,
          serviceDates: [],
        };
      }

      current.requiredCount += 1;
      current.serviceDates.push(claim.serviceDate);
      groupedRows.set(claim.memberId, current);

      const batchId = `${provider}|${claim.serviceDate}`;
      let batch = batchesByProviderDate.get(batchId);

      if (!batch) {
        batch = {
          id: batchId,
          memberNames: [],
          provider,
          serviceCount: 0,
          serviceDate: claim.serviceDate,
        };
      }

      batch.serviceCount += 1;
      batch.memberNames.push(memberName);
      batchesByProviderDate.set(batchId, batch);
    }

    const batches = Array.from(batchesByProviderDate.values()).sort((left, right) => {
      const providerSort = left.provider.localeCompare(right.provider);

      if (providerSort !== 0) {
        return providerSort;
      }

      return left.serviceDate.localeCompare(right.serviceDate);
    });

    const rows = Array.from(groupedRows.values()).sort((left, right) => {
      if (right.requiredCount !== left.requiredCount) {
        return right.requiredCount - left.requiredCount;
      }

      return left.memberName.localeCompare(right.memberName);
    });

    setRequiredClaimBatches(batches);
    setRequiredClaimRows(rows);
    setRequiredClaimTotal(requiredClaims.length);
    setWarningRows(warnings);
    setIsLoadingRequiredClaims(false);
  }

  if (isCheckingSession || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card/80 px-6 py-8 shadow-sm">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading tools...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-3xl border bg-card/80 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <WrenchIcon className="size-4" />
                Sophia Members
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Tools</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Quick access to the operational parts of the app that people usually need when
                  cleaning data or checking work.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link
                href="/"
                className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
              >
                <HomeIcon className="size-4" />
                Home
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {toolCards.map(({ title, description, href, cta, icon: Icon }) => (
            <Card key={title} className="border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href={href}
                  className={cn(buttonVariants({ variant: "default" }), "w-full gap-2")}
                >
                  {cta}
                  <ArrowRightIcon className="size-4" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </section>

        <ClosedDaysCard session={session} />

        <Card className="border-border/70 bg-card/90 shadow-sm">
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CalendarDaysIcon className="size-5" />
            </div>
            <CardTitle>Required claims by month</CardTitle>
            <CardDescription>
              Members whose claims are still sitting in <Badge variant="outline">Required</Badge>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous month"
                  onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))}
                >
                  <ChevronLeftIcon />
                </Button>
                <span className="min-w-32 text-center text-sm font-medium">
                  {formatMonthLabel(selectedMonth)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next month"
                  onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))}
                >
                  <ChevronRightIcon />
                </Button>
              </div>
              {isLoadingRequiredClaims ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  Refreshing month
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">
                {requiredClaimRows.length} member{requiredClaimRows.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="secondary">
                {requiredClaimTotal} required claim{requiredClaimTotal === 1 ? "" : "s"}
              </Badge>
              <Badge variant="secondary">
                {requiredClaimBatches.length} creation batch
                {requiredClaimBatches.length === 1 ? "" : "es"}
              </Badge>
              <Badge variant="secondary">
                {warningRows.length} warning sign{warningRows.length === 1 ? "" : "s"}
              </Badge>
              <span>Month: {formatMonthLabel(selectedMonth)}</span>
            </div>

            {requiredClaimsError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {requiredClaimsError}
              </div>
            ) : null}

            {isLoadingRequiredClaims ? (
              <div className="flex min-h-28 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
                <Loader2Icon data-icon="inline-start" />
                Looking up required claims for {formatMonthLabel(selectedMonth)}...
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">Warning signs</h3>
                  {warningRows.length === 0 ? (
                    <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed px-3 text-sm text-muted-foreground">
                      No warning signs found for {formatMonthLabel(selectedMonth)}.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Member</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Detail</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {warningRows.map((warning) => (
                            <TableRow key={warning.id}>
                              <TableCell className="font-medium">{warning.type}</TableCell>
                              <TableCell>{warning.memberName}</TableCell>
                              <TableCell>{warning.provider}</TableCell>
                              <TableCell>{formatDateLabel(warning.serviceDate)}</TableCell>
                              <TableCell className="whitespace-normal text-muted-foreground">
                                {warning.detail}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">Creation batches</h3>
                  {requiredClaimRows.length === 0 ? (
                    <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed px-3 text-sm text-muted-foreground">
                      No required claims in {formatMonthLabel(selectedMonth)}.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Provider</TableHead>
                            <TableHead>Service date</TableHead>
                            <TableHead>Members</TableHead>
                            <TableHead className="text-right">Services</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {requiredClaimBatches.map((batch) => {
                            const previewNames = batch.memberNames.slice(0, memberPreviewLimit);
                            const hiddenCount = batch.memberNames.length - previewNames.length;

                            return (
                              <TableRow key={batch.id}>
                                <TableCell className="w-28 font-medium">
                                  {batch.provider}
                                </TableCell>
                                <TableCell className="w-36">
                                  {formatDateLabel(batch.serviceDate)}
                                </TableCell>
                                <TableCell className="min-w-0 whitespace-normal">
                                  <span className="text-sm">{previewNames.join(", ")}</span>
                                  {hiddenCount > 0 ? (
                                    <span className="ml-1 text-xs text-muted-foreground">
                                      +{hiddenCount} more
                                    </span>
                                  ) : null}
                                </TableCell>
                                <TableCell className="w-20 text-right font-medium">
                                  {batch.serviceCount}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {requiredClaimRows.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">Member detail</h3>
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Member</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead className="text-right">Required</TableHead>
                            <TableHead>Dates</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {requiredClaimRows.map((row) => (
                            <TableRow key={row.memberId}>
                              <TableCell className="font-medium">{row.memberName}</TableCell>
                              <TableCell>{row.provider}</TableCell>
                              <TableCell className="text-right">{row.requiredCount}</TableCell>
                              <TableCell className="whitespace-normal">
                                <span className="text-sm">
                                  {row.serviceDates.map(formatDateLabel).join(", ")}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-dashed bg-muted/30">
          <CardHeader>
            <CardTitle>What changed</CardTitle>
            <CardDescription>
              The workspace sidebar now stays leaner by keeping only the active member count, and
              this page collects the most common operational shortcuts in one place.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Link
              href="/workspace"
              className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
            >
              Open full workspace
              <ArrowRightIcon className="size-4" />
            </Link>
            <Button type="button" variant="ghost" onClick={() => router.push("/workspace?view=services")}>
              Open Services cleanup
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

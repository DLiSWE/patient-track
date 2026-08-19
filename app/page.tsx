"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardListIcon,
  ClockIcon,
  LayoutGridIcon,
  Loader2Icon,
  Maximize2Icon,
  Minimize2Icon,
  SkipBackIcon,
  SkipForwardIcon,
  ThumbsDownIcon,
  UsersIcon,
} from "lucide-react";

import { NewMembersCard } from "@/components/new-members-card";
import {
  attendanceLegendItems,
  getServiceStatusStyle,
  serviceStatusStyles,
} from "@/components/service-calendar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
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
import { fetchClaimsInRange, getClaimStatusStyle, type Claim } from "@/lib/claim-store";
import {
  type CalendarDay,
  getCalendarDays,
  getCompactWeekdayLabel,
  getExpectedMembersByDate,
  getExpectedServiceDatesForMonth,
  getMonthDateRange,
  getMonthInputValue,
  normalizeMonthString,
  weekdayLabels,
} from "@/lib/date-utils";
import { isMemberActiveOnDate, mapMemberRow, type Member } from "@/lib/member-store";
import {
  fetchServiceEntriesInRange,
  getLatestServiceEntryByMember,
  getTodayDate,
  type ServiceEntry,
} from "@/lib/service-store";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type TopSong = {
  rank: string;
  title: string;
  artist: string;
  url: string;
};

const fallbackTopSongs: TopSong[] = [
  {
    rank: "02",
    title: "LOVE ATTACK",
    artist: "RESCENE",
    url: "https://open.spotify.com/search/LOVE%20ATTACK%20RESCENE",
  },
  {
    rank: "03",
    title: "Pretty Girl",
    artist: "RESCENE",
    url: "https://open.spotify.com/search/Pretty%20Girl%20RESCENE",
  },
  {
    rank: "04",
    title: "LEMONADE",
    artist: "aespa",
    url: "https://open.spotify.com/search/LEMONADE%20aespa",
  },
  {
    rank: "05",
    title: "It's Me",
    artist: "ILLIT",
    url: "https://open.spotify.com/search/It's%20Me%20ILLIT",
  },
  {
    rank: "07",
    title: "Lemon Tang",
    artist: "Hearts2Hearts",
    url: "https://open.spotify.com/search/Lemon%20Tang%20Hearts2Hearts",
  },
];

type LandingWidgetKey =
  | "claimStatus"
  | "memberStatus"
  | "monthlyOverview"
  | "attendanceGrid"
  | "topSongs"
  | "ggbae";

const landingWidgetStorageKey = "sophia-landing-widgets";

const landingWidgetOptions: Array<{
  key: LandingWidgetKey;
  label: string;
  description: string;
}> = [
  {
    key: "claimStatus",
    label: "Claim status",
    description: "Required, pending, accepted, and needs-review counts for this month.",
  },
  {
    key: "memberStatus",
    label: "On hold / Medical / Vacation",
    description: "Members whose last tracked service was one of these statuses.",
  },
  {
    key: "monthlyOverview",
    label: "Monthly overview",
    description: "Day-by-day service counts and expected attendance for this month.",
  },
  {
    key: "attendanceGrid",
    label: "Attendance grid",
    description: "Every active member's daily status this month, at a glance.",
  },
  {
    key: "topSongs",
    label: "K-pop chart",
    description: "This week's top tracks.",
  },
  {
    key: "ggbae",
    label: "GGBae counter",
    description: "The counter, for whatever reason.",
  },
];

const landingWidgetOptionByKey = new Map(
  landingWidgetOptions.map((option) => [option.key, option])
);

const defaultLandingWidgetVisibility: Record<LandingWidgetKey, boolean> = {
  claimStatus: true,
  memberStatus: true,
  monthlyOverview: true,
  attendanceGrid: true,
  topSongs: true,
  ggbae: true,
};

type OrderableWidgetKey = Exclude<LandingWidgetKey, "ggbae">;

const defaultWidgetOrder: OrderableWidgetKey[] = [
  "claimStatus",
  "memberStatus",
  "monthlyOverview",
  "attendanceGrid",
  "topSongs",
];

const widgetOrderStorageKey = "sophia-landing-widget-order";

function sanitizeWidgetOrder(raw: unknown): OrderableWidgetKey[] {
  const validKeys = new Set<OrderableWidgetKey>(defaultWidgetOrder);
  const seen = new Set<OrderableWidgetKey>();
  const order: OrderableWidgetKey[] = [];

  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (
        typeof value === "string" &&
        validKeys.has(value as OrderableWidgetKey) &&
        !seen.has(value as OrderableWidgetKey)
      ) {
        seen.add(value as OrderableWidgetKey);
        order.push(value as OrderableWidgetKey);
      }
    }
  }

  for (const key of defaultWidgetOrder) {
    if (!seen.has(key)) {
      order.push(key);
    }
  }

  return order;
}

const attendanceGridPageSizeOptions = [5, 10, 25, 50];
const attendanceGridBigSkip = 5;
const attendanceGridExpandedStorageKey = "sophia-attendance-grid-expanded";

const attendanceGridStatusFilterOptions = [
  { label: "All statuses", value: "all" },
  { label: "Attended", value: "attended" },
  { label: "Medical", value: "medical" },
  { label: "Hold", value: "hold" },
  { label: "Vacation", value: "vacation" },
  { label: "Missing", value: "missing" },
];

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = normalizeMonthString(month).split("-").map(Number);
  return getMonthInputValue(new Date(year, monthNumber - 1 + delta, 1));
}

function formatMonthLabel(month: string): string {
  return new Date(`${normalizeMonthString(month)}-01T00:00:00`).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });
}

export default function HomePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [topSongs, setTopSongs] = useState<TopSong[]>(fallbackTopSongs);
  const [ggBaeCount, setGGBaeCount] = useState<number | null>(0);

  const [members, setMembers] = useState<Member[]>([]);
  const [monthServiceEntries, setMonthServiceEntries] = useState<ServiceEntry[]>([]);
  const [monthClaims, setMonthClaims] = useState<Claim[]>([]);
  const [isWidgetDataLoading, setIsWidgetDataLoading] = useState(true);

  const [landingMonth, setLandingMonth] = useState(getMonthInputValue());
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [widgetVisibility, setWidgetVisibility] = useState<
    Record<LandingWidgetKey, boolean>
  >(defaultLandingWidgetVisibility);
  const [widgetOrder, setWidgetOrder] = useState<OrderableWidgetKey[]>(defaultWidgetOrder);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(landingWidgetStorageKey);
      if (raw) {
        setWidgetVisibility((current) => ({ ...current, ...JSON.parse(raw) }));
      }
    } catch {
      // Ignore malformed or inaccessible storage (private browsing, etc.).
    }

    try {
      const rawOrder = window.localStorage.getItem(widgetOrderStorageKey);
      if (rawOrder) {
        setWidgetOrder(sanitizeWidgetOrder(JSON.parse(rawOrder)));
      }
    } catch {
      // Ignore malformed or inaccessible storage (private browsing, etc.).
    }
  }, []);

  function toggleWidget(key: LandingWidgetKey) {
    setWidgetVisibility((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        window.localStorage.setItem(landingWidgetStorageKey, JSON.stringify(next));
      } catch {
        // Ignore storage write failures -- the toggle still works for this session.
      }
      return next;
    });
  }

  function moveWidget(key: OrderableWidgetKey, direction: "up" | "down") {
    setWidgetOrder((current) => {
      const index = current.indexOf(key);
      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (index === -1 || targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];

      try {
        window.localStorage.setItem(widgetOrderStorageKey, JSON.stringify(next));
      } catch {
        // Ignore storage write failures -- the reorder still works for this session.
      }

      return next;
    });
  }

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setIsCheckingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setIsCheckingSession(false);
      },
    );

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
      router.replace("/login?redirect=%2F");
    }
  }, [isCheckingSession, router, session]);

  const updateGGBaeCount = () => {
    setGGBaeCount((prevCount) => (prevCount !== null ? prevCount + 1 : 1));
  };

  useEffect(() => {
    if (!session) {
      return;
    }

    let isCancelled = false;

    async function loadTopSongs() {
      try {
        const response = await fetch("/api/kpop-top-songs", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { songs?: TopSong[] };
        if (
          !isCancelled &&
          Array.isArray(payload.songs) &&
          payload.songs.length > 0
        ) {
          setTopSongs(payload.songs);
        }
      } catch {
        // Keep the fallback list if Spotify is unavailable.
      }
    }

    void loadTopSongs();

    return () => {
      isCancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session || !supabase) {
      return;
    }

    const supabaseClient: SupabaseClient = supabase;
    let isCancelled = false;

    async function loadWidgetData() {
      setIsWidgetDataLoading(true);
      const monthRange = getMonthDateRange(landingMonth);

      const [membersResult, servicesResult, claimsResult] = await Promise.all([
        supabaseClient
          .from("members")
          .select("id, display_name, provider, service_days, created_at, updated_at, archived_at")
          .order("display_name", { ascending: true }),
        fetchServiceEntriesInRange(supabaseClient, monthRange.start, monthRange.end),
        fetchClaimsInRange(supabaseClient, monthRange.start, monthRange.end),
      ]);

      if (isCancelled) {
        return;
      }

      if (!membersResult.error && membersResult.data) {
        setMembers(membersResult.data.map(mapMemberRow));
      }
      if (!servicesResult.error) {
        setMonthServiceEntries(servicesResult.data);
      }
      if (!claimsResult.error) {
        setMonthClaims(claimsResult.data);
      }
      setIsWidgetDataLoading(false);
    }

    void loadWidgetData();

    return () => {
      isCancelled = true;
    };
  }, [landingMonth, session]);

  const today = getTodayDate();
  const activeMembers = useMemo(
    () => members.filter((member) => isMemberActiveOnDate(member, today)),
    [members, today]
  );
  const claimStats = useMemo(() => {
    const counts = {
      accepted: 0,
      failed: 0,
      pending: 0,
      required: 0,
      submitted: 0,
      total: monthClaims.length,
    };

    for (const claim of monthClaims) {
      const status = claim.status.toLowerCase();
      if (status === "required") {
        counts.required += 1;
      } else if (status === "validated") {
        counts.accepted += 1;
      } else {
        // "Created" (and any other non-terminal status) is awaiting validation.
        counts.pending += 1;
      }

      if (claim.lastFailureReason) {
        counts.failed += 1;
      }
      if (claim.submittedAt) {
        counts.submitted += 1;
      }
    }

    return counts;
  }, [monthClaims]);
  const lastServiceEntryByMember = useMemo(
    () => getLatestServiceEntryByMember(monthServiceEntries),
    [monthServiceEntries]
  );
  const membersByLastStatus = useMemo(() => {
    const byStatus = new Map<string, Member[]>();

    for (const member of activeMembers) {
      const status = lastServiceEntryByMember.get(member.id)?.serviceLabel.toLowerCase();

      if (!status || status === "attended") {
        continue;
      }

      const group = byStatus.get(status) ?? [];
      group.push(member);
      byStatus.set(status, group);
    }

    for (const group of byStatus.values()) {
      group.sort((left, right) =>
        (lastServiceEntryByMember.get(right.id)?.serviceDate ?? "").localeCompare(
          lastServiceEntryByMember.get(left.id)?.serviceDate ?? ""
        )
      );
    }

    return byStatus;
  }, [activeMembers, lastServiceEntryByMember]);

  const [holdPage, setHoldPage] = useState(0);
  const [medicalPage, setMedicalPage] = useState(0);
  const [vacationPage, setVacationPage] = useState(0);
  const membersOnHold = membersByLastStatus.get("hold") ?? [];
  const membersOnMedical = membersByLastStatus.get("medical") ?? [];
  const membersOnVacation = membersByLastStatus.get("vacation") ?? [];

  const [attendanceGridPage, setAttendanceGridPage] = useState(0);
  const [attendanceGridPageSize, setAttendanceGridPageSize] = useState(10);
  const [isAttendanceGridExpanded, setIsAttendanceGridExpanded] = useState(false);
  const [attendanceGridQuery, setAttendanceGridQuery] = useState("");
  const [attendanceGridStatusFilter, setAttendanceGridStatusFilter] = useState("all");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(attendanceGridExpandedStorageKey);
      if (raw != null) {
        setIsAttendanceGridExpanded(raw === "true");
      }
    } catch {
      // Ignore malformed or inaccessible storage (private browsing, etc.).
    }
  }, []);

  function toggleAttendanceGridExpanded() {
    setIsAttendanceGridExpanded((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(attendanceGridExpandedStorageKey, String(next));
      } catch {
        // Ignore storage write failures -- the toggle still works for this session.
      }
      return next;
    });
  }

  const calendarDays = useMemo(() => getCalendarDays(landingMonth), [landingMonth]);
  const countsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of monthServiceEntries) {
      counts.set(entry.serviceDate, (counts.get(entry.serviceDate) ?? 0) + 1);
    }
    return counts;
  }, [monthServiceEntries]);
  const expectedMembersByDate = useMemo(
    () => getExpectedMembersByDate(landingMonth, activeMembers, today),
    [activeMembers, landingMonth, today]
  );
  const attendanceGridDays = useMemo(
    () => calendarDays.filter((day): day is CalendarDay => Boolean(day)),
    [calendarDays]
  );
  const attendanceGridStatusByMember = useMemo(() => {
    const statusByMember = new Map<string, Map<string, string>>();

    for (const entry of monthServiceEntries) {
      const memberStatuses = statusByMember.get(entry.memberId) ?? new Map<string, string>();
      memberStatuses.set(entry.serviceDate, entry.serviceLabel);
      statusByMember.set(entry.memberId, memberStatuses);
    }

    for (const member of activeMembers) {
      const memberStatuses = statusByMember.get(member.id) ?? new Map<string, string>();
      const missingDates = getExpectedServiceDatesForMonth(
        landingMonth,
        member.serviceDays,
        new Set(memberStatuses.keys())
      ).filter((date) => date <= today && isMemberActiveOnDate(member, date));

      for (const date of missingDates) {
        memberStatuses.set(date, "Missing");
      }

      if (memberStatuses.size > 0) {
        statusByMember.set(member.id, memberStatuses);
      }
    }

    return statusByMember;
  }, [activeMembers, landingMonth, monthServiceEntries, today]);

  const attendanceGridClaimStatusByMember = useMemo(() => {
    const claimStatusByMember = new Map<string, Map<string, string>>();

    for (const claim of monthClaims) {
      const memberClaims =
        claimStatusByMember.get(claim.memberId) ?? new Map<string, string>();
      memberClaims.set(claim.serviceDate, claim.status);
      claimStatusByMember.set(claim.memberId, memberClaims);
    }

    return claimStatusByMember;
  }, [monthClaims]);

  const sortedAttendanceGridMembers = useMemo(
    () =>
      [...activeMembers].sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
      ),
    [activeMembers]
  );
  const filteredAttendanceGridMembers = useMemo(() => {
    const normalizedQuery = attendanceGridQuery.trim().toLowerCase();

    return sortedAttendanceGridMembers.filter((member) => {
      if (
        normalizedQuery &&
        !member.displayName.toLowerCase().includes(normalizedQuery)
      ) {
        return false;
      }

      if (attendanceGridStatusFilter === "all") {
        return true;
      }

      const memberStatuses = attendanceGridStatusByMember.get(member.id);
      if (!memberStatuses) {
        return false;
      }

      for (const status of memberStatuses.values()) {
        if (status.toLowerCase() === attendanceGridStatusFilter) {
          return true;
        }
      }

      return false;
    });
  }, [
    attendanceGridQuery,
    attendanceGridStatusByMember,
    attendanceGridStatusFilter,
    sortedAttendanceGridMembers,
  ]);
  const attendanceGridPageCount = Math.max(
    1,
    Math.ceil(filteredAttendanceGridMembers.length / attendanceGridPageSize)
  );
  const safeAttendanceGridPage = Math.min(attendanceGridPage, attendanceGridPageCount - 1);
  const visibleAttendanceGridMembers = isAttendanceGridExpanded
    ? filteredAttendanceGridMembers
    : filteredAttendanceGridMembers.slice(
        safeAttendanceGridPage * attendanceGridPageSize,
        safeAttendanceGridPage * attendanceGridPageSize + attendanceGridPageSize
      );

  const noWidgetsSelected =
    !widgetVisibility.claimStatus &&
    !widgetVisibility.memberStatus &&
    !widgetVisibility.monthlyOverview &&
    !widgetVisibility.attendanceGrid &&
    !widgetVisibility.topSongs;

  if (isCheckingSession || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <ThemeToggle className="absolute top-4 right-4" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Opening Sophia Members
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,rgba(35,78,112,0.08),transparent_18rem)]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12 sm:px-8 lg:px-10">
        <ThemeToggle className="absolute top-4 right-4" />
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end">
          <div className="max-w-3xl">
            <Badge
              variant="outline"
              className="mb-5 rounded-full px-4 py-3 text-[0.72rem] font-semibold tracking-normal border-black/80"
            >
              Home of the bullshit
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              Send claims, 2-3 years, no problem.
            </h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/workspace"
                className={cn(buttonVariants({ size: "lg" }), "min-w-[11rem]")}
                onClick={() => {
                  toast("GGBae");
                }}
              >
                Here we go again
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>

          {widgetVisibility.ggbae ? (
            <div>
              {ggBaeCount !== null && (
                <div className="mb-2 text-sm font-semibold tracking-normal text-foreground">
                  GGBae Count: {ggBaeCount}
                </div>
              )}
              <Button
                variant="link"
                size="sm"
                className="text-muted-foreground"
                onClick={updateGGBaeCount}
              >
                <ThumbsDownIcon className="mr-2 h-4 w-4" />
                GGBae Counter
              </Button>
            </div>
          ) : null}
        </div>

        <section className="mt-14 grid gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <h2 className="text-2xl font-semibold tracking-normal text-foreground">
                Got you
              </h2>
              <p className="text-sm text-muted-foreground">
                Whatever you want to see first, right here -- no need to open the
                workspace.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous month"
                  onClick={() => {
                    setLandingMonth((month) => shiftMonth(month, -1));
                    setAttendanceGridPage(0);
                  }}
                >
                  <ChevronLeftIcon />
                </Button>
                <span className="min-w-28 text-center text-sm font-medium">
                  {formatMonthLabel(landingMonth)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next month"
                  onClick={() => {
                    setLandingMonth((month) => shiftMonth(month, 1));
                    setAttendanceGridPage(0);
                  }}
                >
                  <ChevronRightIcon />
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCustomizeOpen(true)}
              >
                <LayoutGridIcon className="mr-2 h-4 w-4" />
                Customize
              </Button>
            </div>
          </div>

          {noWidgetsSelected ? (
            <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
              <h3 className="font-medium">No widgets selected</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                Use Customize above to add widgets back to this page.
              </p>
            </div>
          ) : null}

          {widgetVisibility.claimStatus ? (
            <div
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
              style={{ order: widgetOrder.indexOf("claimStatus") }}
            >
              <LandingStat
                icon={ClipboardListIcon}
                label="Required"
                value={claimStats.required}
                detail={`${claimStats.total} total this month`}
                tone="violet"
                isLoading={isWidgetDataLoading}
              />
              <LandingStat
                icon={ClockIcon}
                label="Pending"
                value={claimStats.pending}
                detail={`${claimStats.submitted} submitted`}
                tone="slate"
                isLoading={isWidgetDataLoading}
              />
              <LandingStat
                icon={CheckCircle2Icon}
                label="Accepted"
                value={claimStats.accepted}
                detail="Cleared claims"
                tone="emerald"
                isLoading={isWidgetDataLoading}
              />
              <LandingStat
                icon={AlertTriangleIcon}
                label="Needs review"
                value={claimStats.failed}
                detail="Failed claim attempts"
                tone="rose"
                isLoading={isWidgetDataLoading}
              />
            </div>
          ) : null}

          {widgetVisibility.memberStatus ? (
            <div
              className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
              style={{ order: widgetOrder.indexOf("memberStatus") }}
            >
              <NewMembersCard
                defaultCollapsed
                title="On hold"
                description={`${membersOnHold.length} last tracked as hold`}
                emptyMessage="No members on hold"
                getDate={(member) =>
                  lastServiceEntryByMember.get(member.id)?.serviceDate ?? member.updatedAt
                }
                members={membersOnHold}
                page={holdPage}
                pageSize={5}
                onPageChange={setHoldPage}
              />
              <NewMembersCard
                defaultCollapsed
                title="Medical"
                description={`${membersOnMedical.length} last tracked as medical`}
                emptyMessage="No members on medical"
                getDate={(member) =>
                  lastServiceEntryByMember.get(member.id)?.serviceDate ?? member.updatedAt
                }
                members={membersOnMedical}
                page={medicalPage}
                pageSize={5}
                onPageChange={setMedicalPage}
              />
              <NewMembersCard
                defaultCollapsed
                title="Vacation"
                description={`${membersOnVacation.length} last tracked as vacation`}
                emptyMessage="No members on vacation"
                getDate={(member) =>
                  lastServiceEntryByMember.get(member.id)?.serviceDate ?? member.updatedAt
                }
                members={membersOnVacation}
                page={vacationPage}
                pageSize={5}
                onPageChange={setVacationPage}
              />
            </div>
          ) : null}

          {widgetVisibility.monthlyOverview ? (
            <div
              className="rounded-lg border bg-background/60 p-3 dark:border-white/10 dark:bg-white/[0.03]"
              style={{ order: widgetOrder.indexOf("monthlyOverview") }}
            >
              <div className="mb-3">
                <h3 className="text-sm font-medium">Monthly overview</h3>
                <p className="text-xs text-muted-foreground">
                  Day-by-day service counts and expected attendance this month.
                </p>
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
                {calendarDays.map((day, index) => {
                  if (!day) {
                    return (
                      <div
                        key={`landing-empty-${index}`}
                        className="min-h-16 rounded-lg bg-muted/20 dark:bg-white/[0.02]"
                      />
                    );
                  }

                  const count = countsByDate.get(day.date) ?? 0;
                  const expectedCount = expectedMembersByDate.get(day.date)?.length ?? 0;

                  return (
                    <div
                      key={day.date}
                      className={cn(
                        "flex min-h-16 flex-col items-start justify-between rounded-lg border bg-background p-2 text-left dark:border-white/10 dark:bg-white/[0.03]",
                        count > 0 &&
                          "border-primary/30 bg-primary/5 dark:border-sky-400/35 dark:bg-sky-400/10",
                        expectedCount > 0 &&
                          count === 0 &&
                          "border-amber-500/35 bg-amber-100/60 dark:border-amber-300/25 dark:bg-amber-300/10"
                      )}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {day.dayNumber}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <UsersIcon className="h-3 w-3" />
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {widgetVisibility.attendanceGrid ? (
            <div
              className="flex flex-col gap-3 rounded-lg border bg-background/60 p-3 dark:border-white/10 dark:bg-white/[0.03]"
              style={{ order: widgetOrder.indexOf("attendanceGrid") }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium">Attendance grid</h3>
                  <p className="text-xs text-muted-foreground">
                    Every active member&apos;s daily status this month, at a glance.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleAttendanceGridExpanded}
                >
                  {isAttendanceGridExpanded ? (
                    <>
                      <Minimize2Icon className="mr-2 h-4 w-4" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <Maximize2Icon className="mr-2 h-4 w-4" />
                      Expand
                    </>
                  )}
                </Button>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {attendanceLegendItems.map((item) => (
                  <span key={item.key} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-2.5 rounded-full",
                        serviceStatusStyles[item.key]?.dot
                      )}
                    />
                    {item.label}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-muted dark:bg-white/10" />
                  Not expected
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="relative size-2.5">
                    <span className="block size-2.5 rounded-sm bg-emerald-500" />
                    <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-teal-500 ring-1 ring-background" />
                  </span>
                  Corner dot = claim status
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-emerald-500 ring-2 ring-rose-500 ring-offset-1 ring-offset-background" />
                  Red ring = claim needed
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Search members"
                  className="h-9 sm:w-56"
                  placeholder="Search members"
                  value={attendanceGridQuery}
                  onChange={(event) => {
                    setAttendanceGridQuery(event.target.value);
                    setAttendanceGridPage(0);
                  }}
                />
                <Select
                  value={attendanceGridStatusFilter}
                  onValueChange={(value) => {
                    setAttendanceGridStatusFilter(value ?? "all");
                    setAttendanceGridPage(0);
                  }}
                >
                  <SelectTrigger className="w-40">
                    <span>
                      {
                        attendanceGridStatusFilterOptions.find(
                          (option) => option.value === attendanceGridStatusFilter
                        )?.label
                      }
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {attendanceGridStatusFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {filteredAttendanceGridMembers.length} of{" "}
                  {sortedAttendanceGridMembers.length} member
                  {sortedAttendanceGridMembers.length === 1 ? "" : "s"}
                </span>
              </div>

              {attendanceGridDays.length === 0 || activeMembers.length === 0 ? (
                <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  {isWidgetDataLoading ? "Loading..." : "No active members"}
                </div>
              ) : filteredAttendanceGridMembers.length === 0 ? (
                <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  No members match this search/filter.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border dark:border-white/10">
                    <table className="w-full border-separate border-spacing-0 text-xs">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 min-w-40 border-b bg-background px-2 py-1.5 text-left font-medium dark:border-white/10">
                            Member
                          </th>
                          {attendanceGridDays.map((day) => (
                            <th
                              key={day.date}
                              className="min-w-7 border-b bg-background px-0.5 py-1.5 text-center font-medium text-muted-foreground dark:border-white/10"
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
                        {visibleAttendanceGridMembers.map((member) => {
                          const memberStatuses = attendanceGridStatusByMember.get(member.id);
                          const memberClaimStatuses =
                            attendanceGridClaimStatusByMember.get(member.id);

                          return (
                            <tr key={member.id}>
                              <td className="sticky left-0 z-10 truncate border-b bg-background px-2 py-1 font-medium dark:border-white/10">
                                {member.displayName}
                              </td>
                              {attendanceGridDays.map((day) => {
                                const status = memberStatuses?.get(day.date);
                                const claimStatus = memberClaimStatuses?.get(day.date);
                                const needsClaim =
                                  status?.toLowerCase() === "attended" &&
                                  !claimStatus &&
                                  day.date <= today;
                                const titleParts = [
                                  status ? `${member.displayName} — ${day.date}: ${status}` : null,
                                  claimStatus ? `Claim: ${claimStatus}` : null,
                                  needsClaim ? "Claim needed" : null,
                                ].filter((part): part is string => Boolean(part));

                                return (
                                  <td
                                    key={day.date}
                                    className="border-b px-0.5 py-1 dark:border-white/10"
                                    title={titleParts.length > 0 ? titleParts.join(" | ") : undefined}
                                  >
                                    <span className="relative mx-auto block size-4">
                                      <span
                                        className={cn(
                                          "block size-4 rounded-sm",
                                          status
                                            ? getServiceStatusStyle(status).dot
                                            : "bg-muted dark:bg-white/10",
                                          needsClaim &&
                                            "ring-2 ring-rose-500 ring-offset-1 ring-offset-background"
                                        )}
                                      />
                                      {claimStatus ? (
                                        <span
                                          className={cn(
                                            "absolute -top-0.5 -right-0.5 size-1.5 rounded-full ring-1 ring-background",
                                            getClaimStatusStyle(claimStatus).dot
                                          )}
                                        />
                                      ) : null}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {isAttendanceGridExpanded ? (
                    <p className="text-xs text-muted-foreground">
                      Showing all {filteredAttendanceGridMembers.length} of{" "}
                      {sortedAttendanceGridMembers.length} active members.
                    </p>
                  ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Show</span>
                      <Select
                        value={String(attendanceGridPageSize)}
                        onValueChange={(value) => {
                          setAttendanceGridPageSize(Number(value ?? 10));
                          setAttendanceGridPage(0);
                        }}
                      >
                        <SelectTrigger className="w-20">
                          <span>{attendanceGridPageSize}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {attendanceGridPageSizeOptions.map((option) => (
                              <SelectItem key={option} value={String(option)}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">per page</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Page {safeAttendanceGridPage + 1} of {attendanceGridPageCount}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="First page"
                          disabled={safeAttendanceGridPage === 0}
                          onClick={() => setAttendanceGridPage(0)}
                        >
                          <ChevronsLeftIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Back ${attendanceGridBigSkip} pages`}
                          disabled={safeAttendanceGridPage === 0}
                          onClick={() =>
                            setAttendanceGridPage(
                              Math.max(0, safeAttendanceGridPage - attendanceGridBigSkip)
                            )
                          }
                        >
                          <SkipBackIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="Previous page"
                          disabled={safeAttendanceGridPage === 0}
                          onClick={() =>
                            setAttendanceGridPage(Math.max(0, safeAttendanceGridPage - 1))
                          }
                        >
                          <ChevronLeftIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="Next page"
                          disabled={safeAttendanceGridPage >= attendanceGridPageCount - 1}
                          onClick={() =>
                            setAttendanceGridPage(
                              Math.min(attendanceGridPageCount - 1, safeAttendanceGridPage + 1)
                            )
                          }
                        >
                          <ChevronRightIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Forward ${attendanceGridBigSkip} pages`}
                          disabled={safeAttendanceGridPage >= attendanceGridPageCount - 1}
                          onClick={() =>
                            setAttendanceGridPage(
                              Math.min(
                                attendanceGridPageCount - 1,
                                safeAttendanceGridPage + attendanceGridBigSkip
                              )
                            )
                          }
                        >
                          <SkipForwardIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="Last page"
                          disabled={safeAttendanceGridPage >= attendanceGridPageCount - 1}
                          onClick={() => setAttendanceGridPage(attendanceGridPageCount - 1)}
                        >
                          <ChevronsRightIcon />
                        </Button>
                      </div>
                    </div>
                  </div>
                  )}
                </>
              )}
            </div>
          ) : null}

          {widgetVisibility.topSongs ? (
            <div
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
              style={{ order: widgetOrder.indexOf("topSongs") }}
            >
              {topSongs.map((song) => (
                <button
                  key={`${song.rank}-${song.title}`}
                  type="button"
                  className="grid min-h-[168px] gap-6 rounded-lg border border-border/70 bg-card px-5 py-5 text-left shadow-sm transition-colors hover:bg-accent/40 cursor-pointer"
                  onClick={() => {
                    window.open(song.url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <div className="text-xs font-semibold tracking-normal text-muted-foreground">
                    #{song.rank}
                  </div>
                  <div className="grid gap-2 self-end">
                    <h3 className="text-xl font-semibold tracking-normal text-foreground">
                      {song.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{song.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </section>

      <Dialog open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customize this page</DialogTitle>
            <DialogDescription>
              Choose what shows here first. Saved on this device only.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Use the arrows to reorder. Widgets appear top to bottom in this order.
            </p>
            {widgetOrder.map((key, index) => {
              const option = landingWidgetOptionByKey.get(key);

              if (!option) {
                return null;
              }

              return (
                <div
                  key={key}
                  className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm dark:border-white/10"
                >
                  <label className="flex flex-1 items-start gap-2.5">
                    <input
                      checked={widgetVisibility[key]}
                      className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                      type="checkbox"
                      onChange={() => toggleWidget(key)}
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Move ${option.label} up`}
                      disabled={index === 0}
                      onClick={() => moveWidget(key, "up")}
                    >
                      <ChevronUpIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Move ${option.label} down`}
                      disabled={index === widgetOrder.length - 1}
                      onClick={() => moveWidget(key, "down")}
                    >
                      <ChevronDownIcon />
                    </Button>
                  </div>
                </div>
              );
            })}

            <label className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm dark:border-white/10">
              <input
                checked={widgetVisibility.ggbae}
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                type="checkbox"
                onChange={() => toggleWidget("ggbae")}
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">
                  {landingWidgetOptionByKey.get("ggbae")?.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {landingWidgetOptionByKey.get("ggbae")?.description} Always sits next to
                  the title, not reorderable.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setIsCustomizeOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function LandingStat({
  detail,
  icon: Icon,
  isLoading,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: typeof ClipboardListIcon;
  isLoading: boolean;
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
    <div className={cn("rounded-lg border p-3", toneClassNames[tone])}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-semibold">
        {isLoading ? <Loader2Icon className="h-5 w-5 animate-spin" /> : value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

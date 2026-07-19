"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  BarChart3Icon,
  BellIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  EyeIcon,
  Loader2Icon,
  LogOutIcon,
  MenuIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";

import {
  Claim,
  mapClaimRow,
} from "@/lib/claim-store";
import {
  Member,
  MemberFormValues,
  emptyMemberForm,
  getProviderLabel,
  mapMemberRow,
  providerOptions,
  toMemberInsert,
  toMemberUpdate,
} from "@/lib/member-store";
import { AddMembersDialog } from "@/components/add-members-dialog";
import { ClaimsDashboard } from "@/components/claims-dashboard";
import {
  ServiceEntry,
  ServiceEntryFormValues,
  createEmptyServiceEntryForm,
  defaultServiceStatus,
  getTodayDate,
  mapServiceEntryRow,
  serviceStatusOptions,
  toServiceEntryInsert,
} from "@/lib/service-store";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { Field } from "@/components/form-field";
import { MemberDetailCard } from "@/components/member-detail-card";
import { NewMembersCard } from "@/components/new-members-card";
import { ServiceCalendar, getServiceStatusStyle } from "@/components/service-calendar";
import { SummaryCard } from "@/components/summary-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getCalendarDays,
  getDefaultDateForMonth,
  getExpectedMembersByDate,
  getExpectedServiceDatesForMonth,
  getExpectedServiceDatesInRange,
  getMonthDateRange,
  getMonthInputValue,
  getSummaryStats,
  getWeekDateRange,
  isDateInCurrentMonth,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";

type AuthForm = {
  email: string;
  password: string;
};

type ActiveView = "members" | "services" | "claims" | "summary" | "member";

type DateOverride = { action: "add"; status: string } | { action: "remove" };

type SecurityEvent = {
  id: string;
  attemptedEmail: string | null;
  attemptCount: number;
  createdAt: string;
  lockedUntil: string;
};

const emptyAuthForm: AuthForm = {
  email: "",
  password: "",
};

const failedSignInStorageKey = "sophia_failed_sign_in";
const dismissedSecurityEventStorageKey = "sophia_dismissed_security_event";
const maxFailedSignInAttempts = 5;
const signInLockoutMs = 15 * 60 * 1000;
const securityEventLookbackMs = 24 * 60 * 60 * 1000;
const memberActivityPageSize = 10;
const directoryPageSize = 10;
const servicePageSizeOptions = [10, 25, 50, 100];
const summaryAttendeesPageSize = 10;
const viewTitles: Record<ActiveView, string> = {
  members: "Members",
  services: "Services",
  claims: "Claims",
  member: "Member",
  summary: "Summary",
};

export function MemberManager() {
  const memberFormCardRef = useRef<HTMLDivElement>(null);
  const memberNameInputRef = useRef<HTMLInputElement>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [serviceEntries, setServiceEntries] = useState<ServiceEntry[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [form, setForm] = useState<MemberFormValues>(emptyMemberForm);
  const [serviceForm, setServiceForm] = useState<ServiceEntryFormValues>(
    createEmptyServiceEntryForm
  );
  const [calendarMonth, setCalendarMonth] = useState(getMonthInputValue());
  const [summaryMonth, setSummaryMonth] = useState(getMonthInputValue());
  const [memberDetailMonth, setMemberDetailMonth] = useState(getMonthInputValue());
  const [selectedSummaryDate, setSelectedSummaryDate] = useState(getTodayDate());
  const [summaryMemberQuery, setSummaryMemberQuery] = useState("");
  const [summaryAttendeesPage, setSummaryAttendeesPage] = useState(0);
  const [directoryPage, setDirectoryPage] = useState(0);
  const [newMembersPage, setNewMembersPage] = useState(0);
  const [updatedMembersPage, setUpdatedMembersPage] = useState(0);
  const [servicePage, setServicePage] = useState(0);
  const [servicePageSize, setServicePageSize] = useState(10);
  const [dateOverrides, setDateOverrides] = useState<Record<string, DateOverride>>({});
  const [authForm, setAuthForm] = useState<AuthForm>(emptyAuthForm);
  const [failedSignInState, setFailedSignInState] = useState<FailedSignInState>(
    getStoredFailedSignInState
  );
  const [dismissedSecurityEventId, setDismissedSecurityEventId] = useState<
    string | null
  >(getStoredDismissedSecurityEventId);
  const [session, setSession] = useState<Session | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("members");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(true);
  const [isDiscontinuedOpen, setIsDiscontinuedOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [serviceDeleteTarget, setServiceDeleteTarget] = useState<ServiceEntry | null>(
    null
  );
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteAuthError, setDeleteAuthError] = useState<string | null>(null);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(hasSupabaseConfig);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!failedSignInState.lockedUntil) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      clearStoredFailedSignInState();
      setFailedSignInState({ attempts: 0, lockedUntil: null });
    }, Math.max(0, failedSignInState.lockedUntil - Date.now()));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [failedSignInState.lockedUntil]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setMembers([]);
        setServiceEntries([]);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const activeMembers = useMemo(
    () => members.filter((member) => !member.archivedAt),
    [members]
  );
  const discontinuedMembers = useMemo(
    () => members.filter((member) => member.archivedAt),
    [members]
  );

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return activeMembers;
    }

    return members.filter((member) =>
      [member.displayName, member.provider, member.serviceDays]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [activeMembers, members, query]);
  const directoryPageCount = Math.max(
    1,
    Math.ceil(filteredMembers.length / directoryPageSize)
  );
  const safeDirectoryPage = Math.min(directoryPage, directoryPageCount - 1);
  const visibleDirectoryMembers = filteredMembers.slice(
    safeDirectoryPage * directoryPageSize,
    safeDirectoryPage * directoryPageSize + directoryPageSize
  );

  const providerCount = useMemo(
    () => new Set(activeMembers.map((member) => member.provider).filter(Boolean)).size,
    [activeMembers]
  );

  const membersJoinedThisMonth = useMemo(
    () =>
      [...activeMembers]
        .filter((member) => isDateInCurrentMonth(member.createdAt))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [activeMembers]
  );

  const membersUpdatedThisMonth = useMemo(
    () =>
      [...activeMembers]
        .filter(
          (member) =>
            member.updatedAt !== member.createdAt &&
            isDateInCurrentMonth(member.updatedAt) &&
            !isDateInCurrentMonth(member.createdAt)
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [activeMembers]
  );

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members]
  );
  const selectedMember = selectedMemberId ? memberById.get(selectedMemberId) : null;

  const selectedServiceMember = serviceForm.memberId
    ? memberById.get(serviceForm.memberId)
    : null;

  const todayServiceCount = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA");
    return serviceEntries.filter((entry) => entry.serviceDate === today).length;
  }, [serviceEntries]);

  const recordedServiceDatesForMember = useMemo(() => {
    if (!serviceForm.memberId) {
      return new Set<string>();
    }

    return new Set(
      serviceEntries
        .filter((entry) => entry.memberId === serviceForm.memberId)
        .map((entry) => entry.serviceDate)
    );
  }, [serviceEntries, serviceForm.memberId]);

  const recordedServiceEntriesForMemberMonth = useMemo(() => {
    if (!serviceForm.memberId) {
      return [];
    }

    return serviceEntries.filter(
      (entry) =>
        entry.memberId === serviceForm.memberId &&
        entry.serviceDate.startsWith(`${calendarMonth}-`)
    );
  }, [calendarMonth, serviceEntries, serviceForm.memberId]);

  const recordedServiceDatesForMemberMonth = useMemo(
    () =>
      new Set(recordedServiceEntriesForMemberMonth.map((entry) => entry.serviceDate)),
    [recordedServiceEntriesForMemberMonth]
  );

  const recordedStatusByDateForMemberMonth = useMemo(
    () =>
      new Map(
        recordedServiceEntriesForMemberMonth.map((entry) => [
          entry.serviceDate,
          entry.serviceLabel,
        ])
      ),
    [recordedServiceEntriesForMemberMonth]
  );

  const pendingStatusChanges = useMemo(() => {
    if (!serviceForm.memberId) {
      return [];
    }

    return Object.entries(statusOverrides).flatMap(([serviceDate, status]) => {
      const entry = serviceEntries.find(
        (candidate) =>
          candidate.memberId === serviceForm.memberId && candidate.serviceDate === serviceDate
      );
      return entry && entry.serviceLabel !== status ? [{ entry, status }] : [];
    });
  }, [serviceEntries, serviceForm.memberId, statusOverrides]);

  const pendingStatusDates = useMemo(
    () => new Set(pendingStatusChanges.map((change) => change.entry.serviceDate)),
    [pendingStatusChanges]
  );

  const displayedStatusByDateForMemberMonth = useMemo(() => {
    const merged = new Map(recordedStatusByDateForMemberMonth);

    for (const change of pendingStatusChanges) {
      merged.set(change.entry.serviceDate, change.status);
    }

    return merged;
  }, [pendingStatusChanges, recordedStatusByDateForMemberMonth]);

  const calendarDays = useMemo(
    () => getCalendarDays(calendarMonth),
    [calendarMonth]
  );

  const expectedServiceDates = useMemo(
    () =>
      getExpectedServiceDatesForMonth(
        calendarMonth,
        selectedServiceMember?.serviceDays ?? "",
        new Set()
      ),
    [calendarMonth, selectedServiceMember?.serviceDays]
  );

  const serviceDatesToCreate = useMemo(() => {
    return Object.entries(dateOverrides).flatMap(([serviceDate, override]) => {
      if (override.action !== "add" || recordedServiceDatesForMember.has(serviceDate)) {
        return [];
      }
      return [{ serviceDate, status: override.status }];
    });
  }, [dateOverrides, recordedServiceDatesForMember]);

  const newStatusByDateForMonth = useMemo(() => {
    const map = new Map<string, string>();

    for (const { serviceDate, status } of serviceDatesToCreate) {
      if (serviceDate.startsWith(`${calendarMonth}-`)) {
        map.set(serviceDate, status);
      }
    }

    return map;
  }, [calendarMonth, serviceDatesToCreate]);

  const entriesToDelete = useMemo(() => {
    if (!serviceForm.memberId) {
      return [];
    }

    return Object.entries(dateOverrides)
      .filter(([, override]) => override.action === "remove")
      .flatMap(([serviceDate]) => {
        const entry = serviceEntries.find(
          (candidate) =>
            candidate.memberId === serviceForm.memberId &&
            candidate.serviceDate === serviceDate
        );
        return entry ? [entry] : [];
      });
  }, [dateOverrides, serviceEntries, serviceForm.memberId]);

  const effectiveSelectedDatesForMonth = useMemo(() => {
    const dates = new Set<string>();

    for (const serviceDate of recordedServiceDatesForMemberMonth) {
      if (dateOverrides[serviceDate]?.action !== "remove") {
        dates.add(serviceDate);
      }
    }

    for (const [serviceDate, override] of Object.entries(dateOverrides)) {
      if (override.action === "add" && serviceDate.startsWith(`${calendarMonth}-`)) {
        dates.add(serviceDate);
      }
    }

    return Array.from(dates).sort();
  }, [calendarMonth, dateOverrides, recordedServiceDatesForMemberMonth]);

  const serviceChangeCount =
    serviceDatesToCreate.length + entriesToDelete.length + pendingStatusChanges.length;
  const datesToCreateForMonth = useMemo(
    () =>
      serviceDatesToCreate.filter((item) => item.serviceDate.startsWith(`${calendarMonth}-`)),
    [calendarMonth, serviceDatesToCreate]
  );
  const entriesToDeleteForMonth = useMemo(
    () => entriesToDelete.filter((entry) => entry.serviceDate.startsWith(`${calendarMonth}-`)),
    [calendarMonth, entriesToDelete]
  );
  const statusChangesForMonth = useMemo(
    () =>
      pendingStatusChanges.filter((change) =>
        change.entry.serviceDate.startsWith(`${calendarMonth}-`)
      ),
    [calendarMonth, pendingStatusChanges]
  );
  const servicePageCount = Math.max(
    1,
    Math.ceil(serviceEntries.length / servicePageSize)
  );
  const safeServicePage = Math.min(servicePage, servicePageCount - 1);
  const visibleServiceEntries = serviceEntries.slice(
    safeServicePage * servicePageSize,
    safeServicePage * servicePageSize + servicePageSize
  );
  const summaryCalendarDays = useMemo(
    () => getCalendarDays(summaryMonth),
    [summaryMonth]
  );
  const summaryEntriesForMonth = useMemo(
    () =>
      serviceEntries.filter((entry) => entry.serviceDate.startsWith(`${summaryMonth}-`)),
    [serviceEntries, summaryMonth]
  );
  const summaryCountsByDate = useMemo(() => {
    const counts = new Map<string, number>();

    for (const entry of summaryEntriesForMonth) {
      counts.set(entry.serviceDate, (counts.get(entry.serviceDate) ?? 0) + 1);
    }

    return counts;
  }, [summaryEntriesForMonth]);
  const selectedSummaryEntries = useMemo(
    () =>
      serviceEntries.filter((entry) => entry.serviceDate === selectedSummaryDate),
    [selectedSummaryDate, serviceEntries]
  );
  const summaryExpectedMembersByDate = useMemo(
    () => getExpectedMembersByDate(summaryMonth, activeMembers, getTodayDate()),
    [activeMembers, summaryMonth]
  );
  const selectedSummaryExpectedMembers = useMemo(
    () => summaryExpectedMembersByDate.get(selectedSummaryDate) ?? [],
    [selectedSummaryDate, summaryExpectedMembersByDate]
  );
  const isSelectedSummaryDateFuture = selectedSummaryDate > getTodayDate();
  const normalizedSummaryMemberQuery = summaryMemberQuery.trim().toLowerCase();
  const filteredSelectedSummaryEntries = useMemo(() => {
    if (!normalizedSummaryMemberQuery) {
      return selectedSummaryEntries;
    }

    return selectedSummaryEntries.filter((entry) => {
      const member = memberById.get(entry.memberId);
      const searchableText = [
        member?.displayName,
        member?.provider,
        member?.serviceDays,
        entry.serviceLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSummaryMemberQuery);
    });
  }, [memberById, normalizedSummaryMemberQuery, selectedSummaryEntries]);
  const filteredSelectedSummaryExpectedMembers = useMemo(() => {
    if (!normalizedSummaryMemberQuery) {
      return selectedSummaryExpectedMembers;
    }

    return selectedSummaryExpectedMembers.filter((member) =>
      [member.displayName, member.provider, member.serviceDays]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSummaryMemberQuery)
    );
  }, [
    normalizedSummaryMemberQuery,
    selectedSummaryExpectedMembers,
  ]);
  const selectedSummaryRowCount = isSelectedSummaryDateFuture
    ? filteredSelectedSummaryExpectedMembers.length
    : filteredSelectedSummaryEntries.length;
  const summaryAttendeesPageCount = Math.max(
    1,
    Math.ceil(selectedSummaryRowCount / summaryAttendeesPageSize)
  );
  const safeSummaryAttendeesPage = Math.min(
    summaryAttendeesPage,
    summaryAttendeesPageCount - 1
  );
  const visibleSummaryEntries = filteredSelectedSummaryEntries.slice(
    safeSummaryAttendeesPage * summaryAttendeesPageSize,
    safeSummaryAttendeesPage * summaryAttendeesPageSize + summaryAttendeesPageSize
  );
  const visibleSummaryExpectedMembers = filteredSelectedSummaryExpectedMembers.slice(
    safeSummaryAttendeesPage * summaryAttendeesPageSize,
    safeSummaryAttendeesPage * summaryAttendeesPageSize + summaryAttendeesPageSize
  );
  const summaryStats = useMemo(
    () => getSummaryStats(summaryEntriesForMonth, activeMembers.length),
    [activeMembers.length, summaryEntriesForMonth]
  );
  const summaryClaimsForMonth = useMemo(
    () => claims.filter((claim) => claim.serviceDate.startsWith(`${summaryMonth}-`)),
    [claims, summaryMonth]
  );
  const summaryClaimStats = useMemo(() => {
    const counts = {
      accepted: 0,
      failed: 0,
      pending: 0,
      required: 0,
      submitted: 0,
      total: summaryClaimsForMonth.length,
    };

    for (const claim of summaryClaimsForMonth) {
      const status = claim.status.toLowerCase();

      if (status in counts) {
        counts[status as keyof typeof counts] += 1;
      }
    }

    return counts;
  }, [summaryClaimsForMonth]);
  const latestSecurityEvent = securityEvents[0] ?? null;
  const visibleSecurityEvent =
    latestSecurityEvent?.id === dismissedSecurityEventId ? null : latestSecurityEvent;
  const latestSecurityEventTime = useMemo(
    () =>
      visibleSecurityEvent
        ? formatSecurityEventDate(visibleSecurityEvent.createdAt)
        : "",
    [visibleSecurityEvent]
  );
  const isSignInLocked = Boolean(failedSignInState.lockedUntil);

  function showError(nextMessage: string) {
    toast.error(nextMessage);
  }

  function showInfo(nextMessage: string) {
    toast.success(nextMessage);
  }

  async function loadDashboard() {
    if (!supabase) {
      return;
    }

    setIsLoading(true);

    const membersRequest = supabase
      .from("members")
      .select("id, display_name, provider, service_days, created_at, updated_at, archived_at")
      .order("display_name", { ascending: true });

    const servicesRequest = supabase
      .from("service_entries")
      .select("id, member_id, service_date, service_label, created_at")
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false });

    const claimsRequest = supabase
      .from("claims")
      .select(
        "id, member_id, service_date, status, attempt_count, last_attempted_at, last_failure_reason, submitted_at, created_at, updated_at"
      )
      .order("service_date", { ascending: false });

    const [membersResult, servicesResult, claimsResult] = await Promise.all([
      membersRequest,
      servicesRequest,
      claimsRequest,
    ]);

    if (membersResult.error) {
      showError(membersResult.error.message);
    } else {
      const nextMembers = membersResult.data.map(mapMemberRow);
      setMembers(nextMembers);
      const nextMemberId = serviceForm.memberId || nextMembers[0]?.id || "";
      setServiceForm((currentForm) => ({
        ...currentForm,
        memberId: currentForm.memberId || nextMemberId,
      }));
    }

    if (servicesResult.error) {
      showError(servicesResult.error.message);
    } else {
      setServiceEntries(servicesResult.data.map(mapServiceEntryRow));
    }

    if (claimsResult.error) {
      setClaims([]);
    } else {
      setClaims(claimsResult.data.map(mapClaimRow));
    }

    setIsLoading(false);
  }

  useEffect(() => {
    if (session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDashboard();
    }
    // The dashboard should load once per auth session. Month/member changes are local form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const loadSecurityEvents = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const since = new Date(Date.now() - securityEventLookbackMs).toISOString();
    const { data, error } = await supabase
      .from("security_events")
      .select("id, attempted_email, attempt_count, locked_until, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      setSecurityEvents([]);
      return;
    }

    setSecurityEvents(
      data.map((event) => ({
        id: event.id,
        attemptedEmail: event.attempted_email,
        attemptCount: event.attempt_count,
        createdAt: event.created_at,
        lockedUntil: event.locked_until,
      }))
    );
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSecurityEvents();
    const intervalId = window.setInterval(loadSecurityEvents, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadSecurityEvents, session]);

  function acknowledgeSecurityEvent() {
    if (!visibleSecurityEvent) {
      return;
    }

    setDismissedSecurityEventId(visibleSecurityEvent.id);
    storeDismissedSecurityEventId(visibleSecurityEvent.id);
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    let currentFailedSignInState = failedSignInState;

    if (
      currentFailedSignInState.lockedUntil &&
      currentFailedSignInState.lockedUntil <= Date.now()
    ) {
      currentFailedSignInState = { attempts: 0, lockedUntil: null };
      setFailedSignInState(currentFailedSignInState);
      clearStoredFailedSignInState();
    }

    if (
      currentFailedSignInState.lockedUntil &&
      currentFailedSignInState.lockedUntil > Date.now()
    ) {
      showError(getLockoutMessage(currentFailedSignInState.lockedUntil));
      return;
    }

    setIsSaving(true);

    const email = authForm.email.trim();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: authForm.password,
    });

    if (error) {
      const nextAttempts = currentFailedSignInState.attempts + 1;
      const lockedUntil =
        nextAttempts >= maxFailedSignInAttempts
          ? Date.now() + signInLockoutMs
          : null;
      const nextFailedSignInState = {
        attempts: lockedUntil ? maxFailedSignInAttempts : nextAttempts,
        lockedUntil,
      };

      setFailedSignInState(nextFailedSignInState);
      storeFailedSignInState(nextFailedSignInState);

      if (lockedUntil) {
        await reportSecurityEvent(email, nextAttempts, lockedUntil);
        showError(getLockoutMessage(lockedUntil));
      } else {
        showError(
          `${error.message} ${maxFailedSignInAttempts - nextAttempts} attempts left.`
        );
      }
    } else {
      clearStoredFailedSignInState();
      setFailedSignInState({ attempts: 0, lockedUntil: null });
      setSession(data.session);
      setAuthForm(emptyAuthForm);
    }

    setIsSaving(false);
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setMembers([]);
    setServiceEntries([]);
    resetForm();
  }

  async function handleServiceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !serviceForm.memberId) {
      return;
    }

    const supabaseClient = supabase;

    const datesToCreate = serviceDatesToCreate;
    const serviceIdsToDelete = entriesToDelete.map((entry) => entry.id);
    const statusChangesToApply = pendingStatusChanges;

    if (
      datesToCreate.length === 0 &&
      serviceIdsToDelete.length === 0 &&
      statusChangesToApply.length === 0
    ) {
      showInfo("No service date changes to save.");
      return;
    }

    setIsSaving(true);

    const deleteResult =
      serviceIdsToDelete.length > 0
        ? await supabase.from("service_entries").delete().in("id", serviceIdsToDelete)
        : { error: null };

    const insertResult =
      datesToCreate.length > 0
        ? await supabase
          .from("service_entries")
          .insert(
            datesToCreate.map(({ serviceDate, status }) =>
              toServiceEntryInsert({
                memberId: serviceForm.memberId,
                serviceDate,
                serviceLabel: status,
              })
            )
          )
          .select("id, member_id, service_date, service_label, created_at")
          .order("service_date", { ascending: false })
          .order("created_at", { ascending: false })
        : { data: [], error: null };

    const updateResults = await Promise.all(
      statusChangesToApply.map(({ entry, status }) =>
        supabaseClient
          .from("service_entries")
          .update({ service_label: status })
          .eq("id", entry.id)
          .select("id, member_id, service_date, service_label, created_at")
          .single()
      )
    );
    const updateError = updateResults.find((result) => result.error)?.error;

    if (deleteResult.error || insertResult.error || updateError) {
      showError(
        deleteResult.error?.message ||
        insertResult.error?.message ||
        updateError?.message ||
        "Service dates could not be saved."
      );
    } else {
      const nextEntries = insertResult.data.map(mapServiceEntryRow);
      const updatedEntries = updateResults
        .map((result) => result.data)
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map(mapServiceEntryRow);
      const updatedIds = new Set(updatedEntries.map((entry) => entry.id));

      setServiceEntries((currentEntries) =>
        [
          ...nextEntries,
          ...updatedEntries,
          ...currentEntries.filter(
            (entry) => !serviceIdsToDelete.includes(entry.id) && !updatedIds.has(entry.id)
          ),
        ].sort((left, right) => {
          const dateSort = right.serviceDate.localeCompare(left.serviceDate);
          return dateSort || right.createdAt.localeCompare(left.createdAt);
        })
      );
      setDateOverrides((currentOverrides) => {
        const nextOverrides = { ...currentOverrides };
        for (const { serviceDate } of datesToCreate) {
          delete nextOverrides[serviceDate];
        }
        for (const entry of entriesToDelete) {
          delete nextOverrides[entry.serviceDate];
        }
        return nextOverrides;
      });
      setStatusOverrides({});
      showInfo("Service dates saved.");
    }

    setIsSaving(false);
  }

  async function handleBulkFillServices(range: "week" | "monthToDate" | "month") {
    if (!supabase) {
      return;
    }

    const today = getTodayDate();
    const monthRange = getMonthDateRange(calendarMonth);
    const { start, end } =
      range === "week"
        ? getWeekDateRange(today)
        : { start: monthRange.start, end: range === "monthToDate" ? today : monthRange.end };

    const recordedDatesByMember = new Map<string, Set<string>>();
    for (const entry of serviceEntries) {
      const recordedDates = recordedDatesByMember.get(entry.memberId) ?? new Set<string>();
      recordedDates.add(entry.serviceDate);
      recordedDatesByMember.set(entry.memberId, recordedDates);
    }

    const inserts = activeMembers.flatMap((member) => {
      if (!member.serviceDays) {
        return [];
      }

      const expectedDates = getExpectedServiceDatesInRange(
        start,
        end,
        member.serviceDays,
        recordedDatesByMember.get(member.id) ?? new Set<string>()
      );

      return expectedDates.map((serviceDate) =>
        toServiceEntryInsert({
          memberId: member.id,
          serviceDate,
          serviceLabel: defaultServiceStatus,
        })
      );
    });

    if (inserts.length === 0) {
      showInfo("Everyone is already up to date for this range.");
      return;
    }

    setIsSaving(true);

    const { data, error } = await supabase
      .from("service_entries")
      .insert(inserts)
      .select("id, member_id, service_date, service_label, created_at")
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      showError(error.message);
      setIsSaving(false);
      return;
    }

    const nextEntries = data.map(mapServiceEntryRow);
    setServiceEntries((currentEntries) =>
      [...nextEntries, ...currentEntries].sort((left, right) => {
        const dateSort = right.serviceDate.localeCompare(left.serviceDate);
        return dateSort || right.createdAt.localeCompare(left.createdAt);
      })
    );

    showInfo(
      `Added ${nextEntries.length} service ${nextEntries.length === 1 ? "entry" : "entries"}.`
    );
    setIsSaving(false);
  }

  async function updateServiceEntryStatus(entryId: string, newLabel: string) {
    if (!supabase) {
      return false;
    }

    setIsSaving(true);

    const { data, error } = await supabase
      .from("service_entries")
      .update({ service_label: newLabel })
      .eq("id", entryId)
      .select("id, member_id, service_date, service_label, created_at")
      .single();

    if (error) {
      showError(error.message);
      setIsSaving(false);
      return false;
    }

    const updatedEntry = mapServiceEntryRow(data);
    setServiceEntries((currentEntries) =>
      currentEntries.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))
    );
    setIsSaving(false);
    return true;
  }

  function handleStatusOverrideToggle(serviceDate: string) {
    const recordedStatus = recordedStatusByDateForMemberMonth.get(serviceDate) ?? "Attended";
    const targetStatus = serviceForm.serviceLabel;

    setDateOverrides((currentOverrides) => {
      if (currentOverrides[serviceDate]?.action !== "remove") {
        return currentOverrides;
      }
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[serviceDate];
      return nextOverrides;
    });

    setStatusOverrides((currentOverrides) => {
      const pending = currentOverrides[serviceDate];

      if (pending === targetStatus) {
        const nextOverrides = { ...currentOverrides };
        delete nextOverrides[serviceDate];
        return nextOverrides;
      }

      if (!pending && targetStatus === recordedStatus) {
        return currentOverrides;
      }

      return { ...currentOverrides, [serviceDate]: targetStatus };
    });
  }

  function cancelStatusOverride(serviceDate: string) {
    setStatusOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[serviceDate];
      return nextOverrides;
    });
  }

  async function handleEntryStatusChange(entry: ServiceEntry, newLabel: string) {
    if (!newLabel || newLabel === entry.serviceLabel) {
      return;
    }

    const succeeded = await updateServiceEntryStatus(entry.id, newLabel);

    if (succeeded) {
      showInfo(`Set ${entry.serviceDate} to ${newLabel}.`);
    }
  }

  function handleServiceMemberChange(memberId: string) {
    setServiceForm((currentForm) => ({
      ...currentForm,
      memberId,
    }));
    setDateOverrides({});
    setStatusOverrides({});
  }

  function handleCalendarMonthChange(month: string) {
    setCalendarMonth(month);
  }

  function handleSummaryMonthChange(month: string) {
    setSummaryMonth(month);
    setSelectedSummaryDate(getDefaultDateForMonth(month));
    setSummaryAttendeesPage(0);
  }

  function resetExpectedServiceDates() {
    const expectedDates = getExpectedServiceDatesForMonth(
      calendarMonth,
      selectedServiceMember?.serviceDays ?? "",
      recordedServiceDatesForMemberMonth
    );

    setDateOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      for (const serviceDate of expectedDates) {
        nextOverrides[serviceDate] = { action: "add", status: serviceForm.serviceLabel };
      }
      return nextOverrides;
    });

    showInfo(
      expectedDates.length > 0
        ? `Staged ${expectedDates.length} expected service date${expectedDates.length === 1 ? "" : "s"} for this month.`
        : "No new expected service dates to stage. Check this member's Service days field."
    );
  }

  function toggleSelectedServiceDate(serviceDate: string) {
    const isRecorded = recordedServiceDatesForMember.has(serviceDate);
    const targetStatus = serviceForm.serviceLabel;

    setDateOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      const existing = nextOverrides[serviceDate];

      if (isRecorded) {
        if (existing?.action === "remove") {
          delete nextOverrides[serviceDate];
        } else {
          nextOverrides[serviceDate] = { action: "remove" };
        }
      } else if (existing?.action === "add" && existing.status === targetStatus) {
        delete nextOverrides[serviceDate];
      } else {
        nextOverrides[serviceDate] = { action: "add", status: targetStatus };
      }

      return nextOverrides;
    });
  }

  function cancelDateOverride(serviceDate: string) {
    setDateOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[serviceDate];
      return nextOverrides;
    });
  }

  function removeAllSelectedServiceDates() {
    setDateOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      for (const serviceDate of recordedServiceDatesForMemberMonth) {
        nextOverrides[serviceDate] = { action: "remove" };
      }
      for (const serviceDate of Object.keys(nextOverrides)) {
        if (
          serviceDate.startsWith(`${calendarMonth}-`) &&
          nextOverrides[serviceDate]?.action === "add"
        ) {
          delete nextOverrides[serviceDate];
        }
      }
      return nextOverrides;
    });
    setStatusOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      for (const serviceDate of Object.keys(nextOverrides)) {
        if (serviceDate.startsWith(`${calendarMonth}-`)) {
          delete nextOverrides[serviceDate];
        }
      }
      return nextOverrides;
    });
  }

  function resetAllEdits() {
    setDateOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      for (const serviceDate of Object.keys(nextOverrides)) {
        if (serviceDate.startsWith(`${calendarMonth}-`)) {
          delete nextOverrides[serviceDate];
        }
      }
      return nextOverrides;
    });
    setStatusOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      for (const serviceDate of Object.keys(nextOverrides)) {
        if (serviceDate.startsWith(`${calendarMonth}-`)) {
          delete nextOverrides[serviceDate];
        }
      }
      return nextOverrides;
    });
    showInfo("Reverted to the saved state for this month.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    const cleanedForm = {
      displayName: form.displayName.trim(),
      provider: form.provider.trim(),
      serviceDays: form.serviceDays.trim(),
    };

    if (!cleanedForm.displayName) {
      return;
    }

    setIsSaving(true);

    if (editingId) {
      const { data, error } = await supabase
        .from("members")
        .update(toMemberUpdate(cleanedForm))
        .eq("id", editingId)
        .select("id, display_name, provider, service_days, created_at, updated_at, archived_at")
        .single();

      if (error) {
        showError(error.message);
      } else {
        const updatedMember = mapMemberRow(data);
        setMembers((currentMembers) =>
          currentMembers.map((member) =>
            member.id === editingId ? updatedMember : member
          )
        );
        resetForm();
      }
    } else {
      const { data, error } = await supabase
        .from("members")
        .insert(toMemberInsert(cleanedForm))
        .select("id, display_name, provider, service_days, created_at, updated_at, archived_at")
        .single();

      if (error) {
        showError(error.message);
      } else {
        const nextMember = mapMemberRow(data);
        setMembers((currentMembers) =>
          [nextMember, ...currentMembers].sort((left, right) =>
            left.displayName.localeCompare(right.displayName)
          )
        );
        setServiceForm((currentForm) => ({
          ...currentForm,
          memberId: currentForm.memberId || nextMember.id,
        }));
        resetForm();
      }
    }

    setIsSaving(false);
  }

  async function handleBulkAddMembers(
    rows: { displayName: string; provider: string; serviceDays: string }[]
  ) {
    if (!supabase) {
      return false;
    }

    const inserts = rows.map(toMemberInsert).filter((row) => row.display_name);

    if (inserts.length === 0) {
      return false;
    }

    setIsSaving(true);

    const { data, error } = await supabase
      .from("members")
      .insert(inserts)
      .select("id, display_name, provider, service_days, created_at, updated_at, archived_at");

    if (error) {
      showError(error.message);
      setIsSaving(false);
      return false;
    }

    const nextMembers = data.map(mapMemberRow);
    setMembers((currentMembers) =>
      [...nextMembers, ...currentMembers].sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
      )
    );

    if (!serviceForm.memberId && nextMembers[0]) {
      const firstMember = nextMembers[0];
      setServiceForm((currentForm) => ({ ...currentForm, memberId: firstMember.id }));
    }

    showInfo(`Added ${nextMembers.length} member${nextMembers.length === 1 ? "" : "s"}.`);
    setIsSaving(false);
    return true;
  }

  function editMember(member: Member) {
    setEditingId(member.id);
    setForm({
      displayName: member.displayName,
      provider: member.provider,
      serviceDays: member.serviceDays,
    });
    showInfo(`Editing ${member.displayName}.`);
    window.requestAnimationFrame(() => {
      memberFormCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      memberNameInputRef.current?.focus();
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyMemberForm);
  }

  async function confirmArchive() {
    if (!supabase || !archiveTarget) {
      return;
    }

    setIsSaving(true);

    const { data, error } = await supabase
      .from("members")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", archiveTarget.id)
      .select("id, display_name, provider, service_days, created_at, updated_at, archived_at")
      .single();

    if (error) {
      showError(error.message);
    } else {
      const updatedMember = mapMemberRow(data);
      setMembers((currentMembers) =>
        currentMembers.map((member) =>
          member.id === updatedMember.id ? updatedMember : member
        )
      );

      if (editingId === archiveTarget.id) {
        resetForm();
      }

      if (serviceForm.memberId === archiveTarget.id) {
        setServiceForm((currentForm) => ({
          ...currentForm,
          memberId:
            activeMembers.find((member) => member.id !== archiveTarget.id)?.id || "",
        }));
      }

      setArchiveTarget(null);
      showInfo(`Discontinued ${updatedMember.displayName}.`);
    }

    setIsSaving(false);
  }

  async function unarchiveMember(member: Member) {
    if (!supabase) {
      return;
    }

    setIsSaving(true);

    const { data, error } = await supabase
      .from("members")
      .update({ archived_at: null })
      .eq("id", member.id)
      .select("id, display_name, provider, service_days, created_at, updated_at, archived_at")
      .single();

    if (error) {
      showError(error.message);
    } else {
      const updatedMember = mapMemberRow(data);
      setMembers((currentMembers) =>
        currentMembers.map((current) =>
          current.id === updatedMember.id ? updatedMember : current
        )
      );
      showInfo(`Reinstated ${updatedMember.displayName}.`);
    }

    setIsSaving(false);
  }

  async function confirmDeleteMember() {
    if (!supabase || !deleteTarget) {
      return;
    }

    const email = session?.user.email;

    if (!email) {
      setDeleteAuthError("Could not confirm the signed-in user.");
      return;
    }

    if (!deletePassword) {
      setDeleteAuthError("Enter your password to delete this member.");
      return;
    }

    setDeleteAuthError(null);
    setIsSaving(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: deletePassword,
    });

    if (authError) {
      setDeleteAuthError("Password confirmation failed.");
      setIsSaving(false);
      return;
    }

    const deletedMember = deleteTarget;
    const { error } = await supabase.from("members").delete().eq("id", deletedMember.id);

    if (error) {
      showError(error.message);
    } else {
      setMembers((currentMembers) =>
        currentMembers.filter((member) => member.id !== deletedMember.id)
      );
      setServiceEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.memberId !== deletedMember.id)
      );
      setClaims((currentClaims) =>
        currentClaims.filter((claim) => claim.memberId !== deletedMember.id)
      );

      if (editingId === deletedMember.id) {
        resetForm();
      }

      if (selectedMemberId === deletedMember.id) {
        setSelectedMemberId(null);
        setActiveView("members");
      }

      if (serviceForm.memberId === deletedMember.id) {
        setServiceForm((currentForm) => ({
          ...currentForm,
          memberId: activeMembers.find((member) => member.id !== deletedMember.id)?.id || "",
        }));
      }

      setDeleteTarget(null);
      setDeletePassword("");
      setDeleteAuthError(null);
      await loadDashboard();
      showInfo(`Deleted ${deletedMember.displayName}.`);
    }

    setIsSaving(false);
  }

  async function confirmDeleteServiceEntry() {
    if (!supabase || !serviceDeleteTarget) {
      return;
    }

    setIsSaving(true);

    const { error } = await supabase
      .from("service_entries")
      .delete()
      .eq("id", serviceDeleteTarget.id);

    if (error) {
      showError(error.message);
    } else {
      setServiceEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.id !== serviceDeleteTarget.id)
      );
      showInfo("Deleted service date.");
      setServiceDeleteTarget(null);
    }

    setIsSaving(false);
  }

  if (!hasSupabaseConfig) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <ThemeToggle className="absolute top-4 right-4" />
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Supabase setup needed</CardTitle>
            <CardDescription>
              Add your project URL and anon key before using the directory.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircleIcon data-icon="inline-start" />
              <AlertTitle>Missing environment variables</AlertTitle>
              <AlertDescription>
                Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in
                your local and Vercel environments.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <ThemeToggle className="absolute top-4 right-4" />
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sophia Members</CardTitle>
            <CardDescription>Sign in to manage the shared directory.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={handleSignIn}>
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  autoComplete="email"
                  disabled={isSaving || isLoading || isSignInLocked}
                  type="email"
                  value={authForm.email}
                  onChange={(event) =>
                    setAuthForm({ ...authForm, email: event.target.value })
                  }
                  required
                />
              </Field>

              <Field label="Password" htmlFor="password">
                <Input
                  id="password"
                  autoComplete="current-password"
                  disabled={isSaving || isLoading || isSignInLocked}
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm({ ...authForm, password: event.target.value })
                  }
                  required
                />
              </Field>

              <Button
                type="submit"
                disabled={
                  isSaving ||
                  isLoading ||
                  isSignInLocked
                }
              >
                {isSaving || isLoading ? <Loader2Icon data-icon="inline-start" /> : null}
                {isSignInLocked ? "Login locked" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="dashboard-shell min-h-screen lg:pl-80">
        <aside className="sticky top-0 z-40 bg-sidebar text-sidebar-foreground lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-80 lg:flex-col lg:gap-7 lg:overflow-y-auto lg:px-8 lg:py-7">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
            <div className="min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground/70">
                Sophia Members
              </p>
              <h1 className="truncate text-lg font-semibold">
                {viewTitles[activeView]}
              </h1>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground"
              aria-label={isMobileNavOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={isMobileNavOpen}
              onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
            >
              {isMobileNavOpen ? <XIcon /> : <MenuIcon />}
            </Button>
          </div>

          <div
            className={cn(
              "flex flex-col gap-7 border-t border-sidebar-border px-6 py-5 lg:flex lg:flex-1 lg:border-t-0 lg:px-0 lg:py-0",
              !isMobileNavOpen && "hidden"
            )}
          >
            <div className="hidden flex-col gap-4 lg:flex">
              <p className="text-sm font-medium text-sidebar-foreground/70">
                Sophia Members
              </p>
              <div className="flex flex-col gap-3">
                <h1 className="text-3xl font-semibold tracking-tight">
                  Member directory
                </h1>
                <p className="text-sm leading-6 text-sidebar-foreground/70">
                  Store only the operational basics: member name, provider, and
                  service days.
                </p>
              </div>
            </div>

            <Alert className="bg-sidebar-accent text-sidebar-accent-foreground">
              <AlertCircleIcon data-icon="inline-start" />
              <AlertTitle>Keep out</AlertTitle>
              <AlertDescription className="text-sidebar-accent-foreground/70">
                DOBs, insurance IDs, authorization numbers, claim notes, diagnoses.
              </AlertDescription>
            </Alert>

            {visibleSecurityEvent ? (
              <Alert className="border-amber-400/30 bg-amber-400/10 text-sidebar-foreground">
                <BellIcon data-icon="inline-start" />
                <AlertTitle className="flex items-center justify-between gap-2">
                  Login warning
                  <Badge variant="secondary">1 alert</Badge>
                </AlertTitle>
                <AlertDescription className="text-sidebar-foreground/75">
                  {visibleSecurityEvent.attemptedEmail || "Unknown email"} hit{" "}
                  {visibleSecurityEvent.attemptCount} failed attempts at{" "}
                  {latestSecurityEventTime}.
                </AlertDescription>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 border-amber-400/40 bg-transparent text-sidebar-foreground hover:bg-amber-400/15"
                  onClick={acknowledgeSecurityEvent}
                >
                  Acknowledge
                </Button>
              </Alert>
            ) : null}

            <nav className="flex flex-col gap-2">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  activeView === "members" &&
                  "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                onClick={() => {
                  setActiveView("members");
                  setIsMobileNavOpen(false);
                }}
              >
                <UsersIcon data-icon="inline-start" />
                Members
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  activeView === "services" &&
                  "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                onClick={() => {
                  setActiveView("services");
                  setIsMobileNavOpen(false);
                }}
              >
                <CalendarDaysIcon data-icon="inline-start" />
                Services
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  activeView === "claims" &&
                  "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                onClick={() => {
                  setActiveView("claims");
                  setIsMobileNavOpen(false);
                }}
              >
                <ClipboardListIcon data-icon="inline-start" />
                Claims
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  activeView === "summary" &&
                  "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                onClick={() => {
                  setActiveView("summary");
                  setIsMobileNavOpen(false);
                }}
              >
                <BarChart3Icon data-icon="inline-start" />
                Summary
              </Button>
            </nav>

            <div className="mt-auto flex flex-col gap-3">
              <Metric label="Members" value={activeMembers.length} />
              <Metric label="Providers" value={providerCount} />
              <Metric label="Today" value={todayServiceCount} />
              <ThemeToggle className="border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground" />
              <Button
                variant="outline"
                className="border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground"
                onClick={handleSignOut}
              >
                <LogOutIcon data-icon="inline-start" />
                Sign out
              </Button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-7">
          <div className="mx-auto flex max-w-6xl flex-col gap-5">
            <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {viewTitles[activeView]}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isLoading
                    ? "Loading..."
                    : activeView === "member"
                      ? selectedMember
                        ? `${selectedMember.displayName} profile`
                        : "Select a member"
                    : activeView === "summary"
                      ? `${summaryStats.totalServices} services this month`
                      : activeView === "services"
                        ? `${serviceEntries.length} recorded`
                        : activeView === "claims"
                          ? "Claim submission tracking"
                          : `${activeMembers.length} total`}
                </p>
              </div>
            </header>

            {activeView === "summary" ? (
              <SummaryCard
                attendeePage={safeSummaryAttendeesPage}
                attendeePageCount={summaryAttendeesPageCount}
                attendeeSearchQuery={summaryMemberQuery}
                calendarDays={summaryCalendarDays}
                claimStats={summaryClaimStats}
                countsByDate={summaryCountsByDate}
                expectedMembersByDate={summaryExpectedMembersByDate}
                isShowingExpectedMembers={isSelectedSummaryDateFuture}
                memberById={memberById}
                month={summaryMonth}
                onAttendeePageChange={setSummaryAttendeesPage}
                onAttendeeSearchChange={(value) => {
                  setSummaryMemberQuery(value);
                  setSummaryAttendeesPage(0);
                }}
                onMonthChange={handleSummaryMonthChange}
                onSelectDate={(date) => {
                  setSelectedSummaryDate(date);
                  setSummaryAttendeesPage(0);
                }}
                selectedDate={selectedSummaryDate}
                stats={summaryStats}
                visibleEntries={visibleSummaryEntries}
                visibleExpectedMembers={visibleSummaryExpectedMembers}
              />
            ) : activeView === "claims" ? (
              <ClaimsDashboard
                memberById={memberById}
                members={activeMembers}
                serviceEntries={serviceEntries}
              />
            ) : activeView === "member" && selectedMember ? (
              <MemberDetailCard
                claims={claims}
                member={selectedMember}
                month={memberDetailMonth}
                onBack={() => setActiveView("members")}
                onEdit={(member) => {
                  editMember(member);
                  setActiveView("members");
                }}
                onMonthChange={setMemberDetailMonth}
                serviceEntries={serviceEntries}
              />
            ) : activeView === "services" ? (
              <div className="flex flex-col gap-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Bulk fill attendance</CardTitle>
                    <CardDescription>
                      Add expected service days for everyone at once, then remove anyone
                      who didn&apos;t attend.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => handleBulkFillServices("week")}
                    >
                      <CalendarRangeIcon data-icon="inline-start" />
                      This week
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => handleBulkFillServices("monthToDate")}
                    >
                      <CalendarClockIcon data-icon="inline-start" />
                      Through today
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => handleBulkFillServices("month")}
                    >
                      <CalendarDaysIcon data-icon="inline-start" />
                      Whole month
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Service calendar</CardTitle>
                    <CardDescription>
                      Select the service dates this member attended.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form
                      className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)]"
                      onSubmit={handleServiceSubmit}
                    >
                      <Field label="Member" htmlFor="service-member">
                        <Select
                          value={serviceForm.memberId}
                          onValueChange={(value) =>
                            handleServiceMemberChange(value ?? "")
                          }
                        >
                          <SelectTrigger id="service-member" className="w-full">
                            <span className="truncate text-left">
                              {selectedServiceMember?.displayName ?? "Select member"}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {activeMembers.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.displayName}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label="Status to apply on click" htmlFor="service-status">
                        <Select
                          value={serviceForm.serviceLabel}
                          onValueChange={(value) =>
                            setServiceForm((currentForm) => ({
                              ...currentForm,
                              serviceLabel: value ?? defaultServiceStatus,
                            }))
                          }
                        >
                          <SelectTrigger id="service-status" className="w-full">
                            <span className="flex items-center gap-2 truncate text-left">
                              <span
                                className={cn(
                                  "size-2.5 shrink-0 rounded-full",
                                  getServiceStatusStyle(serviceForm.serviceLabel).dot
                                )}
                              />
                              {serviceForm.serviceLabel}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {serviceStatusOptions.map((status) => (
                                <SelectItem key={status.value} value={status.value}>
                                  <span
                                    className={cn(
                                      "size-2.5 shrink-0 rounded-full",
                                      getServiceStatusStyle(status.value).dot
                                    )}
                                  />
                                  {status.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>

                      <div className="flex flex-col gap-4 lg:col-span-2">
                        <ServiceCalendar
                          activeStatus={serviceForm.serviceLabel}
                          month={calendarMonth}
                          days={calendarDays}
                          expectedDates={expectedServiceDates}
                          newStatusByDate={newStatusByDateForMonth}
                          pendingStatusDates={pendingStatusDates}
                          recordedDates={recordedServiceDatesForMemberMonth}
                          recordedStatusByDate={displayedStatusByDateForMemberMonth}
                          selectedDates={effectiveSelectedDatesForMonth}
                          onClearDates={removeAllSelectedServiceDates}
                          onMonthChange={handleCalendarMonthChange}
                          onResetExpected={resetExpectedServiceDates}
                          onStatusClick={handleStatusOverrideToggle}
                          onToggleDate={toggleSelectedServiceDate}
                        />
                        <div className="flex min-h-8 flex-wrap gap-2">
                          {datesToCreateForMonth.length === 0 &&
                          entriesToDeleteForMonth.length === 0 &&
                          statusChangesForMonth.length === 0 ? (
                            <span className="text-sm text-muted-foreground">
                              No changes staged for this month
                            </span>
                          ) : (
                            <>
                              {datesToCreateForMonth.map(({ serviceDate, status }) => (
                                <Badge key={`add-${serviceDate}`} variant="secondary">
                                  + {new Date(`${serviceDate}T00:00:00`).toLocaleDateString()}
                                  {" ("}
                                  {status}
                                  {")"}
                                  <button
                                    type="button"
                                    aria-label={`Cancel adding ${serviceDate}`}
                                    onClick={() => cancelDateOverride(serviceDate)}
                                  >
                                    <XIcon data-icon="inline-end" />
                                  </button>
                                </Badge>
                              ))}
                              {entriesToDeleteForMonth.map((entry) => (
                                <Badge key={`remove-${entry.serviceDate}`} variant="secondary">
                                  − {new Date(`${entry.serviceDate}T00:00:00`).toLocaleDateString()}
                                  <button
                                    type="button"
                                    aria-label={`Cancel removing ${entry.serviceDate}`}
                                    onClick={() => cancelDateOverride(entry.serviceDate)}
                                  >
                                    <XIcon data-icon="inline-end" />
                                  </button>
                                </Badge>
                              ))}
                              {statusChangesForMonth.map(({ entry, status }) => (
                                <Badge key={`status-${entry.serviceDate}`} variant="secondary">
                                  {new Date(`${entry.serviceDate}T00:00:00`).toLocaleDateString()}
                                  {" → "}
                                  {status}
                                  <button
                                    type="button"
                                    aria-label={`Cancel status change for ${entry.serviceDate}`}
                                    onClick={() => cancelStatusOverride(entry.serviceDate)}
                                  >
                                    <XIcon data-icon="inline-end" />
                                  </button>
                                </Badge>
                              ))}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 lg:col-span-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSaving || serviceChangeCount === 0}
                          onClick={resetAllEdits}
                        >
                          <RotateCcwIcon data-icon="inline-start" />
                          Reset edits
                        </Button>
                        <Button
                          type="submit"
                          className="flex-1"
                          disabled={
                            isSaving ||
                            activeMembers.length === 0 ||
                            serviceChangeCount === 0
                          }
                        >
                          {isSaving ? (
                            <Loader2Icon data-icon="inline-start" />
                          ) : (
                            <CalendarCheckIcon data-icon="inline-start" />
                          )}
                          Save {serviceChangeCount} changes
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent services</CardTitle>
                    <CardDescription>
                      Latest service entries from the shared log.
                    </CardDescription>
                    <CardAction>
                      <Select
                        value={String(servicePageSize)}
                        onValueChange={(value) => {
                          setServicePageSize(Number(value ?? 10));
                          setServicePage(0);
                        }}
                      >
                        <SelectTrigger className="w-24">
                          <span>{servicePageSize}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {servicePageSizeOptions.map((option) => (
                              <SelectItem key={option} value={String(option)}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2Icon data-icon="inline-start" />
                        Loading services
                      </div>
                    ) : serviceEntries.length === 0 ? (
                      <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
                        <h3 className="font-medium">No services recorded</h3>
                        <p className="max-w-sm text-sm text-muted-foreground">
                          Record a member service from the form above.
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Member</TableHead>
                            <TableHead>Service</TableHead>
                            <TableHead className="w-28 text-right">Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleServiceEntries.map((entry) => {
                            const member = memberById.get(entry.memberId);
                            return (
                              <TableRow key={entry.id}>
                                <TableCell className="font-medium">
                                  {member?.displayName ?? "Unknown member"}
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={entry.serviceLabel}
                                    onValueChange={(value) =>
                                      handleEntryStatusChange(entry, value ?? entry.serviceLabel)
                                    }
                                  >
                                    <SelectTrigger size="sm" className="w-28">
                                      <span className="flex items-center gap-1.5 truncate text-left">
                                        <span
                                          className={cn(
                                            "size-2 shrink-0 rounded-full",
                                            getServiceStatusStyle(entry.serviceLabel).dot
                                          )}
                                        />
                                        {entry.serviceLabel}
                                      </span>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        {serviceStatusOptions.map((status) => (
                                          <SelectItem key={status.value} value={status.value}>
                                            <span
                                              className={cn(
                                                "size-2 shrink-0 rounded-full",
                                                getServiceStatusStyle(status.value).dot
                                              )}
                                            />
                                            {status.label}
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  {new Date(`${entry.serviceDate}T00:00:00`).toLocaleDateString()}
                                </TableCell>
                                <TableCell>
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => setServiceDeleteTarget(entry)}
                                    >
                                      <Trash2Icon data-icon="inline-start" />
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Page {safeServicePage + 1} of {servicePageCount}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={safeServicePage === 0}
                          onClick={() => setServicePage(Math.max(0, safeServicePage - 1))}
                        >
                          <ChevronLeftIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={safeServicePage >= servicePageCount - 1}
                          onClick={() =>
                            setServicePage(
                              Math.min(servicePageCount - 1, safeServicePage + 1)
                            )
                          }
                        >
                          <ChevronRightIcon />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Directory</CardTitle>
                    <CardDescription>
                      Lightweight shared list for schedule coordination.
                    </CardDescription>
                    <CardAction>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsDirectoryOpen((isOpen) => !isOpen)}
                      >
                        {isDirectoryOpen ? "Hide" : "Show"}
                      </Button>
                    </CardAction>
                  </CardHeader>
                  {isDirectoryOpen ? (
                    <CardContent className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <Input
                          aria-label="Search members"
                          className="sm:w-80"
                          placeholder="Search for name"
                          value={query}
                          onChange={(event) => {
                            setQuery(event.target.value);
                            setDirectoryPage(0);
                          }}
                        />
                        <p className="text-sm text-muted-foreground">
                          {filteredMembers.length} shown
                        </p>
                      </div>
                      {isLoading ? (
                        <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
                          <Loader2Icon data-icon="inline-start" />
                          Loading members
                        </div>
                      ) : filteredMembers.length === 0 ? (
                        <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
                          <h3 className="font-medium">No members found</h3>
                          <p className="max-w-sm text-sm text-muted-foreground">
                            Adjust the search or add a new member from the form.
                          </p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Member</TableHead>
                              <TableHead>Provider</TableHead>
                              <TableHead>Service days</TableHead>
                              <TableHead>Updated</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visibleDirectoryMembers.map((member) => (
                              <TableRow key={member.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {member.displayName}
                                    {member.archivedAt ? (
                                      <Badge variant="secondary">Discontinued</Badge>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {member.provider
                                    ? getProviderLabel(member.provider)
                                    : "Not set"}
                                </TableCell>
                                <TableCell>{member.serviceDays || "Not set"}</TableCell>
                                <TableCell>
                                  {new Date(member.updatedAt).toLocaleDateString()}
                                </TableCell>
                                <TableCell>
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedMemberId(member.id);
                                        setActiveView("member");
                                      }}
                                    >
                                      <EyeIcon data-icon="inline-start" />
                                      View
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => editMember(member)}
                                    >
                                      <PencilIcon data-icon="inline-start" />
                                      Edit
                                    </Button>
                                    {member.archivedAt ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => unarchiveMember(member)}
                                      >
                                        <ArchiveRestoreIcon data-icon="inline-start" />
                                        Reinstate
                                      </Button>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setArchiveTarget(member)}
                                      >
                                        <ArchiveIcon data-icon="inline-start" />
                                        Discontinue
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => setDeleteTarget(member)}
                                    >
                                      <Trash2Icon data-icon="inline-start" />
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                      {filteredMembers.length > 0 ? (
                        <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground dark:border-white/10">
                          <span>
                            Page {safeDirectoryPage + 1} of {directoryPageCount}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              disabled={safeDirectoryPage === 0}
                              onClick={() =>
                                setDirectoryPage(Math.max(0, safeDirectoryPage - 1))
                              }
                            >
                              <ChevronLeftIcon />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              disabled={safeDirectoryPage >= directoryPageCount - 1}
                              onClick={() =>
                                setDirectoryPage(
                                  Math.min(directoryPageCount - 1, safeDirectoryPage + 1)
                                )
                              }
                            >
                              <ChevronRightIcon />
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  ) : null}
                </Card>

                <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                  <Card ref={memberFormCardRef}>
                    <CardHeader>
                      <CardTitle>{editingId ? "Update member" : "Add member"}</CardTitle>
                      <CardDescription>
                        These are the only fields this app saves.
                      </CardDescription>
                      <CardAction className="flex gap-2">
                        {editingId ? (
                          <Button variant="ghost" size="sm" onClick={resetForm}>
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsBulkAddOpen(true)}
                          >
                            <UsersIcon data-icon="inline-start" />
                            Add multiple
                          </Button>
                        )}
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      <form
                        className="flex flex-col gap-4"
                        autoComplete="off"
                        onSubmit={handleSubmit}
                      >
                        <Field label="Member name" htmlFor="display-name">
                          <Input
                            ref={memberNameInputRef}
                            id="display-name"
                            name="sophia-member-display-name"
                            autoComplete="off"
                            autoCorrect="off"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            placeholder="Last, First M."
                            value={form.displayName}
                            onChange={(event) =>
                              setForm({ ...form, displayName: event.target.value })
                            }
                            required
                          />
                        </Field>

                        <Field label="Provider" htmlFor="provider">
                          <Select
                            value={form.provider}
                            onValueChange={(value) =>
                              setForm({ ...form, provider: value ?? "" })
                            }
                          >
                            <SelectTrigger id="provider" className="w-full">
                              <span className="truncate text-left">
                                {form.provider
                                  ? getProviderLabel(form.provider)
                                  : "Select provider"}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {providerOptions.map((provider) => (
                                  <SelectItem
                                    key={provider.value}
                                    value={provider.value}
                                  >
                                    {provider.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>

                        <Field label="Service days" htmlFor="service-days">
                          <Input
                            id="service-days"
                            name="sophia-member-service-days"
                            autoComplete="off"
                            autoCorrect="off"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            placeholder="MTWTHF"
                            value={form.serviceDays}
                            onChange={(event) =>
                              setForm({ ...form, serviceDays: event.target.value })
                            }
                          />
                        </Field>

                        <Button type="submit" disabled={isSaving}>
                          {isSaving ? (
                            <Loader2Icon data-icon="inline-start" />
                          ) : (
                            <PlusIcon data-icon="inline-start" />
                          )}
                          {editingId ? "Save changes" : "Add member"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <NewMembersCard
                      title="Updated members"
                      description={`${membersUpdatedThisMonth.length} updated this month`}
                      emptyMessage="No members updated this month"
                      members={membersUpdatedThisMonth}
                      page={updatedMembersPage}
                      pageSize={memberActivityPageSize}
                      getDate={(member) => member.updatedAt}
                      onPageChange={setUpdatedMembersPage}
                    />

                    <NewMembersCard
                      members={membersJoinedThisMonth}
                      page={newMembersPage}
                      pageSize={memberActivityPageSize}
                      onPageChange={setNewMembersPage}
                    />
                  </div>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Discontinued members</CardTitle>
                    <CardDescription>
                      {discontinuedMembers.length} discontinued
                    </CardDescription>
                    <CardAction>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsDiscontinuedOpen((isOpen) => !isOpen)}
                      >
                        {isDiscontinuedOpen ? "Hide" : "Show"}
                      </Button>
                    </CardAction>
                  </CardHeader>
                  {isDiscontinuedOpen ? (
                    <CardContent className="flex flex-col gap-2">
                      {discontinuedMembers.length === 0 ? (
                        <div className="flex min-h-16 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                          No discontinued members
                        </div>
                      ) : (
                        discontinuedMembers.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                          >
                            <code className="truncate text-xs text-muted-foreground">
                              {JSON.stringify({ name: member.displayName })}
                            </code>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => unarchiveMember(member)}
                            >
                              <ArchiveRestoreIcon data-icon="inline-start" />
                              Reinstate
                            </Button>
                          </div>
                        ))
                      )}
                    </CardContent>
                  ) : null}
                </Card>
              </>
            )}
          </div>
        </section>
      </div>

      <AlertDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
          }
        }}
      >
        <AlertDialogContent className="gap-5">
          <AlertDialogHeader>
            <AlertDialogTitle>Discontinue member?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.displayName} will be hidden from the directory and pickers
              unless you search for them. Their service history is kept, and you can
              reinstate them anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep visible</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmArchive}
              disabled={isSaving}
            >
              Discontinue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(serviceDeleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setServiceDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className="gap-5">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service date?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes one recorded service entry. The member record stays active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {serviceDeleteTarget ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Member</span>
                <span className="truncate font-medium">
                  {memberById.get(serviceDeleteTarget.memberId)?.displayName ??
                    "Unknown member"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">
                  {new Date(
                    `${serviceDeleteTarget.serviceDate}T00:00:00`
                  ).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">{serviceDeleteTarget.serviceLabel}</span>
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep service</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteServiceEntry}
              disabled={isSaving}
            >
              Delete service
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeletePassword("");
            setDeleteAuthError(null);
          }
        }}
      >
        <AlertDialogContent className="gap-5">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete member?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the record for {deleteTarget?.displayName}, along
              with their service history. This cannot be undone. If you just want to hide
              them, use Discontinue instead. Confirm your password to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-password">Password</Label>
            <Input
              id="delete-password"
              name="sophia-delete-confirm-password"
              autoComplete="new-password"
              data-1p-ignore="true"
              data-lpignore="true"
              type="password"
              value={deletePassword}
              onChange={(event) => {
                setDeletePassword(event.target.value);
                setDeleteAuthError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  confirmDeleteMember();
                }
              }}
            />
            {deleteAuthError ? (
              <p className="text-sm text-destructive">{deleteAuthError}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep member</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteMember}
              disabled={isSaving || !deletePassword}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddMembersDialog
        isSaving={isSaving}
        onOpenChange={setIsBulkAddOpen}
        onSubmit={handleBulkAddMembers}
        open={isBulkAddOpen}
      />
    </main>
  );
}

type FailedSignInState = {
  attempts: number;
  lockedUntil: number | null;
};

function getStoredFailedSignInState(): FailedSignInState {
  if (typeof window === "undefined") {
    return { attempts: 0, lockedUntil: null };
  }

  const storedValue = window.localStorage.getItem(failedSignInStorageKey);

  if (!storedValue) {
    return { attempts: 0, lockedUntil: null };
  }

  try {
    const parsedValue = JSON.parse(storedValue) as FailedSignInState;

    if (parsedValue.lockedUntil && parsedValue.lockedUntil <= Date.now()) {
      clearStoredFailedSignInState();
      return { attempts: 0, lockedUntil: null };
    }

    return {
      attempts: Number(parsedValue.attempts) || 0,
      lockedUntil: parsedValue.lockedUntil || null,
    };
  } catch {
    clearStoredFailedSignInState();
    return { attempts: 0, lockedUntil: null };
  }
}

function storeFailedSignInState(state: FailedSignInState) {
  window.localStorage.setItem(failedSignInStorageKey, JSON.stringify(state));
}

function clearStoredFailedSignInState() {
  window.localStorage.removeItem(failedSignInStorageKey);
}

function getStoredDismissedSecurityEventId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(dismissedSecurityEventStorageKey);
}

function storeDismissedSecurityEventId(eventId: string) {
  window.localStorage.setItem(dismissedSecurityEventStorageKey, eventId);
}

function getLockoutMessage(lockedUntil: number) {
  const minutesLeft = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
  return `Too many failed sign-in attempts. Login is locked for ${minutesLeft} minutes.`;
}

function formatSecurityEventDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "America/New_York",
  });
}

async function reportSecurityEvent(
  attemptedEmail: string,
  attemptCount: number,
  lockedUntil: number
) {
  if (!supabase) {
    return;
  }

  await supabase.from("security_events").insert({
    attempted_email: attemptedEmail || null,
    attempt_count: attemptCount,
    event_type: "sign_in_lockout",
    locked_until: new Date(lockedUntil).toISOString(),
    user_agent:
      typeof window === "undefined" ? null : window.navigator.userAgent.slice(0, 500),
  });
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-t border-sidebar-border pt-3">
      <span className="text-sm text-sidebar-foreground/70">{label}</span>
      <strong className="text-2xl">{value}</strong>
    </div>
  );
}

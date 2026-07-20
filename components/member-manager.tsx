"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
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
  HistoryIcon,
  KeyRoundIcon,
  Loader2Icon,
  LogOutIcon,
  MenuIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";

import {
  Claim,
  fetchClaimsInRange,
  toClaimInsert,
} from "@/lib/claim-store";
import { AuditEventInput, createAuditEvent } from "@/lib/audit-store";
import {
  Member,
  MemberFormValues,
  emptyMemberForm,
  getProviderLabel,
  mapMemberRow,
  normalizeServiceDays,
  providerOptions,
  toMemberInsert,
  toMemberUpdate,
} from "@/lib/member-store";
import { AddMembersDialog } from "@/components/add-members-dialog";
import { AuditLog } from "@/components/audit-log";
import { ClaimsDashboard } from "@/components/claims-dashboard";
import {
  ServiceEntry,
  ServiceEntryFormValues,
  createEmptyServiceEntryForm,
  defaultServiceStatus,
  fetchServiceEntriesInRange,
  getTodayDate,
  mapServiceEntryRow,
  serviceEntrySelectColumns,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type ActiveView = "members" | "services" | "claims" | "summary" | "audit" | "member";
type DirectorySortField = "displayName" | "provider" | "updatedAt";
type SortDirection = "asc" | "desc";

type DateOverride = { action: "add"; status: string } | { action: "remove" };

type SecurityEvent = {
  id: string;
  attemptedEmail: string | null;
  attemptCount: number;
  createdAt: string;
  lockedUntil: string;
};

type MfaEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
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
const mfaFriendlyName = "Sophia Members";
const mfaFriendlyNamePrefix = "Sophia Members";
const viewTitles: Record<ActiveView, string> = {
  members: "Members",
  services: "Services",
  claims: "Claims",
  audit: "Audit",
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
  const [claimsMonth, setClaimsMonth] = useState(getMonthInputValue());
  const [loadedDataMonths, setLoadedDataMonths] = useState<Set<string>>(
    () => new Set()
  );
  const [memberDetailMonth, setMemberDetailMonth] = useState(getMonthInputValue());
  const [selectedSummaryDate, setSelectedSummaryDate] = useState(getTodayDate());
  const [summaryMemberQuery, setSummaryMemberQuery] = useState("");
  const [summaryAttendeesPage, setSummaryAttendeesPage] = useState(0);
  const [directoryPage, setDirectoryPage] = useState(0);
  const [newMembersPage, setNewMembersPage] = useState(0);
  const [updatedMembersPage, setUpdatedMembersPage] = useState(0);
  const [servicePage, setServicePage] = useState(0);
  const [servicePageSize, setServicePageSize] = useState(10);
  const [serviceMemberQuery, setServiceMemberQuery] = useState("");
  const [isServiceMemberPickerOpen, setIsServiceMemberPickerOpen] = useState(false);
  const [dateOverrides, setDateOverrides] = useState<Record<string, DateOverride>>({});
  const [authForm, setAuthForm] = useState<AuthForm>(emptyAuthForm);
  const [failedSignInState, setFailedSignInState] = useState<FailedSignInState>(
    getStoredFailedSignInState
  );
  const [dismissedSecurityEventId, setDismissedSecurityEventId] = useState<
    string | null
  >(getStoredDismissedSecurityEventId);
  const [session, setSession] = useState<Session | null>(null);
  const [isMfaChecking, setIsMfaChecking] = useState(false);
  const [isMfaChallengeRequired, setIsMfaChallengeRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [hasMfaFactor, setHasMfaFactor] = useState(false);
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollment | null>(null);
  const [isMfaEnrollOpen, setIsMfaEnrollOpen] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("members");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [directorySortField, setDirectorySortField] =
    useState<DirectorySortField>("displayName");
  const [directorySortDirection, setDirectorySortDirection] =
    useState<SortDirection>("asc");
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
  const [bulkAddRowCount, setBulkAddRowCount] = useState(3);
  const [selectedServiceEntryIds, setSelectedServiceEntryIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isBulkServiceDeleteOpen, setIsBulkServiceDeleteOpen] = useState(false);
  const [isMonthResetOpen, setIsMonthResetOpen] = useState(false);
  const [monthResetConfirmation, setMonthResetConfirmation] = useState("");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(hasSupabaseConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [isMonthLoading, setIsMonthLoading] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [calendarLoadingMessage, setCalendarLoadingMessage] = useState<string | null>(
    null
  );

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

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        await refreshMfaState();
      }
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setMembers([]);
        setServiceEntries([]);
        setClaims([]);
        setLoadedDataMonths(new Set());
        setIsMfaChallengeRequired(false);
        setMfaFactorId("");
        setMfaCode("");
        setHasMfaFactor(false);
      } else {
        await refreshMfaState();
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

    const nextMembers = normalizedQuery
      ? activeMembers.filter((member) =>
        [member.displayName, member.provider, member.serviceDays]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
      : activeMembers;

    return [...nextMembers].sort((left, right) => {
      const direction = directorySortDirection === "asc" ? 1 : -1;

      if (directorySortField === "updatedAt") {
        return left.updatedAt.localeCompare(right.updatedAt) * direction;
      }

      const leftValue =
        directorySortField === "provider"
          ? getProviderLabel(left.provider || "")
          : left.displayName;
      const rightValue =
        directorySortField === "provider"
          ? getProviderLabel(right.provider || "")
          : right.displayName;

      return leftValue.localeCompare(rightValue) * direction;
    });
  }, [
    activeMembers,
    directorySortDirection,
    directorySortField,
    query,
  ]);
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
  const serviceEntryByMemberDate = useMemo(() => {
    const entriesByMemberDate = new Map<string, ServiceEntry>();

    for (const entry of serviceEntries) {
      const key = getServiceEntryMemberDateKey(entry.memberId, entry.serviceDate);
      const existingEntry = entriesByMemberDate.get(key);

      if (
        !existingEntry ||
        getServiceEntryUpdatedAt(entry) >= getServiceEntryUpdatedAt(existingEntry)
      ) {
        entriesByMemberDate.set(key, entry);
      }
    }

    return entriesByMemberDate;
  }, [serviceEntries]);
  const filteredServiceMembers = useMemo(() => {
    const normalizedQuery = serviceMemberQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return activeMembers;
    }

    return activeMembers.filter((member) =>
      [member.displayName, member.provider, member.serviceDays]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [activeMembers, serviceMemberQuery]);

  const todayServiceCount = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA");
    return serviceEntries.filter((entry) => entry.serviceDate === today).length;
  }, [serviceEntries]);
  const serviceEntriesForCalendarMonth = useMemo(
    () =>
      serviceEntries.filter((entry) => entry.serviceDate.startsWith(`${calendarMonth}-`)),
    [calendarMonth, serviceEntries]
  );
  const claimsForClaimsMonth = useMemo(
    () => claims.filter((claim) => claim.serviceDate.startsWith(`${claimsMonth}-`)),
    [claims, claimsMonth]
  );
  const isClaimsMonthLoading =
    isMonthLoading || !loadedDataMonths.has(claimsMonth);

  const recordedServiceDatesForMember = useMemo(() => {
    if (!serviceForm.memberId) {
      return new Set<string>();
    }

    return new Set(
      Array.from(serviceEntryByMemberDate.values())
        .filter((entry) => entry.memberId === serviceForm.memberId)
        .map((entry) => entry.serviceDate)
    );
  }, [serviceEntryByMemberDate, serviceForm.memberId]);

  const recordedServiceEntriesForMemberMonth = useMemo(() => {
    if (!serviceForm.memberId) {
      return [];
    }

    return Array.from(serviceEntryByMemberDate.values()).filter(
      (entry) =>
        entry.memberId === serviceForm.memberId &&
        entry.serviceDate.startsWith(`${calendarMonth}-`)
    );
  }, [calendarMonth, serviceEntryByMemberDate, serviceForm.memberId]);

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

    return Object.entries(statusOverrides).flatMap(([overrideKey, status]) => {
      const serviceDate = getServiceDateFromMemberDateKey(overrideKey);
      const entry = serviceEntryByMemberDate.get(overrideKey);

      if (!serviceDate || !entry || entry.memberId !== serviceForm.memberId) {
        return [];
      }

      return entry && entry.serviceLabel !== status ? [{ entry, status }] : [];
    });
  }, [serviceEntryByMemberDate, serviceForm.memberId, statusOverrides]);

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
    return Object.entries(dateOverrides).flatMap(([overrideKey, override]) => {
      const serviceDate = getServiceDateFromMemberDateKey(overrideKey);

      if (!serviceDate || !overrideKey.startsWith(`${serviceForm.memberId}:`)) {
        return [];
      }

      if (override.action !== "add" || recordedServiceDatesForMember.has(serviceDate)) {
        return [];
      }
      return [{ serviceDate, status: override.status }];
    });
  }, [dateOverrides, recordedServiceDatesForMember, serviceForm.memberId]);

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
      .flatMap(([overrideKey]) => {
        const entry = serviceEntryByMemberDate.get(overrideKey);

        if (!entry || entry.memberId !== serviceForm.memberId) {
          return [];
        }

        return entry ? [entry] : [];
      });
  }, [dateOverrides, serviceEntryByMemberDate, serviceForm.memberId]);

  const effectiveSelectedDatesForMonth = useMemo(() => {
    const dates = new Set<string>();

    for (const serviceDate of recordedServiceDatesForMemberMonth) {
      const overrideKey = getServiceEntryMemberDateKey(serviceForm.memberId, serviceDate);

      if (dateOverrides[overrideKey]?.action !== "remove") {
        dates.add(serviceDate);
      }
    }

    for (const [overrideKey, override] of Object.entries(dateOverrides)) {
      const serviceDate = getServiceDateFromMemberDateKey(overrideKey);

      if (!serviceDate || !overrideKey.startsWith(`${serviceForm.memberId}:`)) {
        continue;
      }

      if (override.action === "add" && serviceDate.startsWith(`${calendarMonth}-`)) {
        dates.add(serviceDate);
      }
    }

    return Array.from(dates).sort();
  }, [calendarMonth, dateOverrides, recordedServiceDatesForMemberMonth, serviceForm.memberId]);

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
    Math.ceil(serviceEntriesForCalendarMonth.length / servicePageSize)
  );
  const safeServicePage = Math.min(servicePage, servicePageCount - 1);
  const visibleServiceEntries = serviceEntriesForCalendarMonth.slice(
    safeServicePage * servicePageSize,
    safeServicePage * servicePageSize + servicePageSize
  );
  const recentlyUpdatedServiceEntries = useMemo(
    () =>
      [...serviceEntriesForCalendarMonth]
        .sort((left, right) =>
          getServiceEntryUpdatedAt(right).localeCompare(getServiceEntryUpdatedAt(left))
        )
        .slice(0, 5),
    [serviceEntriesForCalendarMonth]
  );
  const selectedServiceEntries = useMemo(
    () =>
      serviceEntriesForCalendarMonth.filter((entry) =>
        selectedServiceEntryIds.has(entry.id)
      ),
    [selectedServiceEntryIds, serviceEntriesForCalendarMonth]
  );
  const areAllVisibleServicesSelected =
    visibleServiceEntries.length > 0 &&
    visibleServiceEntries.every((entry) => selectedServiceEntryIds.has(entry.id));
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

  async function recordAuditEvent(input: AuditEventInput) {
    if (!supabase) {
      return;
    }

    const { error } = await createAuditEvent(supabase, {
      ...input,
      actorEmail: session?.user.email ?? null,
    });

    if (error) {
      console.error("Audit event failed", error.message);
    }
  }

  async function refreshMfaState() {
    if (!supabase) {
      return false;
    }

    setIsMfaChecking(true);

    const [aalResult, factorsResult] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

    if (aalResult.error || factorsResult.error) {
      setMfaError(aalResult.error?.message || factorsResult.error?.message || null);
      setIsMfaChecking(false);
      return false;
    }

    const verifiedTotpFactors = factorsResult.data.totp.filter(
      (factor) => factor.status === "verified"
    );
    const requiresChallenge =
      aalResult.data.currentLevel === "aal1" &&
      aalResult.data.nextLevel === "aal2" &&
      verifiedTotpFactors.length > 0;

    setHasMfaFactor(verifiedTotpFactors.length > 0);
    setMfaFactorId(verifiedTotpFactors[0]?.id ?? "");
    setIsMfaChallengeRequired(requiresChallenge);
    setMfaError(null);
    setIsMfaChecking(false);

    return requiresChallenge;
  }

  async function loadDashboard(
    preferredServiceMemberId = serviceForm.memberId,
    month = calendarMonth
  ) {
    if (!supabase) {
      return;
    }

    setIsLoading(true);
    setBusyMessage("Loading dashboard data...");
    const monthRange = getMonthDateRange(month);

    try {
      const membersRequest = supabase
        .from("members")
        .select("id, display_name, provider, service_days, created_at, updated_at, archived_at")
        .order("display_name", { ascending: true });

      const [membersResult, servicesResult, claimsResult] = await Promise.all([
        membersRequest,
        fetchServiceEntriesInRange(supabase, monthRange.start, monthRange.end),
        fetchClaimsInRange(supabase, monthRange.start, monthRange.end),
      ]);

      if (membersResult.error) {
        showError(membersResult.error.message);
      } else {
        const nextMembers = membersResult.data.map(mapMemberRow);
        setMembers(nextMembers);
        const nextMemberId = preferredServiceMemberId || nextMembers[0]?.id || "";
        setServiceForm((currentForm) => ({
          ...currentForm,
          memberId: preferredServiceMemberId || currentForm.memberId || nextMemberId,
        }));
      }

      if (servicesResult.error) {
        showError(servicesResult.error.message);
      } else {
        setServiceEntries((currentEntries) =>
          replaceServiceEntriesForMonth(currentEntries, month, servicesResult.data)
        );
      }

      if (claimsResult.error) {
        setClaims((currentClaims) => replaceClaimsForMonth(currentClaims, month, []));
      } else {
        setClaims((currentClaims) =>
          replaceClaimsForMonth(currentClaims, month, claimsResult.data)
        );
      }

      if (!servicesResult.error && !claimsResult.error) {
        setLoadedDataMonths((currentMonths) => new Set(currentMonths).add(month));
      }
    } finally {
      setIsLoading(false);
      setBusyMessage(null);
    }
  }

  async function refreshMonthData(month: string) {
    if (!supabase) {
      return;
    }

    setIsMonthLoading(true);
    setBusyMessage(`Loading ${formatMonthLabel(month)} data...`);
    const monthRange = getMonthDateRange(month);
    try {
      const [servicesResult, claimsResult] = await Promise.all([
        fetchServiceEntriesInRange(supabase, monthRange.start, monthRange.end),
        fetchClaimsInRange(supabase, monthRange.start, monthRange.end),
      ]);

      if (servicesResult.error) {
        showError(servicesResult.error.message);
      } else {
        setServiceEntries((currentEntries) =>
          replaceServiceEntriesForMonth(currentEntries, month, servicesResult.data)
        );
      }

      if (claimsResult.error) {
        showError(claimsResult.error.message);
      } else {
        setClaims((currentClaims) =>
          replaceClaimsForMonth(currentClaims, month, claimsResult.data)
        );
      }

      if (!servicesResult.error && !claimsResult.error) {
        setLoadedDataMonths((currentMonths) => new Set(currentMonths).add(month));
      }
    } finally {
      setIsMonthLoading(false);
      setBusyMessage(null);
    }
  }

  useEffect(() => {
    if (session && hasMfaFactor && !isMfaChallengeRequired && !isMfaChecking) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDashboard();
    }
    // The dashboard should load once per auth session. Month/member changes are local form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMfaFactor, isMfaChallengeRequired, isMfaChecking, session]);

  useEffect(() => {
    if (
      activeView !== "claims" ||
      !session ||
      !hasMfaFactor ||
      isMfaChallengeRequired ||
      isMfaChecking
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshMonthData(claimsMonth);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
    // Claims review must be based on a fresh month snapshot when the tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeView,
    claimsMonth,
    hasMfaFactor,
    isMfaChallengeRequired,
    isMfaChecking,
    session,
  ]);

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
    if (!session || !hasMfaFactor || isMfaChallengeRequired || isMfaChecking) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSecurityEvents();
    const intervalId = window.setInterval(loadSecurityEvents, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    hasMfaFactor,
    isMfaChallengeRequired,
    isMfaChecking,
    loadSecurityEvents,
    session,
  ]);

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
    setBusyMessage("Checking sign in...");

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
      await refreshMfaState();
      setSession(data.session);
      setAuthForm(emptyAuthForm);
    }

    setIsSaving(false);
  }

  async function startMfaEnrollment() {
    if (!supabase) {
      return;
    }

    setMfaError(null);
    setIsSaving(true);
    setBusyMessage("Preparing two-factor setup...");

    const factors = await supabase.auth.mfa.listFactors();

    if (factors.error) {
      setMfaError(factors.error.message);
      showError(factors.error.message);
      setIsSaving(false);
      return;
    }

    for (const factor of factors.data.totp) {
      const friendlyName = factor.friendly_name ?? "";

      if (
        friendlyName.startsWith(mfaFriendlyNamePrefix) &&
        factor.status !== "verified"
      ) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }

    const enrollmentName = `${mfaFriendlyName} ${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14)}`;
    const enrollment = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: enrollmentName,
    });

    if (enrollment.error) {
      const error = enrollment.error;
      setMfaError(error.message);
      showError(error.message);
    } else {
      setMfaEnrollment({
        factorId: enrollment.data.id,
        qrCode: enrollment.data.totp.qr_code,
        secret: enrollment.data.totp.secret,
      });
      setMfaCode("");
      setIsMfaEnrollOpen(true);
    }

    setIsSaving(false);
  }

  async function verifyMfaEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !mfaEnrollment || !mfaCode.trim()) {
      return;
    }

    setMfaError(null);
    setIsSaving(true);
    setBusyMessage("Verifying two-factor code...");

    const challenge = await supabase.auth.mfa.challenge({
      factorId: mfaEnrollment.factorId,
    });

    if (challenge.error) {
      setMfaError(challenge.error.message);
      setIsSaving(false);
      return;
    }

    const verify = await supabase.auth.mfa.verify({
      factorId: mfaEnrollment.factorId,
      challengeId: challenge.data.id,
      code: mfaCode.trim(),
    });

    if (verify.error) {
      setMfaError(verify.error.message);
    } else {
      setMfaEnrollment(null);
      setIsMfaEnrollOpen(false);
      setMfaCode("");
      await refreshMfaState();
      showInfo("Two-factor authentication enabled.");
    }

    setIsSaving(false);
  }

  async function verifyMfaChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !mfaFactorId || !mfaCode.trim()) {
      return;
    }

    setMfaError(null);
    setIsSaving(true);
    setBusyMessage("Checking two-factor code...");

    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });

    if (challenge.error) {
      setMfaError(challenge.error.message);
      setIsSaving(false);
      return;
    }

    const verify = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.data.id,
      code: mfaCode.trim(),
    });

    if (verify.error) {
      setMfaError(verify.error.message);
    } else {
      setMfaCode("");
      setIsMfaChallengeRequired(false);
      await refreshMfaState();
      showInfo("Two-factor check complete.");
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

    if (!supabase) {
      return;
    }

    if (!serviceForm.memberId) {
      showError("Select a member before saving service dates.");
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
    setBusyMessage("Saving service calendar changes...");

    const deleteResult =
      serviceIdsToDelete.length > 0
        ? await supabase.from("service_entries").delete().in("id", serviceIdsToDelete)
        : { error: null };

    const savedAt = new Date().toISOString();
    const insertResult =
      datesToCreate.length > 0
        ? await supabase
          .from("service_entries")
          .upsert(
            datesToCreate.map(({ serviceDate, status }) => ({
              ...toServiceEntryInsert({
                memberId: serviceForm.memberId,
                serviceDate,
                serviceLabel: status,
              }),
              updated_at: savedAt,
            })),
            { onConflict: "member_id,service_date" }
          )
        : { error: null };

    const updateResults = await Promise.all(
      statusChangesToApply.map(({ entry, status }) =>
        supabaseClient
          .from("service_entries")
          .update({ service_label: status, updated_at: new Date().toISOString() })
          .eq("id", entry.id)
          .select(serviceEntrySelectColumns)
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
      const monthRange = getMonthDateRange(calendarMonth);
      const refreshedMonthResult = await fetchServiceEntriesInRange(
        supabase,
        monthRange.start,
        monthRange.end
      );

      if (refreshedMonthResult.error) {
        showError(refreshedMonthResult.error.message);
        setIsSaving(false);
        return;
      }

      const verificationError = getServiceSaveVerificationError(
        refreshedMonthResult.data,
        serviceForm.memberId,
        datesToCreate,
        entriesToDelete,
        statusChangesToApply
      );

      setServiceEntries((currentEntries) =>
        replaceServiceEntriesForMonth(currentEntries, calendarMonth, refreshedMonthResult.data)
      );

      if (verificationError) {
        showError(verificationError);
        setIsSaving(false);
        return;
      }

      const claimSyncResult = await reconcileSafeClaimsForServiceChanges(
        supabase,
        serviceForm.memberId,
        calendarMonth,
        datesToCreate,
        entriesToDelete,
        statusChangesToApply
      );

      if (claimSyncResult.error) {
        showError(claimSyncResult.error);
        setIsSaving(false);
        return;
      }

      setClaims((currentClaims) =>
        replaceClaimsForMonth(currentClaims, calendarMonth, claimSyncResult.claims)
      );

      setDateOverrides((currentOverrides) => {
        return clearCalendarOverridesForMemberMonth(
          currentOverrides,
          serviceForm.memberId,
          calendarMonth
        );
      });
      setStatusOverrides((currentOverrides) =>
        clearCalendarOverridesForMemberMonth(
          currentOverrides,
          serviceForm.memberId,
          calendarMonth
        )
      );
      await recordAuditEvent({
        action: "service_calendar_saved",
        entityType: "service",
        entityId: serviceForm.memberId,
        summary: `Saved service calendar changes for ${selectedServiceMember?.displayName ?? "selected member"}.`,
        metadata: {
          member: selectedServiceMember?.displayName,
          month: calendarMonth,
          added: datesToCreate.length,
          removed: entriesToDelete.length,
          statusChanged: statusChangesToApply.length,
          claimsCreated: claimSyncResult.created,
          claimsRemoved: claimSyncResult.removed,
          addedDates: datesToCreate.map((item) => item.serviceDate),
          removedDates: entriesToDelete.map((entry) => entry.serviceDate),
          statusChanges: statusChangesToApply.map(({ entry, status }) => ({
            date: entry.serviceDate,
            from: entry.serviceLabel,
            to: status,
          })),
        },
      });
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

    setIsSaving(true);
    setBusyMessage(
      range === "week"
        ? "Bulk filling this week's attendance..."
        : range === "monthToDate"
          ? "Bulk filling attendance through today..."
          : "Bulk filling the whole month..."
    );

    const existingResult = await fetchServiceEntriesInRange(supabase, start, end);

    if (existingResult.error) {
      showError(existingResult.error.message);
      setIsSaving(false);
      return;
    }

    const freshExistingEntries = existingResult.data;
    const recordedDatesByMember = new Map<string, Set<string>>();
    for (const entry of freshExistingEntries) {
      const recordedDates = recordedDatesByMember.get(entry.memberId) ?? new Set<string>();
      recordedDates.add(entry.serviceDate);
      recordedDatesByMember.set(entry.memberId, recordedDates);
    }

    const insertsByMemberDate = new Map<
      string,
      ReturnType<typeof toServiceEntryInsert>
    >();

    for (const member of activeMembers) {
      if (!member.serviceDays) {
        continue;
      }

      const expectedDates = getExpectedServiceDatesInRange(
        start,
        end,
        member.serviceDays,
        recordedDatesByMember.get(member.id) ?? new Set<string>()
      );

      for (const serviceDate of expectedDates) {
        insertsByMemberDate.set(
          `${member.id}:${serviceDate}`,
          toServiceEntryInsert({
            memberId: member.id,
            serviceDate,
            serviceLabel: defaultServiceStatus,
          })
        );
      }
    }

    const inserts = Array.from(insertsByMemberDate.values());

    if (inserts.length === 0) {
      showInfo("Everyone is already up to date for this range.");
      setIsSaving(false);
      return;
    }

    const { error } = await supabase
      .from("service_entries")
      .upsert(inserts, {
        ignoreDuplicates: true,
        onConflict: "member_id,service_date",
      });

    if (error) {
      showError(error.message);
      setIsSaving(false);
      return;
    }

    const [refreshedRangeResult, refreshedMonthResult] = await Promise.all([
      fetchServiceEntriesInRange(supabase, start, end),
      fetchServiceEntriesInRange(supabase, monthRange.start, monthRange.end),
    ]);

    if (refreshedRangeResult.error) {
      showError(refreshedRangeResult.error.message);
      setIsSaving(false);
      return;
    }

    if (refreshedMonthResult.error) {
      showError(refreshedMonthResult.error.message);
      setIsSaving(false);
      return;
    }

    const refreshedRangeEntries = refreshedRangeResult.data;
    const freshExistingKeys = new Set(
      freshExistingEntries.map((entry) => `${entry.memberId}:${entry.serviceDate}`)
    );
    const addedCount = refreshedRangeEntries.filter(
      (entry) => !freshExistingKeys.has(`${entry.memberId}:${entry.serviceDate}`)
    ).length;
    const monthTotal = refreshedMonthResult.data.length;

    setServiceEntries((currentEntries) =>
      replaceServiceEntriesForMonth(currentEntries, calendarMonth, refreshedMonthResult.data)
    );

    await recordAuditEvent({
      action: "services_bulk_filled",
      entityType: "service",
      summary: `Bulk filled ${addedCount} service ${addedCount === 1 ? "entry" : "entries"}.`,
      metadata: {
        range,
        start,
        end,
        added: addedCount,
        month: calendarMonth,
        monthTotal,
      },
    });
    showInfo(
      `Added ${addedCount} service ${
        addedCount === 1 ? "entry" : "entries"
      }. ${monthTotal} recorded in ${formatMonthLabel(calendarMonth)}.`
    );
    setIsSaving(false);
  }

  async function updateServiceEntryStatus(entryId: string, newLabel: string) {
    if (!supabase) {
      return false;
    }

    setIsSaving(true);
    setBusyMessage("Updating service status...");

    const { data, error } = await supabase
      .from("service_entries")
      .update({ service_label: newLabel, updated_at: new Date().toISOString() })
      .eq("id", entryId)
      .select(serviceEntrySelectColumns)
      .single();

    if (error) {
      showError(error.message);
      setIsSaving(false);
      return false;
    }

    const updatedEntry = mapServiceEntryRow(data);
    setServiceEntries((currentEntries) =>
      getCanonicalServiceEntries([
        ...currentEntries.filter((entry) => entry.id !== updatedEntry.id),
        updatedEntry,
      ])
    );
    setIsSaving(false);
    return true;
  }

  async function refreshServiceCalendarMonth(memberId: string, month: string) {
    if (!supabase || !memberId) {
      return;
    }

    setCalendarLoadingMessage("Refreshing this member's calendar...");
    const monthRange = getMonthDateRange(month);
    try {
      const result = await fetchServiceEntriesInRange(
        supabase,
        monthRange.start,
        monthRange.end
      );

      if (result.error) {
        showError(result.error.message);
        return;
      }

      const memberMonthEntries = result.data.filter((entry) => entry.memberId === memberId);

      setServiceEntries((currentEntries) =>
        getCanonicalServiceEntries([
          ...currentEntries.filter(
            (entry) =>
              !(entry.memberId === memberId && entry.serviceDate.startsWith(`${month}-`))
          ),
          ...memberMonthEntries,
        ])
      );
    } finally {
      setCalendarLoadingMessage(null);
    }
  }

  function handleStatusOverrideToggle(serviceDate: string) {
    const overrideKey = getServiceEntryMemberDateKey(serviceForm.memberId, serviceDate);
    const recordedStatus = recordedStatusByDateForMemberMonth.get(serviceDate) ?? "Attended";
    const targetStatus = serviceForm.serviceLabel;

    setDateOverrides((currentOverrides) => {
      if (currentOverrides[overrideKey]?.action !== "remove") {
        return currentOverrides;
      }
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[overrideKey];
      return nextOverrides;
    });

    setStatusOverrides((currentOverrides) => {
      const pending = currentOverrides[overrideKey];

      if (pending === targetStatus) {
        const nextOverrides = { ...currentOverrides };
        delete nextOverrides[overrideKey];
        return nextOverrides;
      }

      if (!pending && targetStatus === recordedStatus) {
        return currentOverrides;
      }

      return { ...currentOverrides, [overrideKey]: targetStatus };
    });
  }

  function cancelStatusOverride(serviceDate: string) {
    const overrideKey = getServiceEntryMemberDateKey(serviceForm.memberId, serviceDate);

    setStatusOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[overrideKey];
      return nextOverrides;
    });
  }

  async function handleEntryStatusChange(entry: ServiceEntry, newLabel: string) {
    if (!newLabel || newLabel === entry.serviceLabel) {
      return;
    }

    const succeeded = await updateServiceEntryStatus(entry.id, newLabel);

    if (succeeded) {
      const member = memberById.get(entry.memberId);
      await recordAuditEvent({
        action: "service_status_updated",
        entityType: "service",
        entityId: entry.id,
        summary: `Changed ${member?.displayName ?? "a member"} on ${entry.serviceDate} to ${newLabel}.`,
        metadata: {
          member: member?.displayName,
          serviceDate: entry.serviceDate,
          from: entry.serviceLabel,
          to: newLabel,
        },
      });
      showInfo(`Set ${entry.serviceDate} to ${newLabel}.`);
    }
  }

  function handleServiceMemberChange(memberId: string) {
    setServiceForm((currentForm) => ({
      ...currentForm,
      memberId,
    }));
    setServiceMemberQuery(memberById.get(memberId)?.displayName ?? "");
    setIsServiceMemberPickerOpen(false);
    setDateOverrides({});
    setStatusOverrides({});
    void refreshServiceCalendarMonth(memberId, calendarMonth);
  }

  function handleCalendarMonthChange(month: string) {
    setCalendarMonth(month);
    setDateOverrides({});
    setStatusOverrides({});
    setServicePage(0);
    void refreshMonthData(month);
    if (serviceForm.memberId) {
      void refreshServiceCalendarMonth(serviceForm.memberId, month);
    }
  }

  function handleSummaryMonthChange(month: string) {
    setSummaryMonth(month);
    setSelectedSummaryDate(getDefaultDateForMonth(month));
    setSummaryAttendeesPage(0);
    void refreshMonthData(month);
  }

  function handleClaimsMonthChange(month: string) {
    setClaimsMonth(month);
    void refreshMonthData(month);
  }

  function handleMemberDetailMonthChange(month: string) {
    setMemberDetailMonth(month);
    void refreshMonthData(month);
  }

  function handleClaimsForMonthChange(nextClaims: Claim[]) {
    setClaims((currentClaims) =>
      replaceClaimsForMonth(currentClaims, claimsMonth, nextClaims)
    );
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
        nextOverrides[getServiceEntryMemberDateKey(serviceForm.memberId, serviceDate)] = {
          action: "add",
          status: serviceForm.serviceLabel,
        };
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
    const overrideKey = getServiceEntryMemberDateKey(serviceForm.memberId, serviceDate);

    setDateOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      const existing = nextOverrides[overrideKey];

      if (isRecorded) {
        if (existing?.action === "remove") {
          delete nextOverrides[overrideKey];
        } else {
          nextOverrides[overrideKey] = { action: "remove" };
        }
      } else if (existing?.action === "add" && existing.status === targetStatus) {
        delete nextOverrides[overrideKey];
      } else {
        nextOverrides[overrideKey] = { action: "add", status: targetStatus };
      }

      return nextOverrides;
    });
  }

  function cancelDateOverride(serviceDate: string) {
    const overrideKey = getServiceEntryMemberDateKey(serviceForm.memberId, serviceDate);

    setDateOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[overrideKey];
      return nextOverrides;
    });
  }

  function removeAllSelectedServiceDates() {
    setDateOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      for (const serviceDate of recordedServiceDatesForMemberMonth) {
        nextOverrides[getServiceEntryMemberDateKey(serviceForm.memberId, serviceDate)] = {
          action: "remove",
        };
      }
      for (const overrideKey of Object.keys(nextOverrides)) {
        const serviceDate = getServiceDateFromMemberDateKey(overrideKey);
        if (
          overrideKey.startsWith(`${serviceForm.memberId}:`) &&
          serviceDate?.startsWith(`${calendarMonth}-`) &&
          nextOverrides[overrideKey]?.action === "add"
        ) {
          delete nextOverrides[overrideKey];
        }
      }
      return nextOverrides;
    });
    setStatusOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      for (const overrideKey of Object.keys(nextOverrides)) {
        const serviceDate = getServiceDateFromMemberDateKey(overrideKey);

        if (
          overrideKey.startsWith(`${serviceForm.memberId}:`) &&
          serviceDate?.startsWith(`${calendarMonth}-`)
        ) {
          delete nextOverrides[overrideKey];
        }
      }
      return nextOverrides;
    });
  }

  function resetAllEdits() {
    setDateOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      for (const overrideKey of Object.keys(nextOverrides)) {
        const serviceDate = getServiceDateFromMemberDateKey(overrideKey);

        if (
          overrideKey.startsWith(`${serviceForm.memberId}:`) &&
          serviceDate?.startsWith(`${calendarMonth}-`)
        ) {
          delete nextOverrides[overrideKey];
        }
      }
      return nextOverrides;
    });
    setStatusOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      for (const overrideKey of Object.keys(nextOverrides)) {
        const serviceDate = getServiceDateFromMemberDateKey(overrideKey);

        if (
          overrideKey.startsWith(`${serviceForm.memberId}:`) &&
          serviceDate?.startsWith(`${calendarMonth}-`)
        ) {
          delete nextOverrides[overrideKey];
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
    const normalizedServiceDays = normalizeServiceDays(cleanedForm.serviceDays);
    const memberPayload = {
      ...cleanedForm,
      serviceDays: normalizedServiceDays,
    };

    if (!cleanedForm.displayName) {
      showError("Member name is required.");
      return;
    }

    if (!cleanedForm.provider) {
      showError("Provider is required.");
      return;
    }

    if (!normalizedServiceDays) {
      showError("Service days are required. Use a format like MTWTHF.");
      return;
    }

    setIsSaving(true);
    setBusyMessage(editingId ? "Updating member..." : "Adding member...");

    if (editingId) {
      const { data, error } = await supabase
        .from("members")
        .update(toMemberUpdate(memberPayload))
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
        if (serviceForm.memberId === updatedMember.id) {
          setServiceMemberQuery(updatedMember.displayName);
          setDateOverrides({});
          setStatusOverrides({});
        }
        resetForm();
        await loadDashboard(updatedMember.id);
        setServiceMemberQuery(updatedMember.displayName);
        setIsServiceMemberPickerOpen(false);
        setDateOverrides({});
        setStatusOverrides({});
        await refreshServiceCalendarMonth(updatedMember.id, calendarMonth);
        await recordAuditEvent({
          action: "member_updated",
          entityType: "member",
          entityId: updatedMember.id,
          summary: `Updated ${updatedMember.displayName}.`,
          metadata: {
            member: updatedMember.displayName,
            provider: updatedMember.provider,
            serviceDays: updatedMember.serviceDays,
          },
        });
        showInfo(`Updated ${updatedMember.displayName}.`);
      }
    } else {
      const { data, error } = await supabase
        .from("members")
        .insert(toMemberInsert(memberPayload))
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
        await loadDashboard();
        await recordAuditEvent({
          action: "member_created",
          entityType: "member",
          entityId: nextMember.id,
          summary: `Added ${nextMember.displayName}.`,
          metadata: {
            member: nextMember.displayName,
            provider: nextMember.provider,
            serviceDays: nextMember.serviceDays,
          },
        });
        showInfo(`Added ${nextMember.displayName}.`);
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

    const incompleteRow = rows.find(
      (row) =>
        !row.displayName.trim() ||
        !row.provider.trim() ||
        !normalizeServiceDays(row.serviceDays)
    );

    if (incompleteRow) {
      showError("Each submitted member needs a name, provider, and service days.");
      return false;
    }

    const inserts = rows.map(toMemberInsert).filter(
      (row) => row.display_name && row.provider && row.service_days
    );

    if (inserts.length === 0) {
      showError("Add at least one complete member.");
      return false;
    }

    setIsSaving(true);
    setBusyMessage(`Adding ${inserts.length} members...`);

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
    await recordAuditEvent({
      action: "members_bulk_created",
      entityType: "member",
      summary: `Added ${nextMembers.length} members.`,
      metadata: {
        count: nextMembers.length,
        members: nextMembers.map((member) => member.displayName),
      },
    });
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
    setBusyMessage("Updating member status...");

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
      await recordAuditEvent({
        action: "member_archived",
        entityType: "member",
        entityId: updatedMember.id,
        summary: `Discontinued ${updatedMember.displayName}.`,
        metadata: {
          member: updatedMember.displayName,
          provider: updatedMember.provider,
        },
      });
      showInfo(`Discontinued ${updatedMember.displayName}.`);
    }

    setIsSaving(false);
  }

  async function unarchiveMember(member: Member) {
    if (!supabase) {
      return;
    }

    setIsSaving(true);
    setBusyMessage("Reinstating member...");

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
      await recordAuditEvent({
        action: "member_reinstated",
        entityType: "member",
        entityId: updatedMember.id,
        summary: `Reinstated ${updatedMember.displayName}.`,
        metadata: {
          member: updatedMember.displayName,
          provider: updatedMember.provider,
        },
      });
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
    setBusyMessage("Confirming password and deleting member...");

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
      await recordAuditEvent({
        action: "member_deleted",
        entityType: "member",
        entityId: deletedMember.id,
        summary: `Deleted ${deletedMember.displayName}.`,
        metadata: {
          member: deletedMember.displayName,
          provider: deletedMember.provider,
          serviceDays: deletedMember.serviceDays,
        },
      });
      showInfo(`Deleted ${deletedMember.displayName}.`);
    }

    setIsSaving(false);
  }

  async function confirmDeleteServiceEntry() {
    if (!supabase || !serviceDeleteTarget) {
      return;
    }

    setIsSaving(true);
    setBusyMessage("Deleting service date...");

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
      setSelectedServiceEntryIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(serviceDeleteTarget.id);
        return nextIds;
      });
      await recordAuditEvent({
        action: "service_deleted",
        entityType: "service",
        entityId: serviceDeleteTarget.id,
        summary: `Deleted service date for ${memberById.get(serviceDeleteTarget.memberId)?.displayName ?? "a member"}.`,
        metadata: {
          member: memberById.get(serviceDeleteTarget.memberId)?.displayName,
          serviceDate: serviceDeleteTarget.serviceDate,
          status: serviceDeleteTarget.serviceLabel,
        },
      });
      showInfo("Deleted service date.");
      setServiceDeleteTarget(null);
    }

    setIsSaving(false);
  }

  function toggleServiceEntrySelection(entryId: string) {
    setSelectedServiceEntryIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(entryId)) {
        nextIds.delete(entryId);
      } else {
        nextIds.add(entryId);
      }

      return nextIds;
    });
  }

  function toggleVisibleServiceSelection() {
    setSelectedServiceEntryIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (areAllVisibleServicesSelected) {
        for (const entry of visibleServiceEntries) {
          nextIds.delete(entry.id);
        }
      } else {
        for (const entry of visibleServiceEntries) {
          nextIds.add(entry.id);
        }
      }

      return nextIds;
    });
  }

  async function confirmBulkDeleteServices() {
    if (!supabase || selectedServiceEntries.length === 0) {
      return;
    }

    const idsToDelete = selectedServiceEntries.map((entry) => entry.id);
    setIsSaving(true);
    setBusyMessage(`Deleting ${idsToDelete.length} service dates...`);

    const { error } = await supabase.from("service_entries").delete().in("id", idsToDelete);

    if (error) {
      showError(error.message);
    } else {
      setServiceEntries((currentEntries) =>
        currentEntries.filter((entry) => !selectedServiceEntryIds.has(entry.id))
      );
      setSelectedServiceEntryIds(new Set());
      setIsBulkServiceDeleteOpen(false);
      await recordAuditEvent({
        action: "services_bulk_deleted",
        entityType: "service",
        summary: `Deleted ${idsToDelete.length} service dates.`,
        metadata: {
          count: idsToDelete.length,
          dates: selectedServiceEntries.map((entry) => entry.serviceDate),
          members: selectedServiceEntries.map(
            (entry) => memberById.get(entry.memberId)?.displayName ?? "Unknown member"
          ),
        },
      });
      showInfo(`Deleted ${idsToDelete.length} service date${idsToDelete.length === 1 ? "" : "s"}.`);
    }

    setIsSaving(false);
  }

  async function confirmResetMonthData() {
    if (!supabase || monthResetConfirmation.trim().toUpperCase() !== "RESET") {
      return;
    }

    const monthRange = getMonthDateRange(calendarMonth);
    const serviceCount = serviceEntriesForCalendarMonth.length;
    const claimCount = claims.filter((claim) =>
      claim.serviceDate.startsWith(`${calendarMonth}-`)
    ).length;

    setIsSaving(true);
    setBusyMessage(`Resetting ${formatMonthLabel(calendarMonth)} services and claims...`);

    const claimsResult = await supabase
      .from("claims")
      .delete()
      .gte("service_date", monthRange.start)
      .lte("service_date", monthRange.end);

    if (claimsResult.error) {
      showError(claimsResult.error.message);
      setIsSaving(false);
      return;
    }

    const servicesResult = await supabase
      .from("service_entries")
      .delete()
      .gte("service_date", monthRange.start)
      .lte("service_date", monthRange.end);

    if (servicesResult.error) {
      showError(servicesResult.error.message);
      setIsSaving(false);
      return;
    }

    const [remainingServicesResult, remainingClaimsResult] = await Promise.all([
      fetchServiceEntriesInRange(supabase, monthRange.start, monthRange.end),
      fetchClaimsInRange(supabase, monthRange.start, monthRange.end),
    ]);

    if (remainingServicesResult.error || remainingClaimsResult.error) {
      showError(
        remainingServicesResult.error?.message ||
          remainingClaimsResult.error?.message ||
          "Could not verify the month reset."
      );
      setIsSaving(false);
      return;
    }

    if (remainingServicesResult.data.length > 0 || remainingClaimsResult.data.length > 0) {
      setServiceEntries((currentEntries) =>
        replaceServiceEntriesForMonth(
          currentEntries,
          calendarMonth,
          remainingServicesResult.data
        )
      );
      setClaims((currentClaims) =>
        replaceClaimsForMonth(currentClaims, calendarMonth, remainingClaimsResult.data)
      );
      showError(
        `Reset did not fully clear ${formatMonthLabel(calendarMonth)}. ${
          remainingServicesResult.data.length
        } service ${remainingServicesResult.data.length === 1 ? "entry remains" : "entries remain"} and ${
          remainingClaimsResult.data.length
        } claim${remainingClaimsResult.data.length === 1 ? " remains" : "s remain"}.`
      );
      setIsSaving(false);
      return;
    }

    setServiceEntries((currentEntries) =>
      replaceServiceEntriesForMonth(currentEntries, calendarMonth, [])
    );
    setClaims((currentClaims) => replaceClaimsForMonth(currentClaims, calendarMonth, []));
    setLoadedDataMonths((currentMonths) => new Set(currentMonths).add(calendarMonth));
    setDateOverrides((currentOverrides) =>
      clearCalendarOverridesForMemberMonth(
        currentOverrides,
        serviceForm.memberId,
        calendarMonth
      )
    );
    setStatusOverrides((currentOverrides) =>
      clearCalendarOverridesForMemberMonth(
        currentOverrides,
        serviceForm.memberId,
        calendarMonth
      )
    );
    setSelectedServiceEntryIds(new Set());
    setIsMonthResetOpen(false);
    setMonthResetConfirmation("");
    await recordAuditEvent({
      action: "month_reset",
      entityType: "service",
      summary: `Reset services and claims for ${formatMonthLabel(calendarMonth)}.`,
      metadata: {
        month: calendarMonth,
        claimsDeleted: claimCount,
        servicesDeleted: serviceCount,
      },
    });
    showInfo(
      `Reset ${formatMonthLabel(calendarMonth)}: deleted ${serviceCount} service ${
        serviceCount === 1 ? "entry" : "entries"
      } and ${claimCount} claim${claimCount === 1 ? "" : "s"}.`
    );
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

  const mfaQrCodeImageUrl = mfaEnrollment
    ? getMfaQrCodeImageUrl(mfaEnrollment.qrCode)
    : "";

  if (isMfaChecking || isMfaChallengeRequired || !hasMfaFactor) {
    const isMfaSetupRequired = !isMfaChecking && !isMfaChallengeRequired && !hasMfaFactor;

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <ThemeToggle className="absolute top-4 right-4" />
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              {isMfaSetupRequired ? "Set up two-factor auth" : "Two-factor check"}
            </CardTitle>
            <CardDescription>
              {isMfaSetupRequired
                ? "Add an authenticator app before opening the dashboard."
                : "Enter the 6-digit code from your authenticator app."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isMfaChecking ? (
              <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon data-icon="inline-start" />
                Checking account security
              </div>
            ) : isMfaSetupRequired ? (
              mfaEnrollment ? (
                <form className="flex flex-col gap-4" onSubmit={verifyMfaEnrollment}>
                  <div className="flex aspect-square items-center justify-center rounded-lg border bg-white p-5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt="Authenticator QR code"
                      className="size-full max-h-64 max-w-64 object-contain"
                      src={mfaQrCodeImageUrl}
                    />
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                    <p className="font-medium">Manual setup key</p>
                    <code className="mt-1 block break-all text-muted-foreground">
                      {mfaEnrollment.secret}
                    </code>
                  </div>
                  <Field label="Authenticator code" htmlFor="mfa-required-code">
                    <Input
                      id="mfa-required-code"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(event) =>
                        setMfaCode(event.target.value.replace(/\D/g, ""))
                      }
                      required
                    />
                  </Field>
                  {mfaError ? (
                    <p className="text-sm text-destructive">{mfaError}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={handleSignOut}
                    >
                      Sign out
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={isSaving || mfaCode.length < 6}
                    >
                      {isSaving ? <Loader2Icon data-icon="inline-start" /> : null}
                      Enable 2FA
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-4">
                  <Alert>
                    <ShieldCheckIcon data-icon="inline-start" />
                    <AlertTitle>Required for access</AlertTitle>
                    <AlertDescription>
                      Once MFA policies are active, the dashboard only opens after a
                      verified authenticator code.
                    </AlertDescription>
                  </Alert>
                  {mfaError ? (
                    <p className="text-sm text-destructive">{mfaError}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={handleSignOut}
                    >
                      Sign out
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={isSaving}
                      onClick={startMfaEnrollment}
                    >
                      {isSaving ? (
                        <Loader2Icon data-icon="inline-start" />
                      ) : (
                        <KeyRoundIcon data-icon="inline-start" />
                      )}
                      Set up 2FA
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <form className="flex flex-col gap-4" onSubmit={verifyMfaChallenge}>
                <Field label="Authenticator code" htmlFor="mfa-code">
                  <Input
                    id="mfa-code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}
                    required
                  />
                </Field>
                {mfaError ? (
                  <p className="text-sm text-destructive">{mfaError}</p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving}
                    onClick={handleSignOut}
                  >
                    Sign out
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={isSaving || mfaCode.length < 6}
                  >
                    {isSaving ? <Loader2Icon data-icon="inline-start" /> : null}
                    Verify
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  const activeBusyMessage =
    isLoading || isSaving || isMonthLoading
      ? busyMessage ?? (isLoading ? "Loading dashboard data..." : "Working...")
      : null;

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

            <Alert className="border-sidebar-border/80 bg-sidebar-accent/55 text-sidebar-accent-foreground shadow-sm">
              <AlertCircleIcon data-icon="inline-start" className="text-sidebar-foreground/70" />
              <AlertTitle className="text-sm">Keep PHI lean</AlertTitle>
              <AlertDescription className="text-xs leading-5 text-sidebar-accent-foreground/65">
                Leave out DOBs, IDs, auths, claim notes, and diagnoses.
              </AlertDescription>
            </Alert>

            <div
              className={cn(
                "rounded-lg border px-3 py-2.5 text-sidebar-accent-foreground shadow-sm",
                hasMfaFactor
                  ? "border-emerald-400/30 bg-emerald-400/10"
                  : "bg-sidebar-accent/55"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md border",
                      hasMfaFactor
                        ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                        : "border-sidebar-border bg-sidebar-accent text-sidebar-foreground/70"
                    )}
                  >
                    <ShieldCheckIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {hasMfaFactor ? "2FA On" : "2FA Off"}
                    </p>
                    <p className="truncate text-xs text-sidebar-accent-foreground/65">
                      {hasMfaFactor ? "Authenticator protected" : "Set up before enforcing"}
                    </p>
                  </div>
                </div>
                <Badge
                  className={cn(
                    "shrink-0 border",
                    hasMfaFactor
                      ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-100"
                      : "border-sidebar-border bg-transparent text-sidebar-foreground/70"
                  )}
                  variant="outline"
                >
                  {hasMfaFactor ? "Protected" : "Setup"}
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "mt-2 h-7 w-full border-sidebar-border bg-transparent text-xs text-sidebar-foreground hover:bg-sidebar-accent/80",
                  hasMfaFactor &&
                    "border-emerald-300/30 text-emerald-50 hover:bg-emerald-300/10"
                )}
                disabled={isSaving}
                onClick={startMfaEnrollment}
              >
                <KeyRoundIcon data-icon="inline-start" />
                {hasMfaFactor ? "Add backup factor" : "Set up 2FA"}
              </Button>
            </div>

            {visibleSecurityEvent ? (
              <Alert className="border-amber-300/35 bg-amber-300/10 text-sidebar-foreground shadow-sm ring-1 ring-amber-300/10">
                <BellIcon data-icon="inline-start" className="text-amber-200" />
                <AlertTitle className="flex items-center justify-between gap-2 text-sm text-amber-50">
                  Login warning
                  <Badge className="bg-amber-200/15 text-amber-50" variant="outline">
                    1 alert
                  </Badge>
                </AlertTitle>
                <AlertDescription className="text-xs leading-5 text-sidebar-foreground/75">
                  {visibleSecurityEvent.attemptedEmail || "Unknown email"} hit{" "}
                  {visibleSecurityEvent.attemptCount} failed attempts at{" "}
                  {latestSecurityEventTime}.
                </AlertDescription>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 h-8 border-amber-300/35 bg-transparent text-amber-50 hover:bg-amber-300/15"
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
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  activeView === "audit" &&
                  "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                onClick={() => {
                  setActiveView("audit");
                  setIsMobileNavOpen(false);
                }}
              >
                <HistoryIcon data-icon="inline-start" />
                Audit
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
                        : activeView === "audit"
                          ? "Recent system activity"
                          : activeView === "services"
                            ? `${serviceEntriesForCalendarMonth.length} recorded`
                            : activeView === "claims"
                              ? `${claimsForClaimsMonth.length} claims this month`
                              : `${activeMembers.length} total`}
                </p>
              </div>
            </header>

            {activeBusyMessage ? (
              <LoadingStatus message={activeBusyMessage} />
            ) : null}

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
            ) : activeView === "audit" ? (
              <AuditLog />
            ) : activeView === "claims" ? (
              <ClaimsDashboard
                claims={claimsForClaimsMonth}
                isLoading={isClaimsMonthLoading}
                memberById={memberById}
                members={activeMembers}
                month={claimsMonth}
                onAudit={recordAuditEvent}
                onClaimsChange={handleClaimsForMonthChange}
                onMonthChange={handleClaimsMonthChange}
                onMonthDataRefresh={refreshMonthData}
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
                onMonthChange={handleMemberDetailMonthChange}
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
	                    <Button
	                      type="button"
	                      variant="destructive"
	                      disabled={isSaving}
	                      onClick={() => {
	                        setMonthResetConfirmation("");
	                        setIsMonthResetOpen(true);
	                      }}
	                    >
	                      <Trash2Icon data-icon="inline-start" />
	                      Reset month
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
                        <div className="relative">
                          <Input
                            id="service-member"
                            autoComplete="off"
                            className="pr-9"
                            placeholder={
                              selectedServiceMember?.displayName ?? "Search member name"
                            }
                            value={serviceMemberQuery}
                            onBlur={() => {
                              window.setTimeout(
                                () => setIsServiceMemberPickerOpen(false),
                                120
                              );
                            }}
                            onChange={(event) => {
                              const nextQuery = event.target.value;
                              setServiceMemberQuery(nextQuery);
                              setIsServiceMemberPickerOpen(true);
                              if (
                                serviceForm.memberId &&
                                nextQuery !== selectedServiceMember?.displayName
                              ) {
                                setServiceForm((currentForm) => ({
                                  ...currentForm,
                                  memberId: "",
                                }));
                                setDateOverrides({});
                                setStatusOverrides({});
                              }
                            }}
                            onFocus={() => setIsServiceMemberPickerOpen(true)}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                filteredServiceMembers[0]
                              ) {
                                event.preventDefault();
                                handleServiceMemberChange(filteredServiceMembers[0].id);
                              } else if (event.key === "Escape") {
                                setIsServiceMemberPickerOpen(false);
                              }
                            }}
                          />
                          {serviceMemberQuery || serviceForm.memberId ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Clear selected member"
                              className="absolute top-0.5 right-1 size-7"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setServiceForm((currentForm) => ({
                                  ...currentForm,
                                  memberId: "",
                                }));
                                setServiceMemberQuery("");
                                setIsServiceMemberPickerOpen(true);
                                setDateOverrides({});
                                setStatusOverrides({});
                              }}
                            >
                              <XIcon />
                            </Button>
                          ) : null}
                          {isServiceMemberPickerOpen &&
                          (serviceMemberQuery.trim() || !serviceForm.memberId) ? (
                            <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md dark:border-white/10">
                              {filteredServiceMembers.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  No matching members
                                </div>
                              ) : (
                                filteredServiceMembers.map((member) => (
                                  <button
                                    key={member.id}
                                    type="button"
                                    className={cn(
                                      "flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted dark:border-white/10 dark:hover:bg-white/[0.06]",
                                      serviceForm.memberId === member.id && "bg-muted"
                                    )}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleServiceMemberChange(member.id)}
                                  >
                                    <span className="truncate font-medium">
                                      {member.displayName}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                      {member.provider
                                        ? getProviderLabel(member.provider)
                                        : member.serviceDays || "No days"}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          ) : null}
                        </div>
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
                        <div className="relative">
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
                          {calendarLoadingMessage ? (
                            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/65 backdrop-blur-[1px]">
                              <LoadingStatus
                                message={calendarLoadingMessage}
                                compact
                              />
                            </div>
                          ) : null}
                        </div>
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
                            !serviceForm.memberId ||
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
                    <CardTitle>Recently updated services</CardTitle>
                    <CardDescription>
                      Latest service changes by member, date, and status.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2Icon data-icon="inline-start" />
                        Loading updates
                      </div>
                    ) : recentlyUpdatedServiceEntries.length === 0 ? (
                      <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed px-3 text-sm text-muted-foreground">
                        No service updates yet
                      </div>
                    ) : (
                      <div className="divide-y rounded-lg border">
                        {recentlyUpdatedServiceEntries.map((entry) => {
                          const member = memberById.get(entry.memberId);
                          const statusStyle = getServiceStatusStyle(entry.serviceLabel);

                          return (
                            <div
                              key={`updated-${entry.id}`}
                              className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {member?.displayName ?? "Unknown member"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(
                                    `${entry.serviceDate}T00:00:00`
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                <Badge
                                  className="gap-1.5"
                                  variant="outline"
                                >
                                  <span
                                    className={cn(
                                      "size-2 shrink-0 rounded-full",
                                      statusStyle.dot
                                    )}
                                  />
                                  {entry.serviceLabel}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatServiceEntryUpdatedAt(entry)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent services</CardTitle>
                    <CardDescription>
                      Latest service entries from the shared log.
                    </CardDescription>
                    <CardAction className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isSaving || selectedServiceEntries.length === 0}
                        onClick={() => setIsBulkServiceDeleteOpen(true)}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        Delete selected ({selectedServiceEntries.length})
                      </Button>
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
                    ) : serviceEntriesForCalendarMonth.length === 0 ? (
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
                            <TableHead className="w-10">
                              <input
                                aria-label="Select visible service entries"
                                checked={areAllVisibleServicesSelected}
                                className="size-4 rounded border-input accent-primary"
                                type="checkbox"
                                onChange={toggleVisibleServiceSelection}
                              />
                            </TableHead>
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
                                <TableCell>
                                  <input
                                    aria-label={`Select service for ${member?.displayName ?? "unknown member"} on ${entry.serviceDate}`}
                                    checked={selectedServiceEntryIds.has(entry.id)}
                                    className="size-4 rounded border-input accent-primary"
                                    type="checkbox"
                                    onChange={() => toggleServiceEntrySelection(entry.id)}
                                  />
                                </TableCell>
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
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                          <Input
                            aria-label="Search members"
                            className="sm:w-72"
                            placeholder="Search for name"
                            value={query}
                            onChange={(event) => {
                              setQuery(event.target.value);
                              setDirectoryPage(0);
                            }}
                          />
                          <div className="grid min-w-0 grid-cols-2 gap-2 sm:w-[22rem]">
                            <Select
                              value={directorySortField}
                              onValueChange={(value) => {
                                setDirectorySortField(value as DirectorySortField);
                                setDirectoryPage(0);
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <span className="truncate text-left">
                                  {directorySortField === "displayName"
                                    ? "Member name"
                                    : directorySortField === "provider"
                                      ? "Provider"
                                      : "Updated date"}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="displayName">
                                    Member name
                                  </SelectItem>
                                  <SelectItem value="provider">Provider</SelectItem>
                                  <SelectItem value="updatedAt">Updated date</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <Select
                              value={directorySortDirection}
                              onValueChange={(value) => {
                                setDirectorySortDirection(value as SortDirection);
                                setDirectoryPage(0);
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <span className="truncate text-left">
                                  {directorySortDirection === "asc" ? "Asc" : "Desc"}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="asc">Asc</SelectItem>
                                  <SelectItem value="desc">Desc</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {filteredMembers.length} found
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
                          <div className="flex items-center gap-2">
                            <Input
                              aria-label="Bulk add row count"
                              className="h-8 w-16"
                              min={1}
                              max={25}
                              type="number"
                              value={bulkAddRowCount}
                              onChange={(event) =>
                                setBulkAddRowCount(
                                  Math.max(
                                    1,
                                    Math.min(25, Number(event.target.value) || 1)
                                  )
                                )
                              }
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsBulkAddOpen(true)}
                            >
                              <UsersIcon data-icon="inline-start" />
                              Add multiple
                            </Button>
                          </div>
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
                            required
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
                            required
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
        open={isBulkServiceDeleteOpen}
        onOpenChange={setIsBulkServiceDeleteOpen}
      >
        <AlertDialogContent className="gap-5">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected services?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {selectedServiceEntries.length} selected service{" "}
              {selectedServiceEntries.length === 1 ? "entry" : "entries"}. Member records
              stay active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-48 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm">
            {selectedServiceEntries.slice(0, 8).map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 py-1"
              >
                <span className="truncate">
                  {memberById.get(entry.memberId)?.displayName ?? "Unknown member"}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(`${entry.serviceDate}T00:00:00`).toLocaleDateString()}
                </span>
              </div>
            ))}
            {selectedServiceEntries.length > 8 ? (
              <p className="pt-2 text-xs text-muted-foreground">
                + {selectedServiceEntries.length - 8} more
              </p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep services</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmBulkDeleteServices}
              disabled={isSaving || selectedServiceEntries.length === 0}
            >
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isMonthResetOpen}
        onOpenChange={(open) => {
          setIsMonthResetOpen(open);
          if (!open) {
            setMonthResetConfirmation("");
          }
        }}
      >
        <AlertDialogContent className="gap-5">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this month?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes all services and claims for {formatMonthLabel(calendarMonth)}.
              Members stay active, but the month&apos;s attendance and claim queue will be empty.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Services</span>
              <span className="font-medium">{serviceEntriesForCalendarMonth.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Claims</span>
              <span className="font-medium">
                {
                  claims.filter((claim) =>
                    claim.serviceDate.startsWith(`${calendarMonth}-`)
                  ).length
                }
              </span>
            </div>
            <Field label='Type "RESET" to confirm' htmlFor="month-reset-confirmation">
              <Input
                id="month-reset-confirmation"
                autoComplete="off"
                value={monthResetConfirmation}
                onChange={(event) => setMonthResetConfirmation(event.target.value)}
              />
            </Field>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep month</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmResetMonthData}
              disabled={
                isSaving || monthResetConfirmation.trim().toUpperCase() !== "RESET"
              }
            >
              Reset month
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
        key={bulkAddRowCount}
        initialRowCount={bulkAddRowCount}
        isSaving={isSaving}
        onOpenChange={setIsBulkAddOpen}
        onSubmit={handleBulkAddMembers}
        open={isBulkAddOpen}
      />

      <Dialog
        open={isMfaEnrollOpen}
        onOpenChange={(open) => {
          setIsMfaEnrollOpen(open);
          if (!open) {
            setMfaEnrollment(null);
            setMfaCode("");
            setMfaError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set up two-factor auth</DialogTitle>
            <DialogDescription>
              Scan the QR code with an authenticator app, then enter the 6-digit code.
            </DialogDescription>
          </DialogHeader>
          {mfaEnrollment ? (
            <form className="flex flex-col gap-4" onSubmit={verifyMfaEnrollment}>
              <div className="flex aspect-square items-center justify-center rounded-lg border bg-white p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Authenticator QR code"
                  className="size-full max-h-64 max-w-64 object-contain"
                  src={mfaQrCodeImageUrl}
                />
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                <p className="font-medium">Manual setup key</p>
                <code className="mt-1 block break-all text-muted-foreground">
                  {mfaEnrollment.secret}
                </code>
              </div>
              <Field label="Authenticator code" htmlFor="mfa-enroll-code">
                <Input
                  id="mfa-enroll-code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}
                  required
                />
              </Field>
              {mfaError ? (
                <p className="text-sm text-destructive">{mfaError}</p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => setIsMfaEnrollOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || mfaCode.length < 6}>
                  {isSaving ? <Loader2Icon data-icon="inline-start" /> : null}
                  Enable 2FA
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
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

function getMfaQrCodeImageUrl(qrCode: string) {
  if (qrCode.startsWith("data:image/")) {
    return qrCode;
  }

  return `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`;
}

function getServiceEntryMemberDateKey(memberId: string, serviceDate: string) {
  return `${memberId}:${serviceDate}`;
}

function getServiceDateFromMemberDateKey(key: string) {
  const [, serviceDate] = key.split(":");
  return serviceDate || "";
}

function clearCalendarOverridesForMemberMonth<T>(
  overrides: Record<string, T>,
  memberId: string,
  month: string
) {
  const nextOverrides = { ...overrides };

  for (const overrideKey of Object.keys(nextOverrides)) {
    const serviceDate = getServiceDateFromMemberDateKey(overrideKey);

    if (
      overrideKey.startsWith(`${memberId}:`) &&
      serviceDate.startsWith(`${month}-`)
    ) {
      delete nextOverrides[overrideKey];
    }
  }

  return nextOverrides;
}

function getServiceEntryUpdatedAt(entry: ServiceEntry) {
  return entry.updatedAt || entry.createdAt;
}

function formatServiceEntryUpdatedAt(entry: ServiceEntry) {
  return new Date(getServiceEntryUpdatedAt(entry)).toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getCanonicalServiceEntries(entries: ServiceEntry[]) {
  const entriesByMemberDate = new Map<string, ServiceEntry>();

  for (const entry of entries) {
    const key = getServiceEntryMemberDateKey(entry.memberId, entry.serviceDate);
    const existingEntry = entriesByMemberDate.get(key);

    if (!existingEntry || getServiceEntryUpdatedAt(existingEntry) <= getServiceEntryUpdatedAt(entry)) {
      entriesByMemberDate.set(key, entry);
    }
  }

  return Array.from(entriesByMemberDate.values()).sort((left, right) => {
    const dateSort = right.serviceDate.localeCompare(left.serviceDate);
    const createdAtSort = right.createdAt.localeCompare(left.createdAt);

    return dateSort || createdAtSort || right.id.localeCompare(left.id);
  });
}

function replaceServiceEntriesForMonth(
  currentEntries: ServiceEntry[],
  month: string,
  nextEntries: ServiceEntry[]
) {
  return getCanonicalServiceEntries([
    ...currentEntries.filter((entry) => !entry.serviceDate.startsWith(`${month}-`)),
    ...nextEntries,
  ]);
}

function replaceClaimsForMonth(
  currentClaims: Claim[],
  month: string,
  nextClaims: Claim[]
) {
  return getCanonicalClaims([
    ...currentClaims.filter((claim) => !claim.serviceDate.startsWith(`${month}-`)),
    ...nextClaims,
  ]);
}

function getCanonicalClaims(claims: Claim[]) {
  const claimsById = new Map<string, Claim>();

  for (const claim of claims) {
    const existingClaim = claimsById.get(claim.id);

    if (!existingClaim || existingClaim.updatedAt <= claim.updatedAt) {
      claimsById.set(claim.id, claim);
    }
  }

  return Array.from(claimsById.values()).sort((left, right) => {
    const dateSort = right.serviceDate.localeCompare(left.serviceDate);

    return dateSort || right.id.localeCompare(left.id);
  });
}

function formatMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });
}

async function reconcileSafeClaimsForServiceChanges(
  supabaseClient: SupabaseClient,
  memberId: string,
  month: string,
  datesToCreate: Array<{ serviceDate: string; status: string }>,
  entriesToDelete: ServiceEntry[],
  statusChangesToApply: Array<{ entry: ServiceEntry; status: string }>
) {
  const staleClaimDates = new Set<string>();
  const requiredClaimDates = new Set<string>();

  for (const entry of entriesToDelete) {
    staleClaimDates.add(entry.serviceDate);
  }

  for (const { entry, status } of statusChangesToApply) {
    if (status.toLowerCase() === "attended") {
      requiredClaimDates.add(entry.serviceDate);
    } else {
      staleClaimDates.add(entry.serviceDate);
    }
  }

  for (const { serviceDate, status } of datesToCreate) {
    if (status.toLowerCase() === "attended") {
      requiredClaimDates.add(serviceDate);
    }
  }

  for (const serviceDate of staleClaimDates) {
    requiredClaimDates.delete(serviceDate);
  }

  const staleDates = Array.from(staleClaimDates);
  const requiredDates = Array.from(requiredClaimDates);
  const deleteResult =
    staleDates.length > 0
      ? await supabaseClient
        .from("claims")
        .delete()
        .eq("member_id", memberId)
        .in("service_date", staleDates)
        .in("status", ["Required", "Pending"])
      : { error: null };

  if (deleteResult.error) {
    return {
      claims: [] as Claim[],
      created: 0,
      error: deleteResult.error.message,
      removed: 0,
    };
  }

  const insertResult =
    requiredDates.length > 0
      ? await supabaseClient
        .from("claims")
        .upsert(
          requiredDates.map((serviceDate) =>
            toClaimInsert({
              memberId,
              serviceDate,
              status: "Required",
              lastFailureReason: "",
            })
          ),
          { ignoreDuplicates: true, onConflict: "member_id,service_date" }
        )
      : { error: null };

  if (insertResult.error) {
    return {
      claims: [] as Claim[],
      created: 0,
      error: insertResult.error.message,
      removed: 0,
    };
  }

  const monthRange = getMonthDateRange(month);
  const claimsResult = await fetchClaimsInRange(
    supabaseClient,
    monthRange.start,
    monthRange.end
  );

  return {
    claims: claimsResult.data,
    created: requiredDates.length,
    error: claimsResult.error?.message ?? null,
    removed: staleDates.length,
  };
}

function getServiceSaveVerificationError(
  refreshedEntries: ServiceEntry[],
  memberId: string,
  datesToCreate: Array<{ serviceDate: string; status: string }>,
  entriesToDelete: ServiceEntry[],
  statusChangesToApply: Array<{ entry: ServiceEntry; status: string }>
) {
  const refreshedEntryByDate = new Map(
    refreshedEntries
      .filter((entry) => entry.memberId === memberId)
      .map((entry) => [entry.serviceDate, entry])
  );
  const failedAdds = datesToCreate.filter((item) => {
    const refreshedEntry = refreshedEntryByDate.get(item.serviceDate);
    return !refreshedEntry || refreshedEntry.serviceLabel !== item.status;
  });
  const failedDeletes = entriesToDelete.filter((entry) =>
    refreshedEntryByDate.has(entry.serviceDate)
  );
  const failedStatusChanges = statusChangesToApply.filter(({ entry, status }) => {
    const refreshedEntry = refreshedEntryByDate.get(entry.serviceDate);
    return !refreshedEntry || refreshedEntry.serviceLabel !== status;
  });

  if (
    failedAdds.length === 0 &&
    failedDeletes.length === 0 &&
    failedStatusChanges.length === 0
  ) {
    return null;
  }

  const failedDates = [
    ...failedAdds.map((item) => item.serviceDate),
    ...failedDeletes.map((entry) => entry.serviceDate),
    ...failedStatusChanges.map(({ entry }) => entry.serviceDate),
  ];

  return `Some service dates did not save after refresh: ${failedDates.slice(0, 5).join(", ")}${
    failedDates.length > 5 ? ` and ${failedDates.length - 5} more` : ""
  }.`;
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

function LoadingStatus({
  compact = false,
  message,
}: {
  compact?: boolean;
  message: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card/95 text-card-foreground shadow-sm",
        compact ? "w-fit min-w-64" : "w-full"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-3 py-2 text-sm">
        <Loader2Icon className="size-4 animate-spin text-primary" />
        <span className="font-medium">{message}</span>
      </div>
      <div className="h-1 overflow-hidden bg-muted">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/70" />
      </div>
    </div>
  );
}

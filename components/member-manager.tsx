"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AlertCircleIcon,
  BarChart3Icon,
  CalendarCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  LogOutIcon,
  MenuIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";

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
import {
  ServiceEntry,
  ServiceEntryFormValues,
  createEmptyServiceEntryForm,
  getTodayDate,
  mapServiceEntryRow,
  toServiceEntryInsert,
} from "@/lib/service-store";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { Field } from "@/components/form-field";
import { NewMembersCard } from "@/components/new-members-card";
import { ServiceCalendar } from "@/components/service-calendar";
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
  getCalendarSelectionForMonth,
  getDefaultDateForMonth,
  getExpectedCalendarSelectionForMonth,
  getExpectedMembersByDate,
  getExpectedServiceDatesForMonth,
  getMonthInputValue,
  getSummaryStats,
  isDateInCurrentMonth,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";

type AuthForm = {
  email: string;
  password: string;
};

type ActiveView = "members" | "summary";

const emptyAuthForm: AuthForm = {
  email: "",
  password: "",
};

const memberActivityPageSize = 10;
const servicePageSizeOptions = [10, 25, 50, 100];
const summaryAttendeesPageSize = 10;

export function MemberManager() {
  const memberFormCardRef = useRef<HTMLDivElement>(null);
  const memberNameInputRef = useRef<HTMLInputElement>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [serviceEntries, setServiceEntries] = useState<ServiceEntry[]>([]);
  const [form, setForm] = useState<MemberFormValues>(emptyMemberForm);
  const [serviceForm, setServiceForm] = useState<ServiceEntryFormValues>(
    createEmptyServiceEntryForm
  );
  const [calendarMonth, setCalendarMonth] = useState(getMonthInputValue());
  const [summaryMonth, setSummaryMonth] = useState(getMonthInputValue());
  const [selectedSummaryDate, setSelectedSummaryDate] = useState(getTodayDate());
  const [summaryAttendeesPage, setSummaryAttendeesPage] = useState(0);
  const [newMembersPage, setNewMembersPage] = useState(0);
  const [updatedMembersPage, setUpdatedMembersPage] = useState(0);
  const [servicePage, setServicePage] = useState(0);
  const [servicePageSize, setServicePageSize] = useState(10);
  const [selectedServiceDates, setSelectedServiceDates] = useState<string[]>([
    getTodayDate(),
  ]);
  const [authForm, setAuthForm] = useState<AuthForm>(emptyAuthForm);
  const [session, setSession] = useState<Session | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("members");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteAuthError, setDeleteAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(hasSupabaseConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "info">("error");

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

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return members;
    }

    return members.filter((member) =>
      [member.displayName, member.provider, member.serviceDays]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [members, query]);

  const providerCount = useMemo(
    () => new Set(members.map((member) => member.provider).filter(Boolean)).size,
    [members]
  );

  const membersJoinedThisMonth = useMemo(
    () =>
      [...members]
        .filter((member) => isDateInCurrentMonth(member.createdAt))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [members]
  );

  const membersUpdatedThisMonth = useMemo(
    () =>
      [...members]
        .filter(
          (member) =>
            member.updatedAt !== member.createdAt &&
            isDateInCurrentMonth(member.updatedAt) &&
            !isDateInCurrentMonth(member.createdAt)
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [members]
  );

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members]
  );

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

  const newSelectedServiceDates = useMemo(
    () =>
      Array.from(new Set(selectedServiceDates)).filter(
        (serviceDate) => !recordedServiceDatesForMember.has(serviceDate)
      ),
    [recordedServiceDatesForMember, selectedServiceDates]
  );

  const removedSelectedServiceDates = useMemo(
    () =>
      recordedServiceEntriesForMemberMonth.filter(
        (entry) => !selectedServiceDates.includes(entry.serviceDate)
      ),
    [recordedServiceEntriesForMemberMonth, selectedServiceDates]
  );

  const serviceChangeCount =
    newSelectedServiceDates.length + removedSelectedServiceDates.length;
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
    () => getExpectedMembersByDate(summaryMonth, members, getTodayDate()),
    [members, summaryMonth]
  );
  const selectedSummaryExpectedMembers =
    summaryExpectedMembersByDate.get(selectedSummaryDate) ?? [];
  const isSelectedSummaryDateFuture = selectedSummaryDate > getTodayDate();
  const selectedSummaryRowCount = isSelectedSummaryDateFuture
    ? selectedSummaryExpectedMembers.length
    : selectedSummaryEntries.length;
  const summaryAttendeesPageCount = Math.max(
    1,
    Math.ceil(selectedSummaryRowCount / summaryAttendeesPageSize)
  );
  const safeSummaryAttendeesPage = Math.min(
    summaryAttendeesPage,
    summaryAttendeesPageCount - 1
  );
  const visibleSummaryEntries = selectedSummaryEntries.slice(
    safeSummaryAttendeesPage * summaryAttendeesPageSize,
    safeSummaryAttendeesPage * summaryAttendeesPageSize + summaryAttendeesPageSize
  );
  const visibleSummaryExpectedMembers = selectedSummaryExpectedMembers.slice(
    safeSummaryAttendeesPage * summaryAttendeesPageSize,
    safeSummaryAttendeesPage * summaryAttendeesPageSize + summaryAttendeesPageSize
  );
  const summaryStats = useMemo(
    () => getSummaryStats(summaryEntriesForMonth, members.length),
    [members.length, summaryEntriesForMonth]
  );

  function showError(nextMessage: string) {
    setMessageKind("error");
    setMessage(nextMessage);
  }

  function showInfo(nextMessage: string) {
    setMessageKind("info");
    setMessage(nextMessage);
  }

  async function loadDashboard() {
    if (!supabase) {
      return;
    }

    setMessage(null);
    setIsLoading(true);

    const membersRequest = supabase
      .from("members")
      .select("id, display_name, provider, service_days, created_at, updated_at")
      .order("display_name", { ascending: true });

    const servicesRequest = supabase
      .from("service_entries")
      .select("id, member_id, service_date, service_label, created_at")
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false });

    const [membersResult, servicesResult] = await Promise.all([
      membersRequest,
      servicesRequest,
    ]);

    if (membersResult.error) {
      showError(membersResult.error.message);
    } else {
      const nextMembers = membersResult.data.map(mapMemberRow);
      setMembers(nextMembers);
      const nextServices = servicesResult.data?.map(mapServiceEntryRow) ?? [];
      const nextMemberId = serviceForm.memberId || nextMembers[0]?.id || "";
      const nextMember = nextMembers.find((member) => member.id === nextMemberId);
      const recordedDates = new Set(
        nextServices
          .filter((entry) => entry.memberId === nextMemberId)
          .map((entry) => entry.serviceDate)
      );
      setServiceForm((currentForm) => ({
        ...currentForm,
        memberId: currentForm.memberId || nextMemberId,
      }));
      setSelectedServiceDates(
        getCalendarSelectionForMonth(
          calendarMonth,
          nextMember?.serviceDays ?? "",
          recordedDates
        )
      );
    }

    if (servicesResult.error) {
      showError(servicesResult.error.message);
    } else {
      setServiceEntries(servicesResult.data.map(mapServiceEntryRow));
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

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    setMessage(null);
    setIsSaving(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: authForm.email.trim(),
      password: authForm.password,
    });

    if (error) {
      showError(error.message);
    } else {
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

    setMessage(null);

    const serviceDatesToCreate = Array.from(new Set(selectedServiceDates)).filter(
      (serviceDate) => !recordedServiceDatesForMember.has(serviceDate)
    );
    const serviceIdsToDelete = removedSelectedServiceDates.map((entry) => entry.id);

    if (serviceDatesToCreate.length === 0 && serviceIdsToDelete.length === 0) {
      showInfo("No service date changes to save for this month.");
      return;
    }

    setIsSaving(true);

    const deleteResult =
      serviceIdsToDelete.length > 0
        ? await supabase.from("service_entries").delete().in("id", serviceIdsToDelete)
        : { error: null };

    const insertResult =
      serviceDatesToCreate.length > 0
        ? await supabase
          .from("service_entries")
          .insert(
            serviceDatesToCreate.map((serviceDate) =>
              toServiceEntryInsert({ ...serviceForm, serviceDate })
            )
          )
          .select("id, member_id, service_date, service_label, created_at")
          .order("service_date", { ascending: false })
          .order("created_at", { ascending: false })
        : { data: [], error: null };

    if (deleteResult.error || insertResult.error) {
      showError(deleteResult.error?.message || insertResult.error?.message || "Service dates could not be saved.");
    } else {
      const nextEntries = insertResult.data.map(mapServiceEntryRow);
      setServiceEntries((currentEntries) =>
        [
          ...nextEntries,
          ...currentEntries.filter((entry) => !serviceIdsToDelete.includes(entry.id)),
        ].sort((left, right) => {
          const dateSort = right.serviceDate.localeCompare(left.serviceDate);
          return dateSort || right.createdAt.localeCompare(left.createdAt);
        })
      );
      showInfo("Service dates saved.");
    }

    setIsSaving(false);
  }

  function handleServiceMemberChange(memberId: string) {
    const member = memberById.get(memberId);
    const recordedDates = new Set(
      serviceEntries
        .filter((entry) => entry.memberId === memberId)
        .map((entry) => entry.serviceDate)
    );

    setServiceForm((currentForm) => ({
      ...currentForm,
      memberId,
    }));
    setSelectedServiceDates(
      getCalendarSelectionForMonth(
        calendarMonth,
        member?.serviceDays ?? "",
        recordedDates
      )
    );
  }

  function handleCalendarMonthChange(month: string) {
    setCalendarMonth(month);
    setSelectedServiceDates(
      getCalendarSelectionForMonth(
        month,
        selectedServiceMember?.serviceDays ?? "",
        recordedServiceDatesForMember
      )
    );
  }

  function handleSummaryMonthChange(month: string) {
    setSummaryMonth(month);
    setSelectedSummaryDate(getDefaultDateForMonth(month));
    setSummaryAttendeesPage(0);
  }

  function resetExpectedServiceDates() {
    const nextDates = getExpectedCalendarSelectionForMonth(
      calendarMonth,
      selectedServiceMember?.serviceDays ?? "",
      recordedServiceDatesForMember
    );
    setSelectedServiceDates(nextDates);
    showInfo(
      nextDates.length > 0
        ? `Loaded ${nextDates.length} expected/recorded service dates for this month.`
        : "No expected service dates found. Check this member's Service days field."
    );
  }

  function toggleSelectedServiceDate(serviceDate: string) {
    setSelectedServiceDates((currentDates) =>
      currentDates.includes(serviceDate)
        ? currentDates.filter((currentDate) => currentDate !== serviceDate)
        : [...currentDates, serviceDate].sort()
    );
  }

  function removeSelectedServiceDate(serviceDate: string) {
    setSelectedServiceDates((currentDates) =>
      currentDates.filter((currentDate) => currentDate !== serviceDate)
    );
  }

  function removeAllSelectedServiceDates() {
    setSelectedServiceDates([]);
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

    setMessage(null);
    setIsSaving(true);

    if (editingId) {
      const { data, error } = await supabase
        .from("members")
        .update(toMemberUpdate(cleanedForm))
        .eq("id", editingId)
        .select("id, display_name, provider, service_days, created_at, updated_at")
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
        if (editingId === serviceForm.memberId) {
          setSelectedServiceDates(
            getCalendarSelectionForMonth(
              calendarMonth,
              updatedMember.serviceDays,
              recordedServiceDatesForMember
            )
          );
        }
        resetForm();
      }
    } else {
      const { data, error } = await supabase
        .from("members")
        .insert(toMemberInsert(cleanedForm))
        .select("id, display_name, provider, service_days, created_at, updated_at")
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
        if (!serviceForm.memberId) {
          setSelectedServiceDates(
            getCalendarSelectionForMonth(
              calendarMonth,
              nextMember.serviceDays,
              new Set()
            )
          );
        }
        resetForm();
      }
    }

    setIsSaving(false);
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

  async function confirmDelete() {
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

    setMessage(null);
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

    const { error } = await supabase
      .from("members")
      .delete()
      .eq("id", deleteTarget.id);

    if (error) {
      showError(error.message);
    } else {
      setMembers((currentMembers) =>
        currentMembers.filter((member) => member.id !== deleteTarget.id)
      );
      setServiceEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.memberId !== deleteTarget.id)
      );

      if (editingId === deleteTarget.id) {
        resetForm();
      }

      if (serviceForm.memberId === deleteTarget.id) {
        setServiceForm((currentForm) => ({
          ...currentForm,
          memberId: members.find((member) => member.id !== deleteTarget.id)?.id || "",
        }));
      }

      setDeleteTarget(null);
      setDeletePassword("");
      setDeleteAuthError(null);
    }

    setIsSaving(false);
  }

  async function deleteServiceEntry(entryId: string) {
    if (!supabase) {
      return;
    }

    setMessage(null);
    setIsSaving(true);

    const { error } = await supabase.from("service_entries").delete().eq("id", entryId);

    if (error) {
      showError(error.message);
    } else {
      setServiceEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.id !== entryId)
      );
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
              {message ? (
                <Alert variant="destructive">
                  <AlertCircleIcon data-icon="inline-start" />
                  <AlertTitle>Sign in failed</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}

              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  autoComplete="email"
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
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm({ ...authForm, password: event.target.value })
                  }
                  required
                />
              </Field>

              <Button type="submit" disabled={isSaving || isLoading}>
                {isSaving || isLoading ? <Loader2Icon data-icon="inline-start" /> : null}
                Sign in
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
                {activeView === "summary" ? "Summary" : "Members"}
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
              <Metric label="Members" value={members.length} />
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
                  {activeView === "summary" ? "Summary" : "Members"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isLoading
                    ? "Loading..."
                    : activeView === "summary"
                      ? `${summaryStats.totalServices} services this month`
                      : `${members.length} total`}
                </p>
              </div>
            </header>

            {message ? (
              <Alert
                variant={messageKind === "error" ? "destructive" : "default"}
                className="relative"
              >
                <AlertCircleIcon data-icon="inline-start" />
                <AlertTitle>
                  {messageKind === "error" ? "Something went wrong" : "Status"}
                </AlertTitle>
                <AlertDescription className="pr-9">{message}</AlertDescription>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-2 right-2"
                  aria-label="Dismiss message"
                  onClick={() => setMessage(null)}
                >
                  <XIcon />
                </Button>
              </Alert>
            ) : null}

            {activeView === "summary" ? (
              <SummaryCard
                attendeePage={safeSummaryAttendeesPage}
                attendeePageCount={summaryAttendeesPageCount}
                calendarDays={summaryCalendarDays}
                countsByDate={summaryCountsByDate}
                expectedMembersByDate={summaryExpectedMembersByDate}
                isShowingExpectedMembers={isSelectedSummaryDateFuture}
                memberById={memberById}
                month={summaryMonth}
                onAttendeePageChange={setSummaryAttendeesPage}
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
                          onChange={(event) => setQuery(event.target.value)}
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
                            {filteredMembers.map((member) => (
                              <TableRow key={member.id}>
                                <TableCell className="font-medium">
                                  {member.displayName}
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
                                      onClick={() => editMember(member)}
                                    >
                                      <PencilIcon data-icon="inline-start" />
                                      Edit
                                    </Button>
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
                    </CardContent>
                  ) : null}
                </Card>

                <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                  <div className="flex flex-col gap-5">
                    <Card ref={memberFormCardRef}>
                      <CardHeader>
                        <CardTitle>{editingId ? "Update member" : "Add member"}</CardTitle>
                        <CardDescription>
                          These are the only fields this app saves.
                        </CardDescription>
                        {editingId ? (
                          <CardAction>
                            <Button variant="ghost" size="sm" onClick={resetForm}>
                              Cancel
                            </Button>
                          </CardAction>
                        ) : null}
                      </CardHeader>
                      <CardContent>
                        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                          <Field label="Member name" htmlFor="display-name">
                            <Input
                              ref={memberNameInputRef}
                              id="display-name"
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

                  <div className="flex flex-col gap-5">
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
                                  {members.map((member) => (
                                    <SelectItem key={member.id} value={member.id}>
                                      {member.displayName}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>

                          <div className="flex flex-col gap-4 lg:col-span-2">
                            <ServiceCalendar
                              month={calendarMonth}
                              days={calendarDays}
                              expectedDates={expectedServiceDates}
                              recordedDates={recordedServiceDatesForMemberMonth}
                              selectedDates={selectedServiceDates}
                              onClearDates={removeAllSelectedServiceDates}
                              onMonthChange={handleCalendarMonthChange}
                              onResetExpected={resetExpectedServiceDates}
                              onToggleDate={toggleSelectedServiceDate}
                            />
                            <div className="flex min-h-8 flex-wrap gap-2">
                              {selectedServiceDates.length === 0 ? (
                                <span className="text-sm text-muted-foreground">
                                  No dates selected
                                </span>
                              ) : (
                                selectedServiceDates.map((serviceDate) => (
                                  <Badge key={serviceDate} variant="secondary">
                                    {new Date(`${serviceDate}T00:00:00`).toLocaleDateString()}
                                    <button
                                      type="button"
                                      aria-label={`Remove ${serviceDate}`}
                                      onClick={() => removeSelectedServiceDate(serviceDate)}
                                    >
                                      <XIcon data-icon="inline-end" />
                                    </button>
                                  </Badge>
                                ))
                              )}
                            </div>
                          </div>

                          <Button
                            type="submit"
                            className="lg:col-span-2"
                            disabled={
                              isSaving ||
                              members.length === 0 ||
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
                                    <TableCell>{entry.serviceLabel}</TableCell>
                                    <TableCell className="text-right whitespace-nowrap">
                                      {new Date(`${entry.serviceDate}T00:00:00`).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex justify-end">
                                        <Button
                                          type="button"
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => deleteServiceEntry(entry.id)}
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
                </div>
              </>
            )}
          </div>
        </section>
      </div>

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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete member?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the record for {deleteTarget?.displayName}. This cannot be
              undone. Confirm your password to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-password">Password</Label>
            <Input
              id="delete-password"
              autoComplete="current-password"
              type="password"
              value={deletePassword}
              onChange={(event) => {
                setDeletePassword(event.target.value);
                setDeleteAuthError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  confirmDelete();
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
              onClick={confirmDelete}
              disabled={isSaving || !deletePassword}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-t border-sidebar-border pt-3">
      <span className="text-sm text-sidebar-foreground/70">{label}</span>
      <strong className="text-2xl">{value}</strong>
    </div>
  );
}

"use client";

import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import {
  Claim,
  ClaimFormValues,
  claimStatusOptions,
  createEmptyClaimForm,
  defaultClaimStatus,
  fetchAllClaims,
  getClaimStatusStyle,
  mapClaimRow,
  toClaimInsert,
  toClaimUpdate,
} from "@/lib/claim-store";
import type { AuditEventInput } from "@/lib/audit-store";
import { getMonthDateRange, getMonthInputValue, getWeekDateRange } from "@/lib/date-utils";
import { getProviderLabel, type Member } from "@/lib/member-store";
import { getTodayDate, type ServiceEntry } from "@/lib/service-store";
import { supabase } from "@/lib/supabase";
import { Field } from "@/components/form-field";
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
  DialogClose,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const claimsPageSize = 10;

type MemberClaimGroup = {
  member: Member | null;
  memberId: string;
  claims: Claim[];
  statusCounts: Record<string, number>;
  latestServiceDate: string;
  earliestServiceDate: string;
  lastAttemptedAt: string | null;
};

export function ClaimsDashboard({
  memberById,
  members,
  onAudit,
  serviceEntries,
}: {
  memberById: Map<string, Member>;
  members: Member[];
  onAudit?: (input: AuditEventInput) => Promise<void>;
  serviceEntries: ServiceEntry[];
}) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [expandedMemberIds, setExpandedMemberIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [form, setForm] = useState<ClaimFormValues>(createEmptyClaimForm());
  const [deleteTarget, setDeleteTarget] = useState<Claim | null>(null);

  async function loadClaims() {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setBusyMessage("Loading claims...");

    const { data, error } = await fetchAllClaims(supabase);

    if (error) {
      toast.error(error.message);
    } else {
      setClaims(data);
    }

    setIsLoading(false);
    setBusyMessage(null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadClaims();
  }, []);

  const canonicalClaims = useMemo(() => getCanonicalClaims(claims), [claims]);

  const filteredClaims = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return canonicalClaims.filter((claim) => {
      if (statusFilter !== "All" && claim.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const memberName = memberById.get(claim.memberId)?.displayName ?? "";
      return memberName.toLowerCase().includes(normalizedQuery);
    });
  }, [canonicalClaims, memberById, query, statusFilter]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = { Total: canonicalClaims.length };

    for (const status of claimStatusOptions) {
      counts[status.value] = 0;
    }

    for (const claim of canonicalClaims) {
      counts[claim.status] = (counts[claim.status] ?? 0) + 1;
    }

    return counts;
  }, [canonicalClaims]);

  const lastFailedClaim = useMemo(() => {
    return canonicalClaims
      .filter((claim) => claim.status.toLowerCase() === "failed")
      .sort((left, right) =>
        (right.lastAttemptedAt ?? "").localeCompare(left.lastAttemptedAt ?? "")
      )[0];
  }, [canonicalClaims]);

  const memberClaimGroups = useMemo(() => {
    const groupsByMember = new Map<string, Claim[]>();

    for (const claim of filteredClaims) {
      const memberClaims = groupsByMember.get(claim.memberId) ?? [];
      memberClaims.push(claim);
      groupsByMember.set(claim.memberId, memberClaims);
    }

    return Array.from(groupsByMember.entries())
      .map(([memberId, memberClaims]) => {
        const sortedClaims = [...memberClaims].sort((left, right) =>
          right.serviceDate.localeCompare(left.serviceDate)
        );
        const statusCounts: Record<string, number> = {};

        for (const status of claimStatusOptions) {
          statusCounts[status.value] = 0;
        }

        for (const claim of sortedClaims) {
          statusCounts[claim.status] = (statusCounts[claim.status] ?? 0) + 1;
        }

        return {
          member: memberById.get(memberId) ?? null,
          memberId,
          claims: sortedClaims,
          statusCounts,
          latestServiceDate: sortedClaims[0]?.serviceDate ?? "",
          earliestServiceDate: sortedClaims[sortedClaims.length - 1]?.serviceDate ?? "",
          lastAttemptedAt: sortedClaims
            .map((claim) => claim.lastAttemptedAt)
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1) ?? null,
        };
      })
      .sort((left, right) => {
        const leftName = left.member?.displayName ?? "Unknown member";
        const rightName = right.member?.displayName ?? "Unknown member";
        const nameSort = leftName.localeCompare(rightName);

        return nameSort || right.latestServiceDate.localeCompare(left.latestServiceDate);
      });
  }, [filteredClaims, memberById]);

  const pageCount = Math.max(1, Math.ceil(memberClaimGroups.length / claimsPageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleMemberClaimGroups = memberClaimGroups.slice(
    safePage * claimsPageSize,
    safePage * claimsPageSize + claimsPageSize
  );

  function openAddDialog() {
    setEditingClaimId(null);
    setForm(createEmptyClaimForm(members[0]?.id ?? "", new Date().toLocaleDateString("en-CA")));
    setIsFormOpen(true);
  }

  function openEditDialog(claim: Claim) {
    setEditingClaimId(claim.id);
    setForm({
      memberId: claim.memberId,
      serviceDate: claim.serviceDate,
      status: claim.status,
      lastFailureReason: claim.lastFailureReason ?? "",
    });
    setIsFormOpen(true);
  }

  function toggleMemberClaimGroup(memberId: string) {
    setExpandedMemberIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(memberId)) {
        nextIds.delete(memberId);
      } else {
        nextIds.add(memberId);
      }

      return nextIds;
    });
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !form.memberId || !form.serviceDate) {
      return;
    }

    setIsSaving(true);
    setBusyMessage(editingClaimId ? "Updating claim..." : "Adding claim...");

    if (editingClaimId) {
      const { data, error } = await supabase
        .from("claims")
        .update(toClaimUpdate(form))
        .eq("id", editingClaimId)
        .select(
          "id, member_id, service_date, status, attempt_count, last_attempted_at, last_failure_reason, submitted_at, created_at, updated_at"
        )
        .single();

      if (error) {
        toast.error(error.message);
      } else {
        const updatedClaim = mapClaimRow(data);
        setClaims((currentClaims) =>
          getCanonicalClaims([
            ...currentClaims.filter((claim) => claim.id !== updatedClaim.id),
            updatedClaim,
          ])
        );
        await onAudit?.({
          action: "claim_updated",
          entityType: "claim",
          entityId: updatedClaim.id,
          summary: `Updated claim for ${memberById.get(updatedClaim.memberId)?.displayName ?? "a member"}.`,
          metadata: {
            member: memberById.get(updatedClaim.memberId)?.displayName,
            serviceDate: updatedClaim.serviceDate,
            status: updatedClaim.status,
          },
        });
        toast.success("Claim updated.");
        setIsFormOpen(false);
      }
    } else {
      const { data, error } = await supabase
        .from("claims")
        .insert(toClaimInsert(form))
        .select(
          "id, member_id, service_date, status, attempt_count, last_attempted_at, last_failure_reason, submitted_at, created_at, updated_at"
        )
        .single();

      if (error) {
        toast.error(error.message);
      } else {
        const newClaim = mapClaimRow(data);
        setClaims((currentClaims) =>
          getCanonicalClaims([newClaim, ...currentClaims])
        );
        await onAudit?.({
          action: "claim_created",
          entityType: "claim",
          entityId: newClaim.id,
          summary: `Added claim for ${memberById.get(newClaim.memberId)?.displayName ?? "a member"}.`,
          metadata: {
            member: memberById.get(newClaim.memberId)?.displayName,
            serviceDate: newClaim.serviceDate,
            status: newClaim.status,
          },
        });
        toast.success("Claim added.");
        setIsFormOpen(false);
      }
    }

    setIsSaving(false);
    setBusyMessage(null);
  }

  async function confirmDeleteClaim() {
    if (!supabase || !deleteTarget) {
      return;
    }

    setIsSaving(true);
    setBusyMessage("Deleting claim...");

    const { error } = await supabase.from("claims").delete().eq("id", deleteTarget.id);

    if (error) {
      toast.error(error.message);
    } else {
      const deletedClaim = deleteTarget;
      setClaims((currentClaims) =>
        currentClaims.filter((claim) => claim.id !== deletedClaim.id)
      );
      setDeleteTarget(null);
      await onAudit?.({
        action: "claim_deleted",
        entityType: "claim",
        entityId: deletedClaim.id,
        summary: `Deleted claim for ${memberById.get(deletedClaim.memberId)?.displayName ?? "a member"}.`,
        metadata: {
          member: memberById.get(deletedClaim.memberId)?.displayName,
          serviceDate: deletedClaim.serviceDate,
          status: deletedClaim.status,
        },
      });
      toast.success("Claim deleted.");
    }

    setIsSaving(false);
    setBusyMessage(null);
  }

  async function handleGenerateRequiredClaims(range: "week" | "monthToDate" | "month") {
    if (!supabase) {
      return;
    }

    const today = getTodayDate();
    const monthRange = getMonthDateRange(getMonthInputValue());
    const { start, end } =
      range === "week"
        ? getWeekDateRange(today)
        : { start: monthRange.start, end: range === "monthToDate" ? today : monthRange.end };

    const activeMemberIds = new Set(members.map((member) => member.id));
    setIsSaving(true);
    setBusyMessage(
      range === "week"
        ? "Generating required claims for this week..."
        : range === "monthToDate"
          ? "Generating required claims through today..."
          : "Generating required claims for the whole month..."
    );

    const existingResult = await supabase
      .from("claims")
      .select(
        "id, member_id, service_date, status, attempt_count, last_attempted_at, last_failure_reason, submitted_at, created_at, updated_at"
      )
      .gte("service_date", start)
      .lte("service_date", end);

    if (existingResult.error) {
      toast.error(existingResult.error.message);
      setIsSaving(false);
      setBusyMessage(null);
      return;
    }

    const freshExistingClaims = existingResult.data.map(mapClaimRow);
    const existingClaimKeys = new Set(
      freshExistingClaims.map((claim) => `${claim.memberId}:${claim.serviceDate}`)
    );

    const toCreate = serviceEntries.filter((entry) => {
      if (entry.serviceLabel.toLowerCase() !== "attended") {
        return false;
      }
      if (entry.serviceDate < start || entry.serviceDate > end) {
        return false;
      }
      if (!activeMemberIds.has(entry.memberId)) {
        return false;
      }
      return !existingClaimKeys.has(`${entry.memberId}:${entry.serviceDate}`);
    });

    if (toCreate.length === 0) {
      toast.success("No new claims needed for this range.");
      setIsSaving(false);
      setBusyMessage(null);
      return;
    }

    const { data, error } = await supabase
      .from("claims")
      .upsert(
        toCreate.map((entry) =>
          toClaimInsert({
            memberId: entry.memberId,
            serviceDate: entry.serviceDate,
            status: "Required",
            lastFailureReason: "",
          })
        ),
        { ignoreDuplicates: true, onConflict: "member_id,service_date" }
      )
      .select(
        "id, member_id, service_date, status, attempt_count, last_attempted_at, last_failure_reason, submitted_at, created_at, updated_at"
      )
      .order("service_date", { ascending: false });

    if (error) {
      toast.error(error.message);
    } else {
      const newClaims = data.map(mapClaimRow);
      setClaims((currentClaims) =>
        getCanonicalClaims([...currentClaims, ...freshExistingClaims, ...newClaims])
      );
      await onAudit?.({
        action: "claims_generated",
        entityType: "claim",
        summary: `Generated ${newClaims.length} required claims.`,
        metadata: {
          range,
          start,
          end,
          count: newClaims.length,
        },
      });
      toast.success(
        `Generated ${newClaims.length} required claim${newClaims.length === 1 ? "" : "s"}.`
      );
    }

    setIsSaving(false);
    setBusyMessage(null);
  }

  return (
    <div className="flex flex-col gap-5">
      {busyMessage ? <LoadingStatus message={busyMessage} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Generate required claims</CardTitle>
          <CardDescription>
            Create a &quot;Required&quot; claim for every attended service in this range that
            doesn&apos;t have one yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => handleGenerateRequiredClaims("week")}
          >
            <CalendarRangeIcon data-icon="inline-start" />
            This week
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => handleGenerateRequiredClaims("monthToDate")}
          >
            <CalendarClockIcon data-icon="inline-start" />
            Through today
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => handleGenerateRequiredClaims("month")}
          >
            <CalendarDaysIcon data-icon="inline-start" />
            Whole month
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={stats.Total ?? 0} />
        {claimStatusOptions.map((status) => (
          <StatCard
            key={status.value}
            label={status.label}
            value={stats[status.value] ?? 0}
            dotClassName={getClaimStatusStyle(status.value).dot}
          />
        ))}
      </div>

      {lastFailedClaim ? (
        <Alert variant="destructive">
          <AlertCircleIcon data-icon="inline-start" />
          <AlertTitle>Last failure</AlertTitle>
          <AlertDescription>
            {memberById.get(lastFailedClaim.memberId)?.displayName ?? "Unknown member"} —{" "}
            {new Date(`${lastFailedClaim.serviceDate}T00:00:00`).toLocaleDateString()}
            {lastFailedClaim.lastFailureReason ? `: ${lastFailedClaim.lastFailureReason}` : ""}
            {lastFailedClaim.lastAttemptedAt
              ? ` (${new Date(lastFailedClaim.lastAttemptedAt).toLocaleString()})`
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Claims</CardTitle>
          <CardDescription>Claim submission status per member and service day.</CardDescription>
          <CardAction>
            <Button type="button" size="sm" onClick={openAddDialog} disabled={members.length === 0}>
              <PlusIcon data-icon="inline-start" />
              Add claim
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              aria-label="Search claims by member"
              className="sm:w-64"
              placeholder="Search for member"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value ?? "All");
                setPage(0);
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <span className="truncate text-left">{statusFilter}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="All">All statuses</SelectItem>
                  {claimStatusOptions.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon data-icon="inline-start" />
              Loading claims
            </div>
          ) : memberClaimGroups.length === 0 ? (
            <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
              <h3 className="font-medium">No claims found</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                Adjust the filters or add a claim from the button above.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Service range</TableHead>
                  <TableHead>Status counts</TableHead>
                  <TableHead className="text-right">Claims</TableHead>
                  <TableHead>Last attempted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMemberClaimGroups.map((group) => {
                  const isExpanded = expandedMemberIds.has(group.memberId);

                  return (
                    <Fragment key={group.memberId}>
                      <TableRow key={group.memberId}>
                        <TableCell className="font-medium">
                          {group.member?.displayName ?? "Unknown member"}
                        </TableCell>
                        <TableCell>
                          {group.member?.provider
                            ? getProviderLabel(group.member.provider)
                            : "Not set"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatClaimServiceRange(group)}
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-sm flex-wrap gap-1.5">
                            {claimStatusOptions
                              .filter((status) => group.statusCounts[status.value] > 0)
                              .map((status) => (
                                <Badge
                                  key={`${group.memberId}-${status.value}`}
                                  className={cn(
                                    "gap-1.5",
                                    getClaimStatusStyle(status.value).badge
                                  )}
                                >
                                  {status.label}: {group.statusCounts[status.value]}
                                </Badge>
                              ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{group.claims.length}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {group.lastAttemptedAt
                            ? new Date(group.lastAttemptedAt).toLocaleString()
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => toggleMemberClaimGroup(group.memberId)}
                            >
                              <ChevronRightIcon
                                className={cn("transition-transform", isExpanded && "rotate-90")}
                                data-icon="inline-start"
                              />
                              {isExpanded ? "Hide dates" : "View dates"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded ? (
                        <TableRow key={`${group.memberId}-dates`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            <div className="max-h-80 overflow-y-auto p-3">
                              <div className="grid gap-2">
                                {group.claims.map((claim) => (
                                  <div
                                    key={claim.id}
                                    className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-[7rem_8rem_minmax(0,1fr)_auto] md:items-center"
                                  >
                                    <span className="text-sm font-medium">
                                      {new Date(
                                        `${claim.serviceDate}T00:00:00`
                                      ).toLocaleDateString()}
                                    </span>
                                    <Badge
                                      className={cn(
                                        "w-fit gap-1.5",
                                        getClaimStatusStyle(claim.status).badge
                                      )}
                                    >
                                      {claim.status}
                                    </Badge>
                                    <div className="min-w-0 text-xs text-muted-foreground">
                                      {claim.lastFailureReason ? (
                                        <span className="block truncate">
                                          {claim.lastFailureReason}
                                        </span>
                                      ) : (
                                        <span>
                                          {claim.lastAttemptedAt
                                            ? `Last attempted ${new Date(
                                              claim.lastAttemptedAt
                                            ).toLocaleString()}`
                                            : "No claim attempt recorded"}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openEditDialog(claim)}
                                      >
                                        <PencilIcon data-icon="inline-start" />
                                        Edit
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setDeleteTarget(claim)}
                                      >
                                        <Trash2Icon data-icon="inline-start" />
                                        Delete
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Page {safePage + 1} of {pageCount} · {memberClaimGroups.length} members
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={safePage === 0}
                onClick={() => setPage(Math.max(0, safePage - 1))}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClaimId ? "Edit claim" : "Add claim"}</DialogTitle>
            <DialogDescription>
              Track claim submission status per member and service day.
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={handleFormSubmit}>
            <Field label="Member" htmlFor="claim-member">
              <Select
                value={form.memberId}
                onValueChange={(value) => setForm({ ...form, memberId: value ?? "" })}
              >
                <SelectTrigger id="claim-member" className="w-full">
                  <span className="truncate text-left">
                    {memberById.get(form.memberId)?.displayName ?? "Select member"}
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

            <Field label="Service date" htmlFor="claim-service-date">
              <Input
                id="claim-service-date"
                type="date"
                value={form.serviceDate}
                onChange={(event) => setForm({ ...form, serviceDate: event.target.value })}
                required
              />
            </Field>

            <Field label="Status" htmlFor="claim-status">
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm({ ...form, status: value ?? defaultClaimStatus })
                }
              >
                <SelectTrigger id="claim-status" className="w-full">
                  <span className="flex items-center gap-2 truncate text-left">
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        getClaimStatusStyle(form.status).dot
                      )}
                    />
                    {form.status}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {claimStatusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        <span
                          className={cn(
                            "size-2.5 shrink-0 rounded-full",
                            getClaimStatusStyle(status.value).dot
                          )}
                        />
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            {form.status.toLowerCase() === "failed" ? (
              <Field label="Failure reason" htmlFor="claim-failure-reason">
                <Textarea
                  id="claim-failure-reason"
                  placeholder="Why did this attempt fail?"
                  value={form.lastFailureReason}
                  onChange={(event) =>
                    setForm({ ...form, lastFailureReason: event.target.value })
                  }
                />
              </Field>
            ) : null}

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={isSaving || !form.memberId || !form.serviceDate}>
                {isSaving ? (
                  <Loader2Icon data-icon="inline-start" />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                {editingClaimId ? "Save changes" : "Add claim"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete claim?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the claim record for{" "}
              {memberById.get(deleteTarget?.memberId ?? "")?.displayName ?? "this member"} on{" "}
              {deleteTarget
                ? new Date(`${deleteTarget.serviceDate}T00:00:00`).toLocaleDateString()
                : ""}
              . This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep claim</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteClaim}
              disabled={isSaving}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  dotClassName,
  label,
  value,
}: {
  dotClassName?: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dotClassName ? <span className={cn("size-2 shrink-0 rounded-full", dotClassName)} /> : null}
        {label}
      </p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function formatClaimServiceRange(group: MemberClaimGroup) {
  if (!group.earliestServiceDate || !group.latestServiceDate) {
    return "—";
  }

  const earliestDate = new Date(`${group.earliestServiceDate}T00:00:00`).toLocaleDateString();
  const latestDate = new Date(`${group.latestServiceDate}T00:00:00`).toLocaleDateString();

  return group.earliestServiceDate === group.latestServiceDate
    ? latestDate
    : `${earliestDate} - ${latestDate}`;
}

function getCanonicalClaims(claims: Claim[]) {
  const claimsById = new Map<string, Claim>();

  for (const claim of claims) {
    const existingClaim = claimsById.get(claim.id);

    if (!existingClaim || existingClaim.updatedAt <= claim.updatedAt) {
      claimsById.set(claim.id, claim);
    }
  }

  return Array.from(claimsById.values()).sort((left, right) =>
    right.serviceDate.localeCompare(left.serviceDate)
  );
}

function LoadingStatus({ message }: { message: string }) {
  return (
    <div
      className="overflow-hidden rounded-lg border bg-card/95 text-card-foreground shadow-sm"
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

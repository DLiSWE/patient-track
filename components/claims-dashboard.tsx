"use client";

import { Fragment, FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
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
  fetchClaimsInRange,
  getClaimStatusStyle,
  mapClaimRow,
  toClaimInsert,
  toClaimUpdate,
} from "@/lib/claim-store";
import type { AuditEventInput } from "@/lib/audit-store";
import {
  getExpectedServiceDatesForMonth,
  getMonthDateRange,
  getWeekDateRange,
} from "@/lib/date-utils";
import { getProviderLabel, type Member } from "@/lib/member-store";
import {
  fetchServiceEntriesInRange,
  getTodayDate,
  type ServiceEntry,
} from "@/lib/service-store";
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

type ProviderClaimBatch = {
  accepted: number;
  claims: Claim[];
  failed: number;
  pending: number;
  provider: string;
  readyToGenerate: ServiceEntry[];
  required: number;
  submitted: number;
  total: number;
};

type ClaimReviewSeverity = "high" | "medium" | "low";

type ClaimReviewItem = {
  id: string;
  memberName: string;
  provider: string;
  serviceDate: string;
  severity: ClaimReviewSeverity;
  summary: string;
  type: string;
};

export function ClaimsDashboard({
  claims,
  isLoading = false,
  memberById,
  members,
  month,
  onAudit,
  onClaimsChange,
  onMonthChange,
  onMonthDataRefresh,
  serviceEntries,
}: {
  claims: Claim[];
  isLoading?: boolean;
  memberById: Map<string, Member>;
  members: Member[];
  month: string;
  onAudit?: (input: AuditEventInput) => Promise<void>;
  onClaimsChange?: (claims: Claim[]) => void;
  onMonthChange: (month: string) => void;
  onMonthDataRefresh?: (month: string) => Promise<void>;
  serviceEntries: ServiceEntry[];
}) {
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

  const canonicalClaims = useMemo(() => getCanonicalClaims(claims), [claims]);

  function updateClaims(updater: (currentClaims: Claim[]) => Claim[]) {
    const nextClaims = updater(canonicalClaims);
    onClaimsChange?.(nextClaims);
  }

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

  const claimKeySet = useMemo(
    () => new Set(canonicalClaims.map((claim) => `${claim.memberId}:${claim.serviceDate}`)),
    [canonicalClaims]
  );

  const monthServiceEntries = useMemo(
    () => serviceEntries.filter((entry) => entry.serviceDate.startsWith(`${month}-`)),
    [month, serviceEntries]
  );

  const readyToGenerateEntries = useMemo(
    () =>
      monthServiceEntries.filter(
        (entry) =>
          entry.serviceLabel.toLowerCase() === "attended" &&
          !claimKeySet.has(`${entry.memberId}:${entry.serviceDate}`) &&
          members.some((member) => member.id === entry.memberId)
      ),
    [claimKeySet, members, monthServiceEntries]
  );

  const claimReviewItems = useMemo(() => {
    const today = getTodayDate();
    const reviewItems = new Map<string, ClaimReviewItem>();
    const serviceByMemberDate = new Map<string, ServiceEntry>();
    const recordedDatesByMember = new Map<string, Set<string>>();

    function addReviewItem(item: ClaimReviewItem) {
      reviewItems.set(item.id, item);
    }

    function getMemberLabel(memberId: string) {
      const member = memberById.get(memberId);

      return {
        memberName: member?.displayName ?? "Unknown member",
        provider: member?.provider ? getProviderLabel(member.provider) : "Not set",
      };
    }

    for (const entry of monthServiceEntries) {
      const key = `${entry.memberId}:${entry.serviceDate}`;
      serviceByMemberDate.set(key, entry);

      const recordedDates = recordedDatesByMember.get(entry.memberId) ?? new Set<string>();
      recordedDates.add(entry.serviceDate);
      recordedDatesByMember.set(entry.memberId, recordedDates);
    }

    for (const member of members) {
      const missingFields = [
        !member.provider ? "provider" : "",
        !member.serviceDays ? "service days" : "",
      ].filter(Boolean);

      if (missingFields.length > 0) {
        addReviewItem({
          id: `member-setup:${member.id}`,
          memberName: member.displayName,
          provider: member.provider ? getProviderLabel(member.provider) : "Not set",
          serviceDate: "",
          severity: "medium",
          summary: `Missing ${missingFields.join(" and ")} setup.`,
          type: "Member setup",
        });
        continue;
      }

      const missingDates = getExpectedServiceDatesForMonth(
        month,
        member.serviceDays,
        recordedDatesByMember.get(member.id) ?? new Set<string>()
      ).filter((date) => date <= today);

      for (const serviceDate of missingDates) {
        addReviewItem({
          id: `expected-missing:${member.id}:${serviceDate}`,
          memberName: member.displayName,
          provider: member.provider ? getProviderLabel(member.provider) : "Not set",
          serviceDate,
          severity: "medium",
          summary: "Expected attendance is missing through today.",
          type: "Expected missing",
        });
      }
    }

    for (const entry of monthServiceEntries) {
      const key = `${entry.memberId}:${entry.serviceDate}`;
      const { memberName, provider } = getMemberLabel(entry.memberId);
      const serviceLabel = entry.serviceLabel.toLowerCase();

      if (serviceLabel === "attended" && !claimKeySet.has(key)) {
        addReviewItem({
          id: `service-no-claim:${key}`,
          memberName,
          provider,
          serviceDate: entry.serviceDate,
          severity: "medium",
          summary: "Attended service exists but no claim has been created.",
          type: "Service without claim",
        });
      }

      if (serviceLabel !== "attended" && claimKeySet.has(key)) {
        addReviewItem({
          id: `hold-has-claim:${key}`,
          memberName,
          provider,
          serviceDate: entry.serviceDate,
          severity: "high",
          summary: `${entry.serviceLabel} service has a claim attached.`,
          type: "Non-attended with claim",
        });
      }
    }

    for (const claim of canonicalClaims) {
      const key = `${claim.memberId}:${claim.serviceDate}`;
      const { memberName, provider } = getMemberLabel(claim.memberId);

      if (!serviceByMemberDate.has(key)) {
        addReviewItem({
          id: `claim-no-service:${key}`,
          memberName,
          provider,
          serviceDate: claim.serviceDate,
          severity: "high",
          summary: "Claim exists but no matching service entry was found.",
          type: "Claim without service",
        });
      }

      if (claim.serviceDate > today) {
        addReviewItem({
          id: `future-claim:${key}`,
          memberName,
          provider,
          serviceDate: claim.serviceDate,
          severity: "low",
          summary: "Claim date is after today.",
          type: "Future claim",
        });
      }

      if (claim.status.toLowerCase() === "failed") {
        addReviewItem({
          id: `failed-claim:${claim.id}`,
          memberName,
          provider,
          serviceDate: claim.serviceDate,
          severity: "high",
          summary: claim.lastFailureReason || "Claim is marked failed.",
          type: "Failed claim",
        });
      }
    }

    return Array.from(reviewItems.values()).sort((left, right) => {
      const severitySort =
        getClaimReviewSeverityRank(right.severity) - getClaimReviewSeverityRank(left.severity);

      return (
        severitySort ||
        left.serviceDate.localeCompare(right.serviceDate) ||
        left.memberName.localeCompare(right.memberName)
      );
    });
  }, [canonicalClaims, claimKeySet, memberById, members, month, monthServiceEntries]);

  const claimReviewStats = useMemo(
    () => ({
      high: claimReviewItems.filter((item) => item.severity === "high").length,
      low: claimReviewItems.filter((item) => item.severity === "low").length,
      medium: claimReviewItems.filter((item) => item.severity === "medium").length,
      total: claimReviewItems.length,
    }),
    [claimReviewItems]
  );

  const providerBatches = useMemo(() => {
    const batchesByProvider = new Map<string, ProviderClaimBatch>();

    function getBatch(provider: string) {
      const normalizedProvider = provider || "Not set";
      const existingBatch = batchesByProvider.get(normalizedProvider);

      if (existingBatch) {
        return existingBatch;
      }

      const nextBatch: ProviderClaimBatch = {
        accepted: 0,
        claims: [],
        failed: 0,
        pending: 0,
        provider: normalizedProvider,
        readyToGenerate: [],
        required: 0,
        submitted: 0,
        total: 0,
      };
      batchesByProvider.set(normalizedProvider, nextBatch);
      return nextBatch;
    }

    for (const claim of canonicalClaims) {
      const member = memberById.get(claim.memberId);
      const batch = getBatch(member?.provider ?? "");
      const status = claim.status.toLowerCase();

      batch.claims.push(claim);
      batch.total += 1;

      if (status === "accepted") {
        batch.accepted += 1;
      } else if (status === "failed") {
        batch.failed += 1;
      } else if (status === "pending") {
        batch.pending += 1;
      } else if (status === "required") {
        batch.required += 1;
      } else if (status === "submitted") {
        batch.submitted += 1;
      }
    }

    for (const entry of readyToGenerateEntries) {
      const member = memberById.get(entry.memberId);
      const batch = getBatch(member?.provider ?? "");
      batch.readyToGenerate.push(entry);
    }

    return Array.from(batchesByProvider.values()).sort((left, right) =>
      getProviderLabel(left.provider).localeCompare(getProviderLabel(right.provider))
    );
  }, [canonicalClaims, memberById, readyToGenerateEntries]);

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
    setForm(createEmptyClaimForm(members[0]?.id ?? "", `${month}-01`));
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
        updateClaims((currentClaims) =>
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
        updateClaims((currentClaims) =>
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
      updateClaims((currentClaims) =>
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
    const monthRange = getMonthDateRange(month);
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

    const [existingResult, freshServiceResult] = await Promise.all([
      fetchClaimsInRange(supabase, start, end),
      fetchServiceEntriesInRange(supabase, start, end),
    ]);

    if (existingResult.error) {
      toast.error(existingResult.error.message);
      setIsSaving(false);
      setBusyMessage(null);
      return;
    }

    if (freshServiceResult.error) {
      toast.error(freshServiceResult.error.message);
      setIsSaving(false);
      setBusyMessage(null);
      return;
    }

    const freshExistingClaims = existingResult.data;
    const freshServiceEntries = freshServiceResult.data.filter(
      (entry) =>
        entry.serviceLabel.toLowerCase() === "attended" &&
        activeMemberIds.has(entry.memberId)
    );
    const existingClaimKeys = new Set(
      freshExistingClaims.map((claim) => `${claim.memberId}:${claim.serviceDate}`)
    );
    const attendedServiceKeys = new Set(
      freshServiceEntries.map((entry) => `${entry.memberId}:${entry.serviceDate}`)
    );

    const toCreate = freshServiceEntries.filter(
      (entry) => !existingClaimKeys.has(`${entry.memberId}:${entry.serviceDate}`)
    );
    const claimsToDelete = freshExistingClaims.filter((claim) => {
      const status = claim.status.toLowerCase();

      return (
        activeMemberIds.has(claim.memberId) &&
        !attendedServiceKeys.has(`${claim.memberId}:${claim.serviceDate}`) &&
        (status === "required" || status === "pending")
      );
    });

    if (toCreate.length === 0 && claimsToDelete.length === 0) {
      toast.success("No new claims needed for this range.");
      setIsSaving(false);
      setBusyMessage(null);
      return;
    }

    const deleteResult =
      claimsToDelete.length > 0
        ? await supabase
          .from("claims")
          .delete()
          .in("id", claimsToDelete.map((claim) => claim.id))
        : { error: null };

    if (deleteResult.error) {
      toast.error(deleteResult.error.message);
      setIsSaving(false);
      setBusyMessage(null);
      return;
    }

    const insertResult =
      toCreate.length > 0
        ? await supabase
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
        : { error: null };

    if (insertResult.error) {
      toast.error(insertResult.error.message);
    } else {
      const refreshedClaimsResult = await fetchClaimsInRange(supabase, start, end);

      if (refreshedClaimsResult.error) {
        toast.error(refreshedClaimsResult.error.message);
        setIsSaving(false);
        setBusyMessage(null);
        return;
      }

      updateClaims(() => getCanonicalClaims(refreshedClaimsResult.data));
      await onMonthDataRefresh?.(month);
      await onAudit?.({
        action: "claims_generated",
        entityType: "claim",
        summary: `Generated ${toCreate.length} required claims and removed ${claimsToDelete.length} stale claims.`,
        metadata: {
          range,
          start,
          end,
          created: toCreate.length,
          removed: claimsToDelete.length,
        },
      });
      toast.success(
        `Generated ${toCreate.length} claim${toCreate.length === 1 ? "" : "s"} and removed ${claimsToDelete.length} stale claim${claimsToDelete.length === 1 ? "" : "s"}.`
      );
    }

    setIsSaving(false);
    setBusyMessage(null);
  }

  function exportClaimStatusReport() {
    const rows = canonicalClaims.map((claim) => {
      const member = memberById.get(claim.memberId);

      return {
        attempts: claim.attemptCount,
        lastAttempted: claim.lastAttemptedAt ?? "",
        lastFailure: claim.lastFailureReason ?? "",
        member: member?.displayName ?? "Unknown member",
        provider: member?.provider ? getProviderLabel(member.provider) : "Not set",
        serviceDate: claim.serviceDate,
        status: claim.status,
        submittedAt: claim.submittedAt ?? "",
      };
    });

    downloadCsv(`claim-status-${month}.csv`, rows);
  }

  function exportClaimQueue() {
    const rows = readyToGenerateEntries.map((entry) => {
      const member = memberById.get(entry.memberId);

      return {
        member: member?.displayName ?? "Unknown member",
        provider: member?.provider ? getProviderLabel(member.provider) : "Not set",
        serviceDate: entry.serviceDate,
        serviceStatus: entry.serviceLabel,
      };
    });

    downloadCsv(`claims-needed-${month}.csv`, rows);
  }

  function exportAttendanceReport() {
    const rows = monthServiceEntries.map((entry) => {
      const member = memberById.get(entry.memberId);

      return {
        member: member?.displayName ?? "Unknown member",
        provider: member?.provider ? getProviderLabel(member.provider) : "Not set",
        serviceDate: entry.serviceDate,
        serviceStatus: entry.serviceLabel,
        updatedAt: entry.updatedAt,
      };
    });

    downloadCsv(`attendance-${month}.csv`, rows);
  }

  function exportClaimReview() {
    const rows = claimReviewItems.map((item) => ({
      member: item.memberName,
      provider: item.provider,
      serviceDate: item.serviceDate,
      severity: item.severity,
      type: item.type,
      summary: item.summary,
    }));

    downloadCsv(`claim-review-${month}.csv`, rows);
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
          <CardAction>
            <Input
              aria-label="Claims month"
              className="w-40"
              type="month"
              value={month}
              onChange={(event) => onMonthChange(event.target.value)}
            />
          </CardAction>
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

      <Card>
        <CardHeader>
          <CardTitle>Needs review</CardTitle>
          <CardDescription>
            Pre-bot checks for attendance and claims in {formatMonthLabel(month)}.
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportClaimReview}
              disabled={isLoading || claimReviewItems.length === 0}
            >
              <DownloadIcon data-icon="inline-start" />
              Review CSV
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!isLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ReviewMetric label="Total" value={claimReviewStats.total} severity="low" />
              <ReviewMetric label="High" value={claimReviewStats.high} severity="high" />
              <ReviewMetric label="Medium" value={claimReviewStats.medium} severity="medium" />
              <ReviewMetric label="Low" value={claimReviewStats.low} severity="low" />
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
              <Loader2Icon data-icon="inline-start" />
              Refreshing month data
            </div>
          ) : claimReviewItems.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-4 text-sm text-emerald-700 dark:text-emerald-200">
              No claim issues found for this month.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-lg border">
              {claimReviewItems.slice(0, 25).map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[7rem_9rem_minmax(0,1fr)_auto] sm:items-center"
                >
                  <Badge className={cn("w-fit", getClaimReviewSeverityStyle(item.severity))}>
                    {item.severity}
                  </Badge>
                  <span className="text-sm font-medium">
                    {item.serviceDate
                      ? new Date(`${item.serviceDate}T00:00:00`).toLocaleDateString()
                      : "Setup"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.memberName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.type} · {item.summary}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.provider}</span>
                </div>
              ))}
              {claimReviewItems.length > 25 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Showing 25 of {claimReviewItems.length}. Export CSV for the full review list.
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claim batches</CardTitle>
          <CardDescription>
            Provider-level claim workload for {formatMonthLabel(month)}.
          </CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={exportClaimQueue}>
              <DownloadIcon data-icon="inline-start" />
              Queue
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={exportClaimStatusReport}>
              <DownloadIcon data-icon="inline-start" />
              Claims
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={exportAttendanceReport}>
              <DownloadIcon data-icon="inline-start" />
              Attendance
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {providerBatches.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed px-3 text-sm text-muted-foreground">
              No claim activity for this month
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {providerBatches.map((batch) => (
                <div key={batch.provider} className="rounded-lg border bg-background/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{getProviderLabel(batch.provider)}</h3>
                      <p className="text-xs text-muted-foreground">
                        {batch.total} claims · {batch.readyToGenerate.length} ready to generate
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        batch.failed > 0
                          ? getClaimStatusStyle("Failed").badge
                          : batch.readyToGenerate.length > 0
                            ? getClaimStatusStyle("Required").badge
                            : getClaimStatusStyle("Accepted").badge
                      )}
                    >
                      {batch.failed > 0
                        ? `${batch.failed} failed`
                        : batch.readyToGenerate.length > 0
                          ? "Action needed"
                          : "Clear"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                    <BatchMetric label="Ready" value={batch.readyToGenerate.length} />
                    <BatchMetric label="Required" value={batch.required} />
                    <BatchMetric label="Pending" value={batch.pending} />
                    <BatchMetric label="Submitted" value={batch.submitted} />
                    <BatchMetric label="Accepted" value={batch.accepted} />
                    <BatchMetric label="Failed" value={batch.failed} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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

          {memberClaimGroups.length === 0 ? (
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

function BatchMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card/80 px-2 py-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}

function ReviewMetric({
  label,
  severity,
  value,
}: {
  label: string;
  severity: ClaimReviewSeverity;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-2xl font-semibold">
        <span className={cn("size-2.5 rounded-full", getClaimReviewSeverityDot(severity))} />
        {value}
      </p>
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

function formatMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });
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

function getClaimReviewSeverityRank(severity: ClaimReviewSeverity) {
  if (severity === "high") {
    return 3;
  }

  if (severity === "medium") {
    return 2;
  }

  return 1;
}

function getClaimReviewSeverityDot(severity: ClaimReviewSeverity) {
  if (severity === "high") {
    return "bg-red-500";
  }

  if (severity === "medium") {
    return "bg-amber-500";
  }

  return "bg-sky-500";
}

function getClaimReviewSeverityStyle(severity: ClaimReviewSeverity) {
  if (severity === "high") {
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200";
  }

  if (severity === "medium") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200";
  }

  return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200";
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const headers = rows[0] ? Object.keys(rows[0]) : ["message"];
  const csvRows =
    rows.length > 0
      ? rows
      : [{ message: "No rows for this export" }];
  const csv = [
    headers.join(","),
    ...csvRows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: unknown) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
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

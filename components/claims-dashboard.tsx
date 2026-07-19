"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

export function ClaimsDashboard({
  memberById,
  members,
  serviceEntries,
}: {
  memberById: Map<string, Member>;
  members: Member[];
  serviceEntries: ServiceEntry[];
}) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
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

  const filteredClaims = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return claims.filter((claim) => {
      if (statusFilter !== "All" && claim.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const memberName = memberById.get(claim.memberId)?.displayName ?? "";
      return memberName.toLowerCase().includes(normalizedQuery);
    });
  }, [claims, memberById, query, statusFilter]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = { Total: claims.length };

    for (const status of claimStatusOptions) {
      counts[status.value] = 0;
    }

    for (const claim of claims) {
      counts[claim.status] = (counts[claim.status] ?? 0) + 1;
    }

    return counts;
  }, [claims]);

  const lastFailedClaim = useMemo(() => {
    return claims
      .filter((claim) => claim.status.toLowerCase() === "failed")
      .sort((left, right) =>
        (right.lastAttemptedAt ?? "").localeCompare(left.lastAttemptedAt ?? "")
      )[0];
  }, [claims]);

  const pageCount = Math.max(1, Math.ceil(filteredClaims.length / claimsPageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleClaims = filteredClaims.slice(
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
          currentClaims.map((claim) => (claim.id === updatedClaim.id ? updatedClaim : claim))
        );
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
          [newClaim, ...currentClaims].sort((left, right) =>
            right.serviceDate.localeCompare(left.serviceDate)
          )
        );
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
      setClaims((currentClaims) =>
        currentClaims.filter((claim) => claim.id !== deleteTarget.id)
      );
      setDeleteTarget(null);
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
      setClaims((currentClaims) => {
        const claimsById = new Map(
          [...currentClaims, ...freshExistingClaims, ...newClaims].map((claim) => [
            claim.id,
            claim,
          ])
        );

        return Array.from(claimsById.values()).sort((left, right) =>
          right.serviceDate.localeCompare(left.serviceDate)
        );
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
          ) : filteredClaims.length === 0 ? (
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
                  <TableHead>Service date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Last attempted</TableHead>
                  <TableHead>Last failure</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleClaims.map((claim) => {
                  const claimMember = memberById.get(claim.memberId);

                  return (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">
                        {claimMember?.displayName ?? "Unknown member"}
                      </TableCell>
                      <TableCell>
                        {claimMember?.provider
                          ? getProviderLabel(claimMember.provider)
                          : "Not set"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {new Date(`${claim.serviceDate}T00:00:00`).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("gap-1.5", getClaimStatusStyle(claim.status).badge)}>
                          {claim.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{claim.attemptCount}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {claim.lastAttemptedAt
                          ? new Date(claim.lastAttemptedAt).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                        {claim.lastFailureReason || "—"}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Page {safePage + 1} of {pageCount}
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

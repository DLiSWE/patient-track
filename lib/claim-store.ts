export type Claim = {
  id: string;
  memberId: string;
  serviceDate: string;
  status: string;
  attemptCount: number;
  lastAttemptedAt: string | null;
  lastFailureReason: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClaimFormValues = {
  memberId: string;
  serviceDate: string;
  status: string;
  lastFailureReason: string;
};

export const claimStatusOptions = [
  { label: "Required", value: "Required" },
  { label: "Pending", value: "Pending" },
  { label: "Submitted", value: "Submitted" },
  { label: "Accepted", value: "Accepted" },
  { label: "Failed", value: "Failed" },
] as const;

export const defaultClaimStatus: string = claimStatusOptions[0].value;

export const claimStatusStyles: Record<string, { badge: string; dot: string }> = {
  required: {
    badge:
      "ring-1 ring-inset ring-violet-500 bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100",
    dot: "bg-violet-500",
  },
  pending: {
    badge:
      "ring-1 ring-inset ring-slate-500 bg-slate-200 text-slate-950 dark:bg-slate-800 dark:text-slate-100",
    dot: "bg-slate-500",
  },
  submitted: {
    badge:
      "ring-1 ring-inset ring-sky-500 bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
    dot: "bg-sky-500",
  },
  accepted: {
    badge:
      "ring-1 ring-inset ring-emerald-500 bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
    dot: "bg-emerald-500",
  },
  failed: {
    badge:
      "ring-1 ring-inset ring-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
    dot: "bg-amber-500",
  },
};

export function getClaimStatusStyle(status: string) {
  return claimStatusStyles[status.toLowerCase()] ?? claimStatusStyles.required;
}

export type ClaimRow = {
  id: string;
  member_id: string;
  service_date: string;
  status: string;
  attempt_count: number;
  last_attempted_at: string | null;
  last_failure_reason: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export function createEmptyClaimForm(memberId = "", serviceDate = ""): ClaimFormValues {
  return {
    memberId,
    serviceDate,
    status: defaultClaimStatus,
    lastFailureReason: "",
  };
}

export function mapClaimRow(row: ClaimRow): Claim {
  return {
    id: row.id,
    memberId: row.member_id,
    serviceDate: row.service_date,
    status: row.status,
    attemptCount: row.attempt_count,
    lastAttemptedAt: row.last_attempted_at,
    lastFailureReason: row.last_failure_reason,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toClaimInsert(values: ClaimFormValues) {
  const status = values.status || defaultClaimStatus;

  return {
    member_id: values.memberId,
    service_date: values.serviceDate,
    status,
    last_failure_reason:
      status.toLowerCase() === "failed" ? values.lastFailureReason.trim() || null : null,
    last_attempted_at: status.toLowerCase() === "failed" ? new Date().toISOString() : null,
    submitted_at: status.toLowerCase() === "submitted" ? new Date().toISOString() : null,
  };
}

export function toClaimUpdate(values: ClaimFormValues) {
  return {
    ...toClaimInsert(values),
    updated_at: new Date().toISOString(),
  };
}

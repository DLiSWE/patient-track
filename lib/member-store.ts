export type Member = {
  id: string;
  displayName: string;
  provider: string;
  serviceDays: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type MemberFormValues = Omit<
  Member,
  "id" | "createdAt" | "updatedAt" | "archivedAt"
>;

export const emptyMemberForm: MemberFormValues = {
  displayName: "",
  provider: "",
  serviceDays: "",
};

export const providerOptions = [
  { label: "Empire", value: "empire" },
  { label: "VCM", value: "vcm" },
  { label: "SWH", value: "swh" },
  { label: "HF", value: "hf" },
] as const;

export type MemberRow = {
  id: string;
  display_name: string;
  provider: string | null;
  service_days: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const serviceDayTokens = [
  { code: "su", aliases: ["su", "sun", "sunday"] },
  { code: "th", aliases: ["th", "thu", "thur", "thurs", "thursday"] },
  { code: "sa", aliases: ["sa", "sat", "saturday"] },
  { code: "m", aliases: ["m", "mon", "monday"] },
  { code: "t", aliases: ["t", "tu", "tue", "tues", "tuesday"] },
  { code: "w", aliases: ["w", "wed", "wednesday"] },
  { code: "f", aliases: ["f", "fri", "friday"] },
];

export function mapMemberRow(row: MemberRow): Member {
  return {
    id: row.id,
    displayName: row.display_name,
    provider: normalizeProvider(row.provider ?? ""),
    serviceDays: row.service_days ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function toMemberInsert(values: MemberFormValues) {
  return {
    display_name: normalizeMemberName(values.displayName),
    provider: normalizeProvider(values.provider) || null,
    service_days: normalizeServiceDays(values.serviceDays) || null,
  };
}

export function toMemberUpdate(values: MemberFormValues) {
  return {
    ...toMemberInsert(values),
    updated_at: new Date().toISOString(),
  };
}

export function normalizeServiceDays(serviceDays: string) {
  const normalized = serviceDays.toLowerCase().replace(/[^a-z]/g, "");

  if (!normalized) {
    return "";
  }

  if (normalized === "daily" || normalized === "everyday") {
    return "SUMTWTHFSA";
  }

  const compactCodes = parseCompactServiceDays(normalized);

  if (compactCodes.length > 0) {
    return compactCodes.join("").toUpperCase();
  }

  return serviceDays
    .toLowerCase()
    .replace(/\//g, " ")
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((token) => serviceDayTokens.find((day) => day.aliases.includes(token))?.code)
    .filter(Boolean)
    .join("")
    .toUpperCase();
}

export function getProviderLabel(provider: string) {
  return (
    providerOptions.find((option) => option.value === normalizeProvider(provider))
      ?.label ??
    provider.trim()
  );
}

export function getMemberDiscontinuedDate(member: Pick<Member, "archivedAt">) {
  return member.archivedAt?.slice(0, 10) ?? null;
}

export function isMemberActiveOnDate(
  member: Pick<Member, "archivedAt"> | null | undefined,
  serviceDate: string
) {
  if (!member) {
    return false;
  }

  const discontinuedDate = getMemberDiscontinuedDate(member);
  return !discontinuedDate || serviceDate <= discontinuedDate;
}

export function isDateAfterMemberDiscontinued(
  member: Pick<Member, "archivedAt"> | null | undefined,
  serviceDate: string
) {
  return Boolean(member && !isMemberActiveOnDate(member, serviceDate));
}

export function normalizeMemberName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .split(" ")
    .map(formatNamePart)
    .join(" ");
}

function normalizeProvider(provider: string) {
  return provider.trim().toLowerCase();
}

function formatNamePart(part: string) {
  return part
    .split(/([,-])/)
    .map((segment) => {
      if (segment === "," || segment === "-") {
        return segment;
      }

      return formatNameSegment(segment);
    })
    .join("");
}

function formatNameSegment(segment: string) {
  if (!segment) {
    return segment;
  }

  const suffix = segment.endsWith(".") ? "." : "";
  const body = suffix ? segment.slice(0, -1) : segment;

  if (body.length === 1) {
    return body.toUpperCase() + suffix;
  }

  return body.charAt(0).toUpperCase() + body.slice(1).toLowerCase() + suffix;
}

function parseCompactServiceDays(value: string) {
  const days: string[] = [];
  let remaining = value;

  while (remaining) {
    if (remaining.startsWith("su")) {
      days.push("su");
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("th")) {
      days.push("th");
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("sa")) {
      days.push("sa");
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("m")) {
      days.push("m");
      remaining = remaining.slice(1);
    } else if (remaining.startsWith("t")) {
      days.push("t");
      remaining = remaining.slice(1);
    } else if (remaining.startsWith("w")) {
      days.push("w");
      remaining = remaining.slice(1);
    } else if (remaining.startsWith("f")) {
      days.push("f");
      remaining = remaining.slice(1);
    } else if (remaining.startsWith("s")) {
      days.push("sa");
      remaining = remaining.slice(1);
    } else {
      return [];
    }
  }

  return days;
}

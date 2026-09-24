import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceEntry = {
  id: string;
  memberId: string;
  serviceDate: string;
  serviceLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type ServiceEntryFormValues = {
  memberId: string;
  serviceDate: string;
  serviceLabel: string;
};

export const serviceStatusOptions = [
  { label: "Attended", value: "Attended" },
  { label: "Medical", value: "Medical" },
  { label: "Hold", value: "Hold" },
  { label: "Vacation", value: "Vacation" },
] as const;

export const defaultServiceStatus: string = serviceStatusOptions[0].value;

export type ServiceEntryRow = {
  id: string;
  member_id: string;
  service_date: string;
  service_label: string;
  created_at: string;
  updated_at: string;
};

export const serviceEntrySelectColumns =
  "id, member_id, service_date, service_label, created_at, updated_at";
const serviceEntryFetchPageSize = 1000;
const latestServiceEntryFetchPageSize = 1000;

export function getTodayDate() {
  return new Date().toLocaleDateString("en-CA");
}

export function createEmptyServiceEntryForm(): ServiceEntryFormValues {
  return {
    memberId: "",
    serviceDate: getTodayDate(),
    serviceLabel: defaultServiceStatus,
  };
}

export function mapServiceEntryRow(row: ServiceEntryRow): ServiceEntry {
  return {
    id: row.id,
    memberId: row.member_id,
    serviceDate: row.service_date,
    serviceLabel: row.service_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchAllServiceEntries(supabaseClient: SupabaseClient) {
  return fetchServiceEntriesPageByPage(supabaseClient);
}

export async function fetchServiceEntriesInRange(
  supabaseClient: SupabaseClient,
  startDate: string,
  endDate: string
) {
  return fetchServiceEntriesPageByPage(supabaseClient, startDate, endDate);
}

async function fetchServiceEntriesPageByPage(
  supabaseClient: SupabaseClient,
  startDate?: string,
  endDate?: string
) {
  const rows: ServiceEntryRow[] = [];

  for (let from = 0; ; from += serviceEntryFetchPageSize) {
    const to = from + serviceEntryFetchPageSize - 1;
    let query = supabaseClient
      .from("service_entries")
      .select(serviceEntrySelectColumns)
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (startDate) {
      query = query.gte("service_date", startDate);
    }

    if (endDate) {
      query = query.lte("service_date", endDate);
    }

    const { data, error } = await query;

    if (error) {
      return { data: rows.map(mapServiceEntryRow), error };
    }

    const nextRows = data ?? [];
    rows.push(...nextRows);

    if (nextRows.length < serviceEntryFetchPageSize) {
      return { data: rows.map(mapServiceEntryRow), error: null };
    }
  }
}

export function toServiceEntryInsert(values: ServiceEntryFormValues) {
  return {
    member_id: values.memberId,
    service_date: values.serviceDate,
    service_label: values.serviceLabel || defaultServiceStatus,
  };
}

/**
 * Each member's most recent service entry across all time, read straight from
 * the database. The dashboards only keep the months they've loaded in memory,
 * so "last tracked as hold/medical" and the status-ending alerts can't be
 * derived from those -- a member whose last Hold was in an earlier month would
 * silently drop out. PostgREST embeds each member's service entries newest
 * first, limited to one, so this is a single request per page of members
 * rather than a scan of the whole table. (member_id, service_date) is unique,
 * so there is never a tie to break.
 */
export async function fetchLatestServiceEntryByMember(supabaseClient: SupabaseClient) {
  const latestByMember = new Map<string, ServiceEntry>();

  for (let from = 0; ; from += latestServiceEntryFetchPageSize) {
    const { data, error } = await supabaseClient
      .from("members")
      .select(`id, service_entries(${serviceEntrySelectColumns})`)
      .order("id", { ascending: true })
      .order("service_date", { ascending: false, referencedTable: "service_entries" })
      .limit(1, { referencedTable: "service_entries" })
      .range(from, from + latestServiceEntryFetchPageSize - 1);

    if (error) {
      return { data: latestByMember, error };
    }

    const rows = (data ?? []) as unknown as Array<{
      id: string;
      service_entries: ServiceEntryRow[] | null;
    }>;

    for (const row of rows) {
      const latestEntry = row.service_entries?.[0];

      if (latestEntry) {
        latestByMember.set(row.id, mapServiceEntryRow(latestEntry));
      }
    }

    if (rows.length < latestServiceEntryFetchPageSize) {
      return { data: latestByMember, error: null };
    }
  }
}

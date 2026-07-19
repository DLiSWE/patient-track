import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceEntry = {
  id: string;
  memberId: string;
  serviceDate: string;
  serviceLabel: string;
  createdAt: string;
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
};

const serviceEntrySelectColumns = "id, member_id, service_date, service_label, created_at";
const serviceEntryFetchPageSize = 1000;

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

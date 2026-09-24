import type { SupabaseClient } from "@supabase/supabase-js";

// Center-wide closed days (holidays etc.) -- see supabase-closed-days.sql.
export type ClosedDay = {
  serviceDate: string;
  reason: string | null;
  createdAt: string;
};

type ClosedDayRow = {
  service_date: string;
  reason: string | null;
  created_at: string;
};

const closedDaySelectColumns = "service_date, reason, created_at";

function mapClosedDayRow(row: ClosedDayRow): ClosedDay {
  return {
    serviceDate: row.service_date,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export async function fetchClosedDays(supabaseClient: SupabaseClient) {
  const { data, error } = await supabaseClient
    .from("closed_days")
    .select(closedDaySelectColumns)
    .order("service_date", { ascending: true });

  return {
    data: ((data ?? []) as ClosedDayRow[]).map(mapClosedDayRow),
    error,
  };
}

export async function addClosedDay(
  supabaseClient: SupabaseClient,
  serviceDate: string,
  reason: string
) {
  const { data, error } = await supabaseClient
    .from("closed_days")
    .insert({ service_date: serviceDate, reason: reason.trim() || null })
    .select(closedDaySelectColumns)
    .single();

  return {
    data: data ? mapClosedDayRow(data as ClosedDayRow) : null,
    error: error?.message ?? null,
  };
}

export async function removeClosedDay(supabaseClient: SupabaseClient, serviceDate: string) {
  const { data, error } = await supabaseClient
    .from("closed_days")
    .delete()
    .eq("service_date", serviceDate)
    .select("service_date");

  if (error) {
    return { error: error.message };
  }

  // RLS filters a non-manager's delete down to zero rows without raising an
  // error, so an empty result means nothing was actually reopened.
  if ((data ?? []).length === 0) {
    return { error: "This day could not be reopened. Only managers can change closed days." };
  }

  return { error: null };
}

export function getClosedDateSet(closedDays: ClosedDay[]) {
  return new Set(closedDays.map((closedDay) => closedDay.serviceDate));
}

export function formatClosedDayTitle(closedDay: ClosedDay | undefined) {
  return closedDay?.reason ? `Closed: ${closedDay.reason}` : "Closed for everyone";
}

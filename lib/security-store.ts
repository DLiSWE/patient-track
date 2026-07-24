import type { SupabaseClient } from "@supabase/supabase-js";

export type SecurityEvent = {
  id: string;
  eventType: string;
  attemptedEmail: string | null;
  attemptCount: number;
  lockedUntil: string;
  alertDay: string;
  userAgent: string | null;
  createdAt: string;
};

type SecurityEventRow = {
  id: string;
  event_type: string;
  attempted_email: string | null;
  attempt_count: number;
  locked_until: string;
  alert_day: string;
  user_agent: string | null;
  created_at: string;
};

const securityEventColumns =
  "id, event_type, attempted_email, attempt_count, locked_until, alert_day, user_agent, created_at";

export function mapSecurityEventRow(row: SecurityEventRow): SecurityEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    attemptedEmail: row.attempted_email,
    attemptCount: row.attempt_count,
    lockedUntil: row.locked_until,
    alertDay: row.alert_day,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

export async function fetchSecurityEvents(
  supabaseClient: SupabaseClient,
  options: { limit?: number; offset?: number } = {}
) {
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const { data, error, count } = await supabaseClient
    .from("security_events")
    .select(securityEventColumns, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return {
    data: (data ?? []).map(mapSecurityEventRow),
    count: count ?? 0,
    error,
  };
}

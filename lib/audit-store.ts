import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEntityType = "member" | "service" | "claim" | "security";

export type AuditEvent = {
  id: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  actorId: string | null;
  actorEmail: string | null;
  createdAt: string;
};

export type AuditEventRow = {
  id: string;
  action: string;
  entity_type: AuditEntityType;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  actor_id: string | null;
  actor_email: string | null;
  created_at: string;
};

export type AuditEventInput = {
  action: string;
  entityType: AuditEntityType;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  actorEmail?: string | null;
};

const auditEventSelectColumns =
  "id, action, entity_type, entity_id, summary, metadata, actor_id, actor_email, created_at";

export function mapAuditEventRow(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    metadata: row.metadata ?? {},
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    createdAt: row.created_at,
  };
}

export async function fetchAuditEvents(
  supabaseClient: SupabaseClient,
  limit = 100
) {
  const { data, error } = await supabaseClient
    .from("audit_events")
    .select(auditEventSelectColumns)
    .order("created_at", { ascending: false })
    .limit(limit);

  return {
    data: (data ?? []).map(mapAuditEventRow),
    error,
  };
}

export async function createAuditEvent(
  supabaseClient: SupabaseClient,
  input: AuditEventInput
) {
  const { error } = await supabaseClient.from("audit_events").insert({
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
    actor_email: input.actorEmail ?? null,
  });

  return { error };
}

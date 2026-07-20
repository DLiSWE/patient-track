import type { Session, SupabaseClient } from "@supabase/supabase-js";

export type AppRole = "user" | "manager" | "super_admin";

export type AppProfile = {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: AppRole;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AppProfileRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: AppRole;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

const appProfileColumns =
  "user_id, email, display_name, role, last_seen_at, created_at, updated_at";

export function mapAppProfileRow(row: AppProfileRow): AppProfile {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureOwnProfile(
  supabaseClient: SupabaseClient,
  session: Session
) {
  const userEmail = session.user.email ?? null;
  const displayName = userEmail?.split("@")[0] ?? null;

  const current = await supabaseClient
    .from("app_profiles")
    .select(appProfileColumns)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (current.error) {
    return { data: null, error: current.error };
  }

  if (current.data) {
    const touched = await touchOwnPresence(supabaseClient, session, {
      email: userEmail,
    });
    if (touched.error) {
      return { data: mapAppProfileRow(current.data), error: touched.error };
    }
    return fetchOwnProfile(supabaseClient, session);
  }

  const inserted = await supabaseClient
    .from("app_profiles")
    .insert({
      user_id: session.user.id,
      email: userEmail,
      display_name: displayName,
      role: "user",
      last_seen_at: new Date().toISOString(),
    })
    .select(appProfileColumns)
    .single();

  return {
    data: inserted.data ? mapAppProfileRow(inserted.data) : null,
    error: inserted.error,
  };
}

export async function fetchOwnProfile(
  supabaseClient: SupabaseClient,
  session: Session
) {
  const { data, error } = await supabaseClient
    .from("app_profiles")
    .select(appProfileColumns)
    .eq("user_id", session.user.id)
    .maybeSingle();

  return {
    data: data ? mapAppProfileRow(data) : null,
    error,
  };
}

export async function touchOwnPresence(
  supabaseClient: SupabaseClient,
  session: Session,
  options: { email?: string | null } = {}
) {
  const { error } = await supabaseClient
    .from("app_profiles")
    .update({
      email: options.email ?? session.user.email ?? null,
      last_seen_at: new Date().toISOString(),
    })
    .eq("user_id", session.user.id);

  return { error };
}

export async function fetchOnlineProfiles(
  supabaseClient: SupabaseClient,
  lookbackMinutes = 5
) {
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabaseClient
    .from("app_profiles")
    .select(appProfileColumns)
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false });

  return {
    data: (data ?? []).map(mapAppProfileRow),
    error,
  };
}

-- Optional query optimizations for the app's common read patterns.
-- Safe to run more than once.

create index if not exists members_display_name_idx
on public.members (display_name);

create index if not exists members_active_display_name_idx
on public.members (display_name)
where archived_at is null;

create index if not exists service_entries_service_date_created_at_idx
on public.service_entries (service_date desc, created_at desc);

create index if not exists service_entries_service_date_member_id_idx
on public.service_entries (service_date, member_id);

create index if not exists service_entries_updated_at_idx
on public.service_entries (updated_at desc);

create index if not exists claims_service_date_member_id_idx
on public.claims (service_date, member_id);

create index if not exists claims_member_id_service_date_idx
on public.claims (member_id, service_date desc);

create index if not exists claims_status_service_date_idx
on public.claims (status, service_date desc);

create index if not exists audit_events_entity_type_created_at_idx
on public.audit_events (entity_type, created_at desc);

create index if not exists security_events_created_at_event_type_idx
on public.security_events (created_at desc, event_type);

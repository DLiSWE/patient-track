create or replace view public.claims_with_member_details
with (security_invoker = true)
as
select
  c.id,
  c.member_id,
  m.display_name as member_name,
  m.provider,
  m.service_days,
  c.service_date,
  c.status,
  c.attempt_count,
  c.last_attempted_at,
  c.last_failure_reason,
  c.submitted_at,
  c.created_at,
  c.updated_at
from public.claims c
join public.members m on m.id = c.member_id;

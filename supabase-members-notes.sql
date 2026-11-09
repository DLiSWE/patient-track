-- Free-text operational notes shown on each member's profile page (the
-- Notes card). Editable by any app user who can update members; the
-- existing members RLS policies already cover it. Keep PHI lean: the UI
-- asks for operational notes only, not DOBs, IDs, auths, or diagnoses.
alter table public.members
add column if not exists notes text;

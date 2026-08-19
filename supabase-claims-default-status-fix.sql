-- claims.status still defaulted to 'Pending', a status the app stopped
-- recognizing once Claimed/Pending/Accepted/Failed were removed from
-- claimStatusOptions (see CHANGELOG). Every current insert path already sets
-- status explicitly, so this default was never actually hit -- but it's a
-- landmine for any future insert that omits it (including a manual row added
-- via the dashboard), silently producing a claim status/filters/counts can't
-- recognize. Match the column default to defaultClaimStatus in lib/claim-store.ts.
alter table public.claims
alter column status set default 'Required';

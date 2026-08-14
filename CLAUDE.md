# CLAUDE.md

## Project gist

This project is the Sophia Members web app.

- Next.js 16 + React 19
- Direct browser-to-Supabase client access
- Current tracked version: `2.2.0`
- Main surface: member management, service calendar tracking, claims visibility, and admin/security workflows

## Important areas

- `components/member-manager.tsx`: main application surface
- `components/service-calendar.tsx`: service-day calendar
- `components/claims-dashboard.tsx`: claims workflow UI
- `lib/supabase.ts`: browser Supabase client
- `middleware.ts` and `next.config.ts`: browser security headers / CSP
- `supabase-*.sql`: database schema and security rules

## Operating rules

- This app can expose only browser-safe secrets like the Supabase anon key.
- Never place the Supabase service-role key in frontend env vars.
- RLS is the real permission boundary; do not loosen it casually.
- Public signup should stay disabled unless there is an explicit reason to enable it.
- MFA and role-based access control are part of the intended security model.
- When changing setup, workflows, or security assumptions, update `README.md` and `CHANGELOG.md`.

## Security / data handling

- Browser security headers are intentional and should be preserved when possible.
- Prefer real validation over guessed security claims.
- Treat `supabase-role-based-access.sql` and `supabase-require-mfa.sql` as part of the production security story.
- Views and new tables should be reviewed for RLS impact before shipping.

## Workflow notes

- `app_profiles` tracks app users, not client/member records.
- Supabase Auth users do not automatically create `app_profiles` rows until the app flow creates them.
- New app users may need first login + MFA enrollment before they fully work under hardened policies.

## If you change things

- Keep docs current in:
  - `README.md`
  - `CHANGELOG.md`
- If a change affects security posture, mention it explicitly in the changelog.

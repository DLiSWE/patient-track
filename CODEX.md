# CODEX.md

## Quick context

This is the Sophia Members internal web app. It is a Next.js frontend that talks directly to Supabase with the browser client and depends heavily on correct RLS and auth setup.

Current version: `2.1.0`

## Core expectations

- Prefer security-preserving changes over convenience shortcuts.
- Assume browser code is public; only RLS, auth, and server-side secrets create real boundaries.
- Avoid broad UI rewrites unless they solve a real workflow problem.
- Keep the member-management workflow efficient for a small internal operator team.

## Files worth reading first

- `README.md`
- `CHANGELOG.md`
- `components/member-manager.tsx`
- `components/service-calendar.tsx`
- `lib/supabase.ts`
- `middleware.ts`
- `next.config.ts`
- `supabase-role-based-access.sql`
- `supabase-require-mfa.sql`

## Security guardrails

- Do not add the service-role key to any client-visible code or env.
- Keep Supabase RLS tight; `authenticated` should not mean broad access by default.
- MFA enforcement should be rolled out only after allowed users are ready for it.
- Keep security changes explicit and documented.

## Product guardrails

- `app_profiles` are app users; `members` are client/member records.
- Member creation/editing should keep working for allowed users even under hardened policies.
- Calendar, claims, and authorization UX are operational tools, so clarity matters more than novelty.

## Documentation rule

When notable changes land, update:

- `README.md` for setup and operator workflow
- `CHANGELOG.md` for feature/fix/security history

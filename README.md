# Sophia Members Web App

Internal Next.js app for managing Sophia member records, service calendars, claims tracking, and operator/admin workflows against Supabase.

Current tracked version: `2.1.0`

## Stack

- Next.js 16
- React 19
- Supabase client auth + database access
- Tailwind-based component styling

## Local development

Install dependencies and start the app:

```bash
npm install
npm run dev
```

Production build locally:

```bash
npm run build
npm run start
```

## Environment

This app expects browser-safe Supabase environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Do not place the Supabase service-role key in frontend environment variables.

## Security posture

- The app talks directly to Supabase from the browser, so RLS is the real access-control boundary.
- Public signup should be disabled in Supabase Auth unless explicitly needed.
- MFA enforcement and role-based access are tracked in the Supabase SQL files in this folder.
- Browser security headers and CSP are configured in `next.config.ts` and `middleware.ts`.

## Important SQL files

- `supabase-app-profiles.sql`
- `supabase-admin-security.sql`
- `supabase-role-based-access.sql`
- `supabase-require-mfa.sql`
- `supabase-claims.sql`
- `supabase-service-entries.sql`
- `supabase-audit-events.sql`
- `supabase-security-events.sql`

## Changelog

Project history is tracked in [CHANGELOG.md](./CHANGELOG.md). Keep it updated whenever behavior, security posture, or deployment assumptions change.

## Maintenance note

When we ship notable changes, update both:

- this README when setup, auth flow, or operational expectations change
- `CHANGELOG.md` when features, fixes, or security changes land

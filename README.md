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

The app now has:

- `/` for the post-login internal homepage
- `/workspace` for the full member-management workspace
- `/tools` for operational checks and shortcuts
- `/login` for direct sign-in

## Operator workflow

### Home

The post-login home page is a quick monthly snapshot. It shows configurable widgets for claim status, member status, monthly attendance, the attendance grid, and small internal extras. Use the month selector at the top to move the whole page between months.

### Workspace

The workspace is the main operating surface. The left sidebar opens:

- `Members`: member directory, member add/edit form, discontinued members, and recently changed members.
- `Services`: service calendar, bulk-fill attendance, recent service entries, weekend cleanup, and service-entry deletion tools for allowed roles.
- `Claims`: claim generation, claim review, provider batches, claim rows, claim editing, and claim exports.
- `Summary`: monthly service totals, attendance grid, expected-member views, and configurable summary widgets.
- `Audit`: security/admin event review for super admins.
- `Admin`: app-user role and presence management for super admins.

Internal shortcuts can open a workspace section directly with `/workspace?view=services`, `/workspace?view=claims`, `/workspace?view=summary`, and the other sidebar view names.

### Tools

The Tools page collects cross-checks that are useful before or after claim work.

The month selector uses the same `< Month Year >` pattern as the rest of the app. Changing the month refreshes all tools on the page.

`Required claims by month` shows claim rows still in `Required`, which means they have not been initialized by the claim bot yet.

- `Warning signs`: checks for operational mismatches in the selected month.
- `Attended, no claim`: an attended service entry exists but no claim row exists for the same member and date.
- `Claim, no attended service`: a claim row exists but there is no matching attended service entry for the same member and date.
- `Authorization gap`: an attended service date is after the member's `auth_expires_on` date.
- `Creation batches`: groups `Required` claims by provider and service date, matching how claim creation work is usually handled.
- `Member detail`: shows the same `Required` work grouped by member for follow-up.

`Closed days` is a month calendar for center-wide closures (holidays etc.). Managers and super admins click a weekday to close it for every member, optionally with a reason, and click it again to reopen. A closed day is treated like a weekend everywhere expected service days are worked out: the service calendar blocks it, and bulk fill, Continue holds, status extends, expected/missed counts, the attendance grid, and claim review all skip it. Closing a day never deletes anything: service entries or claims already recorded on it are kept, and the confirmation says how many there are so they can be removed from Services if needed. Requires `supabase-closed-days.sql`; until it's run, the card shows the load error and the rest of the app behaves as if there are no closed days.

### Claim Exports

The Claims page has several CSV exports:

- `Queue`: attended service dates that are ready to have required claims generated for the selected month.
- `Claims`: claim status rows for the selected month.
- `Attendance`: service-entry rows for the selected month.
- `All claims CSV`: full claim history across all months.

### Reset failed claims

Managers and super admins see a `Reset failed` button on the Claims page. It flips every claim currently marked `Failed` back to `Required` and clears its recorded failure reason, so a failed bot run can be re-queued in one step. The action spans all failed claims in the database, not just the selected month, and asks for confirmation first.

### Delete a week of claims

Managers and super admins also see a `Delete selected week` button in the Claims page's "Generate required claims" card. It permanently deletes every claim whose service date falls in the week of the "Week containing" date, no matter the claim status. Use it when claims were generated for the wrong week and the service-calendar "Reset selected range" leaves them behind (that reset only removes claims that still have an attended service entry in the range). Confirmation is required.

## Environment

This app expects browser-safe Supabase environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Do not place the Supabase service-role key in frontend environment variables.

Optionally, set `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` to enable hCaptcha bot protection on the sign-in form and the delete-member confirmation dialog. Without it, both flows work as before with no captcha step. The matching secret key is never an env var here -- it's configured in the Supabase dashboard (Authentication -> Attack Protection), which is what actually verifies the captcha token server-side.

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
- `supabase-closed-days.sql`

## Changelog

Project history is tracked in [CHANGELOG.md](./CHANGELOG.md). Keep it updated whenever behavior, security posture, or deployment assumptions change.

## Maintenance note

When we ship notable changes, update both:

- this README when setup, auth flow, or operational expectations change
- `CHANGELOG.md` when features, fixes, or security changes land

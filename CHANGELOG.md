# Changelog

All notable changes to the Sophia Members web app should be recorded here.

## [Unreleased]

## [2.3.0] - 2026-08-19

- Security: added hCaptcha bot protection to sign-in and delete-member confirmation, guarded by `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` so local/dev installs keep working without it.
- Security: expanded the CSP for hCaptcha scripts, styles, frames, and verification calls, including `frame-src` so the widget is not blocked by the app's default same-origin policy.
- Security: revoked the default PUBLIC execute grant on `is_app_user()` and `is_super_admin()`, matching Supabase Security Advisor guidance for SECURITY DEFINER functions. Re-run `supabase-app-profiles.sql` and `supabase-role-based-access.sql` for this to take effect in the database.
- Security: added an `is_manager()` role helper and aligned delete permissions across UI and RLS. Managers and super admins can delete claims/service entries; only super admins can hard-delete members.
- Fixed role-gated actions being visible to users who could not actually run them under RLS, including claim deletes, service-entry deletes, member delete, and the Audit view.
- Added `members.auth_expires_on`, a single coverage-expiration date written by the claims-v2 `sync-auths` command and read by the Service Calendar. The calendar now marks service days past that date as needing authorization attention.
- Added migration support for correcting `claims.status`'s database default from the removed `Pending` value to `Required`.
- Standardized the Claims tab around the current claim lifecycle: `Required`, `Created`, `Failed`, and `Validated`.
- Added `Failed` back to Claims filters, badges, colors, and stat cards so failed bot runs are visible instead of blending into normal Required claims.
- Fixed claim status counts so Failed claims no longer inflate the pending/in-progress bucket.
- Added a date filter to the Claims tab and a per-member "Delete all" action for clearing full claim history, with confirmation.
- Added per-day claim indicators to the landing-page attendance grid, including a red-ring state when a service day still needs a claim created.
- Rebuilt the post-login homepage around live Supabase data, with shared month navigation and selectable widgets for claim counts, hold/medical/vacation, monthly overview, attendance, K-pop, and the GGBae counter.
- Added reorderable and hideable homepage widgets, saved per browser.
- Added Summary-tab customization and an active-member attendance grid with member search.
- Added Members-tab status cards for On hold, Medical, and Vacation members, plus per-browser customization for visible cards.
- Removed the older Member status snapshot card after replacing it with the more focused status-card sections.
- Disabled Saturdays and Sundays in the service calendar and excluded weekends from expected-service-date calculations app-wide.
- Added a "Cleanse weekends" tool to remove stray weekend service entries already saved.
- Replaced "Reset month" with "Reset selected range", using the Bulk Fill date range and refreshing safely across month boundaries.
- Added an opt-in Service Calendar save option to delete claims for dates changed off Attended, even if a claim was already created.
- Replaced the flat member-profile attendance badge list with a color-coded month calendar using the same status colors as the rest of the app.
- Fixed the shared ScrollArea component so wrapped content actually clips and scrolls.
- Fixed Firefox month/date picker problems by validating month values and using date inputs where Firefox does not support `input type="month"`.
- Fixed Firefox dialog date pickers by replacing transform-based centering with flexbox centering.
- Cleaned up `eslint .` to pass with zero problems.

## [2.2.0] - 2026-08-14

- Added a dedicated post-login homepage at `/` and moved the full member-management app surface to `/workspace`.
- Added a homepage grid showing five currently popular K-pop songs as a playful internal touch.
- Switched the homepage K-pop grid from a static snapshot to a live Spotify Korea fetch with a women-groups filter and fallback songs.
- Made homepage K-pop song cards open their Spotify source in a new tab, with search-link fallback behavior.
- Added a members-tab status snapshot section that groups current-month Hold, Medical, and Vacation members.
- Added a Home button to the dashboard header so any view can jump back to the Members directory.
- Fixed month/period pickers (Services, Summary, Claims, member profile) never showing a calendar in Firefox, since Firefox does not support `input type="month"`; they now use `type="date"` internally with the existing month/year normalization helpers.
- Fixed Firefox failing to open the native date picker for date fields inside dialogs (e.g. "Discontinue after"), caused by CSS transform-based dialog centering; dialogs now center with flexbox instead.

## [2.1.0] - 2026-08-09

- Added authorization month tracking UI with payer filtering and provider-aware row presentation.
- Added claim-created indicators to the service calendar so service expectations and claim status can be compared visually.
- Added member/auth sync workflow support alongside the local automation tooling.
- Added browser security hardening via CSP and related response headers, validated against a production build.
- Added role-based Supabase RLS migration work and MFA enforcement SQL for protected tables.
- Clarified owner-only hardening flow for Supabase auth users, app profiles, and MFA rollout.

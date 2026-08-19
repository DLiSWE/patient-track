# Changelog

All notable changes to the Sophia Members web app should be recorded here.

## [Unreleased]

- Added hCaptcha bot protection to the sign-in form and the delete-member confirmation dialog, gated behind `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` so it stays a no-op until that's configured; widget is centered in both spots.
- Security: extended the CSP to allow hCaptcha's script, iframe, and verification calls (`script-src`, `style-src`, `connect-src`, and a new `frame-src`, which didn't exist before and was blocking all iframes by falling back to `default-src 'self'`) so the widget above isn't silently blocked in production.
- Security: revoked the default PUBLIC execute grant on `is_app_user()` and `is_super_admin()` (SECURITY DEFINER functions used throughout RLS), since every policy that calls them already runs `to authenticated` and anon never needed direct execute access. Flagged by the Supabase Security Advisor as "Public Can Execute SECURITY DEFINER Function"; requires re-running `supabase-app-profiles.sql` and `supabase-role-based-access.sql` against the database for the grant change to take effect.
- Added an Attendance grid to the Summary tab showing every active member's daily status for the month, with member search.
- Added a Customize control to the Summary tab for showing/hiding its cards (claim status, attendance grid, calendar), saved per browser.
- Added On hold / Medical / Vacation status cards to the Members tab, driven by each member's most recently recorded service, with a configurable page size.
- Removed the older Member status snapshot card, superseded by the cards above.
- Added a Customize control to the Members tab for showing/hiding its cards (status cards, Directory, Add member, New & updated members, Discontinued members), saved per browser.
- Added a Home link to the top of the sidebar nav for jumping back to `/` from any tab.
- Added a date filter to the Claims tab alongside the existing member search and status filter.
- Added a "Delete all" action per member on the Claims tab to clear their full claim history (not just the loaded month), with a confirmation dialog.
- Disabled Saturdays and Sundays in the interactive service calendar and excluded them from every expected-service-date calculation app-wide, since the business no longer operates those days.
- Added a "Cleanse weekends" tool to bulk-remove stray weekend service entries already on file.
- Added an opt-in checkbox on Service Calendar save to also delete claims for dates changed off Attended even if the claim already went to the payer; previously only Required/Pending claims were auto-removed.
- Replaced "Reset month" with "Reset selected range" on the Service Calendar, reusing the Bulk Fill date range instead of always wiping the whole calendar month, with cross-month-safe refresh.
- Replaced the flat attendance badge list on the member profile page with a color-coded month calendar, matching the status colors used elsewhere in the app.
- Rebuilt the landing page (`/`) to pull live Supabase data (members, service entries, claims) with a shared month selector (prev/next and jump), instead of a static page.
- Added selectable, reorderable widgets to the landing page: claim status counts, On hold/Medical/Vacation, a day-by-day monthly overview, an attendance grid, the K-pop chart, and the GGBae counter, each saved per browser via a Customize control.
- Added pagination (with configurable page size and first/±5/±1/last navigation), an expand-to-full-height toggle, a member search box with a status filter, and a per-day claim-status indicator (corner dot for claim status, red ring when a claim still needs to be created) to the landing page's attendance grid.
- Fixed the shared ScrollArea component, which was missing the CSS and structural `Content` wrapper needed to actually clip and scroll its content.
- Removed the Claimed, Pending, Accepted, and Failed claim statuses from the Claims tab (status options, stat cards, filters, badges), along with the "Reset failed claims" retry action, "Last failure" alert, and failed-claim review item that were built around them, since none of them were being tracked; Required, Created, and (see below) Validated are the only statuses left.
- Renamed the "Submitted" claim status to "Validated", intended to be set by the bot's new Validate feature once it confirms a claim cleared on the payer portal.
- Fixed the claims-tab stat card row, which was still sized for 7 cards after the status cleanup above and left a large empty gap; it now fits the remaining 4 evenly.
- Fixed a Postgres "date/time field value out of range" error caused by a malformed month value (e.g. Firefox's `<input type="month">` allowing the spinner to underflow past January to "00") reaching a Supabase date-range query; month values are now validated/normalized both where they're set and where they're turned into dates.

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

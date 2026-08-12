# Changelog

All notable changes to the Sophia Members web app should be recorded here.

## [Unreleased]

- Added a dedicated post-login homepage at `/` and moved the full member-management app surface to `/workspace`.
- Added a homepage grid showing five currently popular K-pop songs as a playful internal touch.
- Switched the homepage K-pop grid from a static snapshot to a live Spotify Korea fetch with a women-groups filter and fallback songs.
- Made homepage K-pop song cards open their Spotify source in a new tab, with search-link fallback behavior.

## [2.1.0] - 2026-08-09

- Added authorization month tracking UI with payer filtering and provider-aware row presentation.
- Added claim-created indicators to the service calendar so service expectations and claim status can be compared visually.
- Added member/auth sync workflow support alongside the local automation tooling.
- Added browser security hardening via CSP and related response headers, validated against a production build.
- Added role-based Supabase RLS migration work and MFA enforcement SQL for protected tables.
- Clarified owner-only hardening flow for Supabase auth users, app profiles, and MFA rollout.

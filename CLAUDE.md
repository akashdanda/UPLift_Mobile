# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start               # Start Expo dev server (Expo Go or dev client)
npm run ios             # Run on iOS simulator
npm run android         # Run on Android emulator
npm run web             # Run web build
npm run lint            # Run ESLint (expo lint)

# EAS production builds
npm run build:ios           # Production iOS (App Store)
npm run build:ios:preview   # Preview iOS (internal distribution)
npm run build:ios:dev       # Dev client iOS build
```

No test suite exists in this project.

## Architecture Overview

**UPLIft** is a mobile fitness social app built with Expo (React Native) + TypeScript + Supabase.

### Routing
Expo Router (file-based). The root layout (`app/_layout.tsx`) uses `<Stack.Protected guard={isLoggedIn}>` to split auth vs. authenticated flows. Authenticated users land on a 4-tab layout (`app/(tabs)/`): Feed, Leaderboard, Map, Profile. All other screens are stack modals pushed on top.

### Auth & Session
`providers/auth-provider.tsx` wraps the entire app and is the single source of truth for session state. It exposes via `AuthContext` (consumed via `hooks/use-auth-context.ts`):
- Phone OTP auth (Supabase default)
- Google / Apple OAuth (`lib/auth-oauth.ts`)
- Streak calculation (computed on every `fetchProfile()` call — walks backward from today, rest days pause but don't break a streak)
- `refreshProfile()` — call after any action that mutates user data

Session tokens are persisted in the iOS/Android keychain via Expo SecureStore.

### API Layer (`lib/`)
All Supabase queries live in `lib/`. Each file maps to a domain:
- `feed.ts` — friend + global workout feed
- `friends.ts` — send/accept/list friend requests
- `duels.ts` — 1v1 challenge lifecycle (create, accept, auto-grade by workout count)
- `gym-service.ts` — gym queries (OSM/Overpass data stored in Supabase)
- `presence-service.ts` — real-time gym presence / location sharing
- `leaderboard.ts` / `leaderboard-snapshots.ts` — rankings + historical snapshots
- `levels.ts` — XP system
- `comments.ts` / `reactions.ts` — social interactions on workouts
- `push-notifications.ts` — Expo push token registration + send helpers
- `uplift-map-leaflet-html.ts` — generates the full Leaflet HTML string injected into the map WebView

### Database (`supabase/`)
Supabase (Postgres). Migrations are in `supabase/migrations/` (52+ files, versioned by timestamp). Key tables:
- `profiles` — user metadata, streak, goals, push token, location_visible
- `workouts` — workout_type (cardio/strength/sport/rest), gym_id (required as of Apr 2026), visibility (friends|public), image_url, secondary_image_url
- `friendships` — requester_id, addressee_id, status (pending|accepted)
- `duels` — challenger_id, opponent_id, type, duration_days, status
- `workout_comments` — supports nested threads via parent_id (added Apr 11 2026)
- `workout_reactions` — emoji reactions per workout per user
- `gyms` — OSM-sourced gym records with lat/lng
- `gym_presence` — check-in coordinates + location_visible per user

Edge Functions in `supabase/functions/`:
- `send-daily-reminders` — cron-based morning/evening workout nudges
- `send-event-push` — event-driven (friend requests, duel invites, comments)
- `send-workout-nudge` — fires when a friend posts a workout

### Map Screen
The map (`app/(tabs)/map.tsx`) uses a `WebView` rendering Leaflet.js. The entire HTML/JS for the map is generated in `lib/uplift-map-leaflet-html.ts` and injected as a string. Gym data is fetched from Supabase (sourced from OSM). Check-in radius is 250 ft (~76 m) from gym centroid. Gym name lookups are cached client-side in `lib/gym-label-cache.ts`.

### Theming
Brand violet palette defined in `constants/theme.ts`. Dark/light mode respects system setting via `hooks/use-color-scheme.ts` (with a `.web.ts` variant). The React compiler is enabled (`experimentalReactCompiler: true` in app.json).

### Environment
Supabase credentials are in `.env`:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

EAS build profiles (development / preview / production) are in `eas.json`. Version auto-increments on production builds. OTA updates use Expo Updates tied to `runtimeVersion`.

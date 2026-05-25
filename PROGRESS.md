# Salty Mobile — Feature Progress Tracker

> Last updated: May 25, 2026
> Track feature completion as you ship each item.

---

## ✅ Shipped

| Feature | Files changed | Date |
|---------|--------------|------|
| Friend Activity Feed | `lib/useFriendActivity.ts` (new), `app/(tabs)/friends.tsx` | 2026-05-25 |
| Setlist Photo Sharing | `app/event-details.tsx` — ViewShot capture + SetlistShareCard | 2026-05-25 |
| Music Export (Spotify / Apple Music / YouTube) | `lib/useSpotifyExport.ts`, `lib/musicDeepLinks.ts`, `supabase/functions/spotify-export/` | prior |
| Help & Privacy screens | `app/help.tsx`, `app/privacy.tsx` | prior |
| Account deletion (Edit Profile) | `app/edit-profile.tsx` | prior |
| Scan ticket (AI) | `app/scan-ticket.tsx`, `app/review-imports.tsx`, `supabase/functions/scan-photo/` | prior |
| Gmail email import | `app/settings.tsx`, `supabase/functions/scan-gmail/` | prior |
| Friends system | `app/(tabs)/friends.tsx`, `app/user-profile.tsx`, `lib/useFriends.ts` | prior |
| Setlist auto-fetch | `supabase/functions/setlist-lookup/` | prior |
| Following artists/teams | `app/following.tsx`, `lib/useFollowedArtists.ts` | prior |

---

## 📊 Progress Summary

| Sprint | Done | Total |
|--------|------|-------|
| Sprint 2 | 0 | 8 |
| Sprint 3 | 3 | 6 |
| Sprint 4 | 0 | 1 |
| **Total** | **3** | **15** |

---

## 🟣 Sprint 2 — Next Up

- [ ] **1. Wire database to all screens** `Critical` `High effort`
  - Replace hardcoded seed data on Home, Calendar, Profile, and Tickets with live Supabase queries
  - Blocker for everything else — app is running on fake data today

- [ ] **2. Fix trending-events edge function** `Critical` `Med effort`
  - Discover screen shows empty trending section because edge function is missing
  - Wire Ticketmaster API to serve real trending events by location

- [ ] **3. Fix event-details edge function** `Critical` `Low effort`
  - App crashes at runtime when tapping a Discover event
  - Fetch full event data from Ticketmaster by event ID
  - Ticketmaster key already in .env

- [ ] **4. Wire Calendar to Supabase tickets** `Critical` `Low effort`
  - Currently shows hardcoded Taylor Swift / Lakers mock array
  - Replace with real Supabase tickets query for the logged-in user

- [ ] **5. Shareable Year in Live recap card** `Critical` `Low effort`
  - Spotify Wrapped-style card: concerts, sports, cities, money spent
  - Data already exists in Supabase — just needs aggregation + shareable UI
  - Gigvault already shipping this — time-sensitive

- [ ] **6. Songkick history import (CSV one-click)** `High` `Low effort`
  - 15M+ Songkick users are looking to leave after Suno AI acquisition
  - Parse CSV export from Songkick and insert into user_tickets
  - Time-sensitive acquisition opportunity

- [ ] **7. Persist saved events to Supabase** `High` `Low effort`
  - SavedEventsContext is in-memory only — data lost on every app restart
  - Wire heart toggle to the saved_events Supabase table
  - Table schema already designed

- [ ] **8. Build out confirmed.tsx post-email screen** `Medium` `Low effort`
  - Currently a stub — blank screen after email confirmation
  - Add welcome animation and CTA to tickets screen
  - First impression after signup — reduces drop-off

---

## 🟢 Sprint 3 — Enrichment

- [x] **9. GPS venue check-in + venue badges** `High` `Med effort`
  - ~~Auto-detect when user is at a venue and prompt check-in~~
  - ~~expo-location already installed~~
  - ~~Afterglow is building this in early access — ship first at full scale~~

- [x] **10. Setlist.fm live integration** `High` `Low effort`
  - ~~Event detail screen shows MOCK_SETLIST today~~
  - ✅ Shipped via `supabase/functions/setlist-lookup/`

- [x] **11. Artist / team follow + push notification alerts** `High` `Med effort`
  - ~~Follow artists or sports teams from ticket history~~
  - ✅ Shipped via `app/following.tsx`, `lib/useFollowedArtists.ts`

- [ ] **12. Memories photo upload → Supabase Storage + memories table** `High` `Med effort`
  - Memories screen currently shows seed data
  - Create memories table and storage bucket
  - Wire expo-image-picker upload to Supabase Storage
  - Feeds into Reels content

- [x] **13. QR / photo ticket scan via Gemini OCR** `High` `Med effort`
  - ✅ Shipped via `app/scan-ticket.tsx`, `supabase/functions/scan-photo/`

- [ ] **14. Profile stats from real ticket data** `Medium` `Med effort`
  - Shows, Venues, Cities, Crew counts all hardcoded today
  - Year in Live bar chart and Taste DNA also using fake data
  - Replace with live Supabase aggregation queries
  - Feeds into Wrapped feature

---

## 🟠 Sprint 4 — Launch Polish

- [ ] **15. Offline / local cache layer** `Medium` `High effort`
  - Venues often have poor signal — tickets must be accessible offline
  - Graceful degradation without connection
  - Cache recent tickets locally using expo-secure-store or MMKV
  - Required for a strong App Store rating

---

## 🔐 Pre-Launch Security Checklist

- [ ] Add `.env` to `.gitignore` (real keys currently committed)
- [ ] Create `.env.example` with blank placeholder values
- [ ] Rotate all API keys that have been exposed in git history
- [ ] Verify `SUPABASE_SERVICE_KEY` is server-only (never bundled in app)
- [ ] Create iOS OAuth client ID for Gmail on iOS
- [ ] Create Android OAuth client ID for Gmail on Android
- [ ] Expand Google OAuth from test mode (currently only r.boyapati@saltydigital.ai)

---

## 🏪 App Store Checklist

- [ ] Set production version/buildNumber/versionCode in app.json
- [ ] Run TypeScript `--noEmit` check clean
- [ ] Generate EAS credentials (iOS provisioning profile, cert, Android keystore)
- [ ] Create App Store Connect app record
- [ ] Create Google Play Console app record
- [ ] Write store listing (description, keywords, screenshots, privacy policy URL)
- [ ] Confirm Apple Developer account active ($99/yr)
- [ ] Confirm Google Play Developer account active ($25 one-time)

---

## 🐛 Code Debt

- [ ] Delete or fix `components/tickets/TicketCard.tsx` (unused, type mismatch)
- [ ] Delete or fix `components/ui/SaltyButton.tsx` (unused stub)
- [ ] Add loading skeletons to all data-fetching screens
- [ ] Add error boundary at root layout
- [ ] Phone number field validation in Sign Up

---

*Generated by Salty competitive analysis · r.boyapati@saltydigital.ai*

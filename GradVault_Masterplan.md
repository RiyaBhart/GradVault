# GradVault
### A time-capsule letters & photos app for friends — FYP Masterplan

Prepared for: FAST NUCES Final Year Project | Stack: FastAPI + PostgreSQL + React (no Docker — run natively)

---

## 1. Concept Overview

Friends write letters to each other daily, adding one entry at a time to a growing thread. Every day they can also snap a live photo through the camera. Nothing — no letter, no photo — is visible to anyone until a single global unlock date that you fix in advance. Even after that date, each entry has its own lock: a passcode the recipient must guess, or a riddle the sender wrote for them. Threads can be one-on-one or group, and the whole thing is wrapped in a playful skin: nicknames, stickers, sealed-envelope and Polaroid-style reveal animations.

Everyone has a `@username` and a display nickname. Threads are formed by **invite link/code**, not public search — see Section 3.

---

## 2. Additional Feature Suggestions

Beyond what's already scoped (pair/group threads, dual lock types, global unlock date, live camera capture, background music), here are extras worth considering, grouped by effort:

**Low effort, high charm**
- Streak tracker — a small flame/heart icon counting consecutive days someone has written, Duolingo-style. Cheap to build (just a count on the user row) and reinforces the "write every day" habit.
- Sealed-envelope / Polaroid-developing reveal animation — a CSS/Framer Motion transition when an entry unlocks. The single highest-impact visual for demo day.
- Countdown landing page — the first thing anyone sees pre-unlock: a big countdown timer, so the site feels alive before the big day.
- Roman-Urdu / Urdu font support in the letter editor — relevant since your friend group will likely mix English and Urdu. A Noto Nastaliq Urdu web font handles this cheaply.
- Mood/paper themes — let the sender pick a paper texture or ink colour per letter (stored as an enum, purely cosmetic).

**Medium effort, strong payoff**
- Sticker/doodle overlay on photos — a canvas layer where the sender can scribble or drop stickers on their daily photo before it's locked away. Reuses the same canvas needed for camera capture.
- Per-person unlock in group threads — show which members have already solved their lock and which are still "sealed," so there's shared suspense on unlock day.
- Keepsake export — once unlocked, let users export a thread as a PDF or single scrollable image (letters + photos in order) to actually keep.

**Higher effort, optional / stretch goals**
- Push or email reminder — "you haven't written today" nudge. Needs a scheduler (cron / Celery beat) and an email or web-push provider; treat as a stretch goal after the core flow works.
- Voice notes — record a short audio message alongside the photo/letter, same lock rules apply. Technically similar to the photo pipeline (record → upload → locked storage → authenticated playback).

---

## 3. Sharing & Connecting: Invite Links (Option B)

Usernames exist for identity and display (`@riya`, nicknames, mentions), but thread creation does **not** rely on public search or discovery — appropriate for a small, closed friend group and consistent with the app's "nothing is visible until it's meant to be" spirit.

**How it works:**
1. A user creates a thread (pair or group) and generates an invite — a short code or link (`/join/AB3XQ2`).
2. They share that link/code directly (WhatsApp, in person, etc.) — there's no in-app directory to search.
3. The friend opens the link, signs up or logs in, and is automatically added to that thread.
4. Invite codes can optionally expire or be limited to a number of uses (useful for group threads with a fixed friend list).

This keeps the build small — one extra table and two routes — while avoiding a "can strangers find me" surface entirely.

**Schema addition:**

| Table | Key Columns | Notes |
|---|---|---|
| `thread_invites` | `id, thread_id, code, created_by, expires_at, max_uses, use_count` | One row per generated invite link |

**Route additions:**

| Method & Path | Purpose | Lock-checked? |
|---|---|---|
| `POST /threads/{id}/invite` | Generate an invite code/link for a thread | No (creator only) |
| `POST /invites/{code}/accept` | Join the thread tied to a valid, unexpired code | No |

---

## 4. Live Camera Capture

Photos are taken live through the camera, not uploaded from the gallery — this is what gives the site its authenticity ("this is what your day actually looked like"), and it's a good technical talking point for your defence.

**How it works:**
1. Request camera access with `navigator.mediaDevices.getUserMedia({ video: { facingMode } })` — `facingMode` toggles front/back so it works naturally on phones.
2. Stream the video into a `<video>` element for a live preview, with a shutter button and optional 3-2-1 countdown.
3. On capture, draw the current frame onto a hidden `<canvas>`, then `canvas.toBlob('image/jpeg', quality)` — no gallery picker involved, so the photo can only be "right now."
4. Show a retake/confirm step before upload, since live capture has no do-over otherwise.
5. Upload the blob via `multipart/form-data` to a locked-by-default endpoint; the server never returns a public URL, only an authenticated, lock-checked one.

*Fallback note: laptops/desktops without a webcam will fail `getUserMedia`. Decide early whether you accept a file-picker fallback there, or treat "live-camera-only" as a deliberate constraint you defend in your writeup.*

---

## 5. Background Music on Letters

The letter-writer picks a song, and it plays the moment the recipient's lock opens. The key design decision: don't host or download the actual audio files yourself.

**Why embed instead of upload/host**
- Downloading and re-serving copyrighted songs would put real audio files on your server — a licensing problem and unnecessary storage cost. You don't need the bytes, just the ability to play the track.
- Store only a reference — the YouTube video ID — and use YouTube's official IFrame Player API to play it. You're embedding YouTube's player the way any website is allowed to, not redistributing content.

**How it works**
1. When writing a letter, the sender pastes a YouTube link (or searches inline via the YouTube Data API v3, which has a generous free daily quota).
2. Extract the 11-character video ID via regex and store it, plus an optional start-time offset and volume, on the entry.
3. Once the entry unlocks, mount a hidden YouTube IFrame Player and call `player.playVideo()` at the stored offset.
4. Autoplay-with-sound needs a user gesture in modern browsers — the recipient's own click to open/solve the lock counts as that gesture.

**Fallback:** if a video is taken down or region-blocked, catch the player error and show a small "original song unavailable" note rather than blocking the letter's content. For something that can never disappear, consider a small bundled royalty-free track library (e.g. via Pixabay Music's free API) as an alternative to a YouTube link.

---

## 6. Database Schema (PostgreSQL)

| Table | Key Columns | Notes |
|---|---|---|
| `users` | `id, username, nickname, avatar_sticker, password_hash, streak_count` | One row per person |
| `threads` | `id, type (pair/group), title, created_by` | A conversation between 2+ people |
| `thread_members` | `thread_id, user_id, joined_at` | Many-to-many join table |
| `thread_invites` | `id, thread_id, code, created_by, expires_at, max_uses, use_count` | Invite-link based joining (Section 3) |
| `entries` | `id, thread_id, author_id, entry_type (letter/photo), text_content, media_key, created_at` | `media_key` points to locked storage, never a public URL |
| `entry_locks` | `id, entry_id, lock_type (passcode/riddle), passcode_hash, riddle_question, riddle_answer_hash` | One lock config per entry |
| `entry_unlocks` | `entry_id, user_id, unlocked_at` | Tracks who has solved which lock (matters for group threads) |
| `entry_songs` | `entry_id, youtube_video_id, start_seconds, volume` | Optional, one-to-one with a letter entry |
| `site_config` | `unlock_date` | Single global row you set once |

---

## 7. FastAPI Route List

| Method & Path | Purpose | Lock-checked? |
|---|---|---|
| `POST /auth/signup`, `/auth/login` | Account creation, JWT issue | No |
| `POST /threads` | Create pair or group thread | No |
| `POST /threads/{id}/invite` | Generate an invite code/link | No (creator only) |
| `POST /invites/{code}/accept` | Join a thread via invite code | No |
| `GET /threads/{id}` | List entries in a thread (metadata only pre-unlock) | Yes — date gate |
| `POST /threads/{id}/entries/letter` | Add a daily letter entry + optional lock + optional song | No (write) |
| `POST /threads/{id}/entries/photo` | Upload a live-captured photo blob | No (write) |
| `GET /entries/{id}/content` | Return actual text/photo bytes | Yes — date + guess lock |
| `POST /entries/{id}/unlock` | Submit passcode guess or riddle answer | Yes — date gate first |
| `GET /entries/{id}/song` | Return YouTube video ID + offset for the player | Yes — date + guess lock |
| `GET /site/config` | Return the global unlock date + server time (for countdown) | No |
| `PATCH /site/config` | Set the global unlock date (you, once) | Admin only |

---

## 8. Frontend Structure (React)

- **Pages:** Login/Signup · Join via Invite · Threads list · Thread view (timeline) · Countdown landing · Unlock/reveal view
- **Components:** LetterComposer, CameraCapture, LockPicker (passcode/riddle toggle), SongPicker, GuessLockModal, InvitePanel, CountdownTimer, RevealAnimation, StickerPicker, StreakBadge
- **State:** keep entry content out of global state entirely until the unlock endpoint actually returns it — don't fetch-and-hide client-side, since that defeats the whole point of the server-side lock.

---

## 9. Week-by-Week Build Plan (Cline Prompts)

Each week is sized to hand directly to Cline as a scoped prompt. Build and demo one vertical slice at a time rather than all backend then all frontend.

**Week 1 — Foundations**
> Scaffold a FastAPI + PostgreSQL backend and a Vite + React frontend as a simple monorepo (no Docker — plain `venv` + `uvicorn` for the backend, `npm run dev` for the frontend, PostgreSQL running locally). Include a `.env.example` and a short `README` with the exact setup commands. Implement signup/login with JWT auth, and a `users` table with username, nickname, avatar_sticker, password_hash. Add a minimal React login/signup form.

**Week 2 — Threads, Invites & Daily Letters**
> Add `threads`, `thread_members`, and `thread_invites` tables supporting pair and group types. Build `POST /threads`, `POST /threads/{id}/invite`, and `POST /invites/{code}/accept` for joining via invite link/code. Build `POST /threads/{id}/entries/letter`. Entries are always created locked (no content returned) regardless of date. Build a React LetterComposer, an InvitePanel to generate/share codes, and a thread timeline showing locked placeholders.

**Week 3 — Live Camera Capture**
> Add a CameraCapture React component using getUserMedia and canvas.toBlob for live photo capture with front/back toggle and retake step. Add `POST /threads/{id}/entries/photo` storing the blob outside any public directory, referenced by `media_key`.

**Week 4 — Global Unlock Date & Guess Locks**
> Add `site_config` with a single `unlock_date` row and `GET /site/config` for a countdown component. Add `entry_locks` (passcode/riddle) and `entry_unlocks` tables. Implement `POST /entries/{id}/unlock` with bcrypt for passcodes and fuzzy string matching (difflib) for riddle answers, gated by both the global date and per-user unlock state.

**Week 5 — Reveal Experience**
> Build `GET /entries/{id}/content` that only returns text/photo bytes once both the date gate and the user's `entry_unlocks` row pass. Build the sealed-envelope-opening / Polaroid-developing reveal animation in React for when this succeeds.

**Week 6 — Background Music**
> Add `entry_songs` (youtube_video_id, start_seconds, volume). Build a SongPicker that accepts a pasted YouTube URL, extracts the video ID via regex, and previews it. On reveal, mount a hidden YouTube IFrame Player and call playVideo() at the stored offset, with a graceful fallback message if playback fails.

**Week 7 — Decoration & Delight**
> Add nickname display throughout, a sticker picker overlay for photos, paper/ink themes for letters, and a `streak_count` badge that increments when a user posts on consecutive days.

**Week 8 — Polish & Deploy**
> Write a GitHub Actions workflow that runs backend tests and lints the frontend on push. Add a deployment README for running the FastAPI app on Render/Railway (native Python runtime, no Docker) and the React build on Vercel/Netlify, plus a managed Postgres instance (Render/Railway/Supabase free tier). Do a full pass on empty states, loading states, and mobile camera permissions handling.

---

## 10. Honest Limitations (for your FYP writeup)

- Locks add fun friction, not real security — the plaintext eventually sits in your database. Anyone with DB access before the unlock date could see it. Fine for a sentimental student project; worth one disclosure sentence in your report, not a real threat model.
- Live-camera-only capture will fail on desktops/laptops without a webcam — pick and state a fallback policy before building the UI.
- YouTube-embedded songs depend on the video staying up and not being region-blocked; you're trading full control for zero copyright/storage burden, which is the right trade for a project like this, but it should be a named decision in your report, not a surprise bug.
- Group-thread locks (each member unlocking independently) add real complexity to both schema and UI — budget Week 4–5 time accordingly and consider shipping pair-threads first, group as a stretch goal, if time runs short.
- Invite-link joining means anyone with the link/code can join within its validity window — fine for a trusted friend circle, but worth a one-line note that it's not identity-verified access control.

---

*Next: I can generate the Week 1 starter repo (FastAPI + React, running natively — no Docker) so you have something running today — just say the word.*

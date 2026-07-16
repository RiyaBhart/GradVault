# 🎓 GradVault

**A time-capsule letters & photos app for friends — write every day, unlock together on the day it matters.**

GradVault lets a group of friends write letters and capture photos/videos to each other daily, all sealed away until one fixed date you choose. When that day comes, each memory still has its own lock — a passcode or a riddle the recipient has to guess — before it's finally revealed. Built as a memory project at FAST NUCES.

---

## ✨ Features

- **Daily letters** — write to a friend (or a group) every day; entries accumulate into a growing thread
- **Live photo & video capture** — take pictures/videos directly through the camera, front or back, with an optional gallery upload fallback
- **Two-layer locking** — nothing is visible before a global unlock date *and* until the recipient solves the per-entry passcode or riddle
- **Notes & captions** — attach a short note to any photo or video
- **Background music** — attach a YouTube-embedded song to a letter that plays on reveal
- **Invite-link sharing** — no public search or discovery; threads are joined via a shareable invite code
- **Pair & group threads** — one-on-one or shared with multiple friends
- **Streaks, stickers, nicknames** — a little gamification and personality throughout
- **Light / dark mode** — dark mode with a neon accent theme, light mode warm and parchment-toned
- **Countdown timer** — always know how long until everything unlocks
- **Ambient background music** — a soft looping track site-wide, with a one-click mute

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python), SQLAlchemy, Alembic |
| Database | PostgreSQL |
| Frontend | React 18 + Vite |
| Auth | JWT (passlib/bcrypt for hashing) |
| Media | Native browser camera capture (`getUserMedia`, `MediaRecorder`) |
| Music | YouTube IFrame Player API (per-letter songs) + local royalty-free track (ambient) |
| Deployment | Render/Railway (backend + Postgres), Vercel/Netlify (frontend) — **no Docker** |

---

## 📁 Project Structure

```
gradvault/
├── backend/
│   ├── app/
│   │   ├── models/       # SQLAlchemy models
│   │   ├── routers/      # FastAPI route handlers
│   │   ├── core/         # config, security/JWT helpers
│   │   └── main.py
│   ├── alembic/          # DB migrations
│   ├── storage/          # uploaded media (gitignored)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── README.md
└── DEPLOY.md
```

---

## 🚀 Getting Started (Local Development)

No Docker required — everything runs natively. Commands below are PowerShell-compatible (Windows).

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL installed and running locally

### 1. Clone the repo

```powershell
git clone https://github.com/<your-username>/gradvault.git
cd gradvault
```

### 2. Backend setup

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env
# edit .env with your local DATABASE_URL, JWT_SECRET, etc.

python -m alembic upgrade head
uvicorn app.main:app --reload
```

Backend runs at `http://localhost:8000`.

### 3. Frontend setup

Open a new terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

### 4. Try it out

1. Sign up with two test accounts (use an incognito window for the second).
2. Create a thread and generate an invite link.
3. Accept the invite with the second account.
4. Write a letter, take a live photo, set a lock.
5. Set `unlock_date` in `site_config` to a past date (directly in the DB) to test unlocking without waiting.

---

## 🔒 Security Notes

- Locked content (letters, photos, videos, notes) is **never** sent to the client until the server independently verifies both the global unlock date and the recipient's per-entry unlock record — there is no client-side hiding of content.
- Passwords and passcodes are hashed with bcrypt; nothing sensitive is logged.
- File uploads are validated by content-type and size before storage, and stored outside any publicly served directory.

This is a sentimental student project, not a security-critical system — locks are designed for fun friction between friends, not to withstand a determined attacker with database access. That trade-off is intentional and documented here rather than hidden.

---

## 🌐 Deployment

See [DEPLOY.md](./DEPLOY.md) for full deployment steps (Render/Railway for the backend + Postgres, Vercel/Netlify for the frontend). No Docker is used anywhere in this project.

---

## ⚠️ Known Limitations

- Live-camera capture requires a device with a working camera; gallery upload is offered as a fallback.
- Songs are played via YouTube embed rather than hosted audio — if a linked video is taken down or region-locked, playback will silently fail with a fallback message.
- Uploaded media currently relies on the backend host's filesystem; for production persistence beyond a demo, this should be swapped for object storage (e.g. Cloudflare R2 or Supabase Storage).
- Invite links grant access to anyone holding the link/code within its validity window — there is no identity verification beyond that.

---

## 👩‍💻 Developer

Built by **Riya Bhart** — suggestions welcome at **riyabhart02@gmail.com**

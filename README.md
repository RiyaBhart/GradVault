# GradVault

A time-capsule letters & photos app for friends — FYP project.

Stack: **FastAPI** (Python) · **PostgreSQL** · **React 18** (Vite) · No Docker.

---

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.10 + |
| Node.js | 18 + |
| PostgreSQL | 14 + (running locally) |
| PowerShell | 5.1 + (7+ recommended) |

---

## 1 · Create the PostgreSQL database

Open **psql** (or pgAdmin) and run once:

```sql
CREATE DATABASE gradvault;
```

---

## 2 · Backend setup

All commands below are run from the **repo root** in PowerShell.

### 2-a Create and activate a virtual environment

```powershell
python -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
```

> If you get a script-execution error, run this first (once per machine):
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```

### 2-b Install dependencies

```powershell
pip install -r backend\requirements.txt
```

### 2-c Create your `.env` file

```powershell
Copy-Item backend\.env.example backend\.env
```

Open `backend\.env` in any editor and fill in your real values:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/gradvault
JWT_SECRET=<paste output of: python -c "import secrets; print(secrets.token_hex(32))">
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

### 2-d Run Alembic migrations

Alembic needs `app/` on the Python path. Run from the `backend/` directory with `PYTHONPATH` set:

```powershell
cd backend
$env:PYTHONPATH = "."
.venv\Scripts\alembic.exe revision --autogenerate -m "create_users_table"
.venv\Scripts\alembic.exe upgrade head
cd ..
```

> **If you see `password authentication failed`**: your Postgres password differs from the default. Edit `backend\.env` → `DATABASE_URL` with the correct user/password, then re-run the commands above.

This creates the `users` table (and any future tables) in `gradvault`.

### 2-e Start the backend

```powershell
cd backend
$env:PYTHONPATH = "."
.venv\Scripts\uvicorn.exe app.main:app --reload
```

The API is now at **http://127.0.0.1:8000**.  
Interactive docs: **http://127.0.0.1:8000/docs**

---

## 3 · Frontend setup

Open a **second** PowerShell window (leave uvicorn running in the first).

```powershell
cd frontend
npm install
npm run dev
```

The React app is now at **http://localhost:5173**.

---

## 4 · Manual smoke test

### 4-a Confirm the API is up

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Expected: `{ status: ok }`

### 4-b Sign up a user

```powershell
$body = '{"username":"riya","nickname":"Riya","password":"supersecret123","avatar_sticker":"🌙"}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/auth/signup `
  -ContentType 'application/json' -Body $body
```

Expected: a JSON object with `id`, `username`, `nickname`, `avatar_sticker`, `streak_count`, `created_at` — **no** `password_hash`.

### 4-c Log in and capture the token

```powershell
$login = '{"username":"riya","password":"supersecret123"}'
$resp = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/auth/login `
  -ContentType 'application/json' -Body $login
$token = $resp.access_token
Write-Host "Token: $token"
```

### 4-d Hit the protected route

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/users/me `
  -Headers @{ Authorization = "Bearer $token" }
```

Expected: the same user object as step 4-b.

### 4-e Confirm rejection without a token

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/users/me
```

Expected: HTTP 401.

### 4-f Test the frontend

1. Open http://localhost:5173
2. Click **Create one** → fill in the form → submit.
3. You should land on the home page showing your nickname and avatar.
4. Click **Sign out** → you return to the login screen.
5. Log back in — you return to the home page.

---

## Project structure

```
gradvault/
├── backend/
│   ├── app/
│   │   ├── core/          ← config.py, security.py (JWT + bcrypt)
│   │   ├── models/        ← SQLAlchemy models (user.py, ...)
│   │   ├── routers/       ← auth.py, users.py, ...
│   │   ├── database.py    ← engine, session, Base
│   │   ├── main.py        ← FastAPI app, CORS, router registration
│   │   └── schemas.py     ← Pydantic request/response schemas
│   ├── alembic/           ← migrations
│   ├── alembic.ini
│   ├── requirements.txt
│   └── .env.example       ← copy to .env and fill in real values
├── frontend/
│   ├── src/
│   │   ├── components/    ← LoginForm.jsx, SignupForm.jsx
│   │   ├── context/       ← AuthContext.jsx (JWT stored in memory)
│   │   ├── pages/         ← HomePage.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js     ← proxies /api → http://127.0.0.1:8000
├── .gitignore
└── README.md
```

---

## Known limitations (Week 1)

- **JWT is in-memory only** — logging out on page refresh is intentional and safe. A refresh-token cookie flow will be added in a later week.
- **CORS is dev-only** — `allow_origins=["http://localhost:5173"]` must be updated before production deployment.

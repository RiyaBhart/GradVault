# Deployment Guide

This guide details how to deploy GradVault without Docker, using native environments on standard PaaS platforms.

## Overview
- **Backend:** FastAPI running on a Python native runtime (e.g., Render, Railway).
- **Database:** Managed PostgreSQL (e.g., Supabase, Render, Railway).
- **Frontend:** React + Vite deployed statically on a CDN (e.g., Vercel, Netlify).

---

## 1. Database (Managed PostgreSQL)

The easiest way to get a Postgres database is using a free tier from Supabase, Render, or Railway.

1. Create a project/database on your platform of choice.
2. Retrieve the **Connection String** (URI). It usually looks like this:
   `postgresql://username:password@hostname:port/database_name`

**Important Note for SQLAlchemy**: If your URL starts with `postgres://`, you must change it to `postgresql://` in your environment variables for SQLAlchemy to connect correctly.

---

## 2. Backend (Render / Railway)

Both Render and Railway support native Python deployment.

### A. Deploying to Render
1. Create a new **Web Service**.
2. Connect your GitHub repository.
3. Configure the service:
   - **Environment:** Python
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. **Environment Variables**: Add the variables listed in the Environment Variables section below.
5. **Database Migration**: 
   - Render does not run migrations automatically. You can run them by connecting to the Render shell (via dashboard) and executing:
     `python -m alembic upgrade head`
   - Or, temporarily change your Start Command to:
     `python -m alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### B. Deploying to Railway
1. Create a new project and select **Deploy from GitHub repo**.
2. Railway should auto-detect the Python environment.
3. Configure settings:
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. **Environment Variables**: Add the variables listed below.
5. **Database Migration**:
   - Go to your service's variables, add `RAILWAY_PREDEPLOY_COMMAND` with the value `python -m alembic upgrade head` or run it locally pointing to your production database URL before launching.

### Required Environment Variables (Backend)

| Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | Your production PostgreSQL connection string (must use `postgresql://`). | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | A long, random string used to sign JWT tokens. Keep this safe. | `your_super_secret_string` |
| `JWT_ALGORITHM` | The hashing algorithm for JWT. | `HS256` |
| `JWT_EXPIRATION_MINUTES` | How long the auth token is valid. | `43200` (30 days) |
| `PORT` | The port your server listens on (usually auto-set by PaaS, but good to know). | `8000` |

---

## 3. Frontend (Vercel / Netlify)

Vercel and Netlify are perfect for Vite-based React apps.

### Deploying to Vercel
1. Create a new project in Vercel and import your GitHub repository.
2. Set the **Framework Preset** to `Vite` (Vercel usually auto-detects this).
3. **Root Directory:** If your frontend code is in a `frontend` folder, make sure to set the Root Directory to `frontend`.
4. Configure Build Settings:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. **Environment Variables**:
   - Add `VITE_API_BASE_URL` pointing to your deployed backend (e.g., `https://your-backend-url.onrender.com`).
6. Deploy!

### Deploying to Netlify
1. Create a new site from Git.
2. Select your repository.
3. **Base directory:** `frontend`
4. **Build command:** `npm run build`
5. **Publish directory:** `frontend/dist`
6. **Environment Variables**:
   - Add `VITE_API_BASE_URL` pointing to your deployed backend.
7. Deploy Site!

## 4. Post-Deployment QA

Once both frontend and backend are live:
1. Ensure the backend returns a successful response at `https://your-backend-url.com/health`.
2. Visit the frontend URL.
3. Check the browser console to ensure there are no CORS errors.
4. Try creating an account, creating a thread, and uploading an entry to verify the database and storage work correctly.

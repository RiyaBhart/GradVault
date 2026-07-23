import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, users, threads, invites, site, entries

app = FastAPI(
    title="GradVault API",
    description="Time-capsule letters & photos app — FYP.",
    version="0.3.0",
)

# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server during development & production FRONTEND_URL
# ---------------------------------------------------------------------------
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url and frontend_url not in origins:
    origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Entry-Notes"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(threads.router)
app.include_router(invites.router)
app.include_router(site.router)
app.include_router(entries.router)


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}

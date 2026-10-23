import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text

from .auth import hash_password
from .database import Base, SessionLocal, engine
from .models import DEFAULT_FARE, Admin
from .routers import admin, auth, driver, public, user

Base.metadata.create_all(bind=engine)


def add_missing_columns():
    """create_all() doesn't add new columns to tables that already exist, so add them here."""
    columns = {c["name"] for c in inspect(engine).get_columns("routes")}
    if "fare" not in columns:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE routes ADD COLUMN fare INTEGER NOT NULL DEFAULT {DEFAULT_FARE}"))


add_missing_columns()


def ensure_admin():
    with SessionLocal() as db:
        if db.scalar(select(Admin)) is None:
            db.add(
                Admin(
                    username=os.getenv("ADMIN_USERNAME", "admin"),
                    password_hash=hash_password(os.getenv("ADMIN_PASSWORD", "admin123")),
                )
            )
            db.commit()


ensure_admin()

app = FastAPI(title="Bus Tracking API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, admin.router, driver.router, user.router, public.router):
    app.include_router(r)


@app.get("/", tags=["health"])
def health():
    return {"status": "ok", "docs": "/docs"}

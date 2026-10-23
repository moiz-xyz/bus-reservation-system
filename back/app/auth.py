import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Admin, Driver, User

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ALGORITHM = "HS256"
TOKEN_HOURS = 12
ROLE_MODELS = {"admin": Admin, "driver": Driver, "user": User}

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split("$", 1)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 200_000)
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_token(subject_id: int, role: str) -> str:
    payload = {
        "sub": str(subject_id),
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def require_role(role: str):
    """Dependency that returns the logged-in Admin/Driver/User for the given role."""
    model = ROLE_MODELS[role]

    def dependency(
        creds: HTTPAuthorizationCredentials | None = Depends(bearer),
        db: Session = Depends(get_db),
    ):
        if creds is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
        try:
            payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        except jwt.PyJWTError:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
        if payload.get("role") != role:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Only {role}s can do this")
        account = db.get(model, int(payload["sub"]))
        if account is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account no longer exists")
        return account

    return dependency

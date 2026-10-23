from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_token, hash_password, verify_password
from ..database import get_db
from ..models import Admin, Driver, User
from ..schemas import AdminLoginIn, DriverRegister, LoginIn, TokenOut, UserRegister
from ..utils import ensure_email_free

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/user/register", response_model=TokenOut, status_code=201)
def register_user(data: UserRegister, db: Session = Depends(get_db)):
    email = data.email.lower()
    ensure_email_free(db, email)
    user = User(name=data.name, email=email, phone=data.phone, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    return TokenOut(access_token=create_token(user.id, "user"), role="user", name=user.name)


@router.post("/driver/register", response_model=TokenOut, status_code=201)
def register_driver(data: DriverRegister, db: Session = Depends(get_db)):
    email = data.email.lower()
    ensure_email_free(db, email)
    if db.scalar(select(Driver).where(Driver.license_number == data.license_number)):
        raise HTTPException(409, "This license number is already registered")
    driver = Driver(
        name=data.name,
        email=email,
        phone=data.phone,
        license_number=data.license_number,
        password_hash=hash_password(data.password),
    )
    db.add(driver)
    db.commit()
    return TokenOut(access_token=create_token(driver.id, "driver"), role="driver", name=driver.name)


@router.post("/user/login", response_model=TokenOut)
def login_user(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    return TokenOut(access_token=create_token(user.id, "user"), role="user", name=user.name)


@router.post("/driver/login", response_model=TokenOut)
def login_driver(data: LoginIn, db: Session = Depends(get_db)):
    driver = db.scalar(select(Driver).where(Driver.email == data.email.lower()))
    if not driver or not verify_password(data.password, driver.password_hash):
        raise HTTPException(401, "Wrong email or password")
    return TokenOut(access_token=create_token(driver.id, "driver"), role="driver", name=driver.name)


@router.post("/admin/login", response_model=TokenOut)
def login_admin(data: AdminLoginIn, db: Session = Depends(get_db)):
    admin = db.scalar(select(Admin).where(Admin.username == data.username))
    if not admin or not verify_password(data.password, admin.password_hash):
        raise HTTPException(401, "Wrong username or password")
    return TokenOut(access_token=create_token(admin.id, "admin"), role="admin", name=admin.username)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    """One login for everyone: finds the account and returns its role (admin, driver or user)."""
    identifier = data.email.strip()
    admin = db.scalar(select(Admin).where(Admin.username == identifier))
    if admin and verify_password(data.password, admin.password_hash):
        return TokenOut(access_token=create_token(admin.id, "admin"), role="admin", name=admin.username)

    email = identifier.lower()
    for role, model in (("driver", Driver), ("user", User)):
        account = db.scalar(select(model).where(model.email == email))
        if account and verify_password(data.password, account.password_hash):
            return TokenOut(access_token=create_token(account.id, role), role=role, name=account.name)

    raise HTTPException(401, "Wrong email or password")

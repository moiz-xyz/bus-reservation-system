from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Route
from ..schemas import RouteOut

router = APIRouter(tags=["public"])


@router.get("/routes", response_model=list[RouteOut])
def list_routes(db: Session = Depends(get_db)):
    """Routes, stops and prices passengers can choose from - no bus or driver details."""
    return db.scalars(select(Route).order_by(Route.name)).all()

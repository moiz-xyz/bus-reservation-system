from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_role
from ..database import get_db
from ..models import Route, Stop, Ticket, User
from ..schemas import ChooseRouteIn, RoutePreview, TrackingOut, UserOut
from ..utils import get_or_404, haversine_km

router = APIRouter(prefix="/user", tags=["user"])
current_user = require_role("user")

AVERAGE_BUS_SPEED_KMH = 25
STALE_AFTER_SECONDS = 120


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.put("/route", response_model=UserOut)
def choose_route(data: ChooseRouteIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Put the passenger on a route and issue them a ticket for it."""
    route = get_or_404(db, Route, data.route_id)
    stop = None
    if data.stop_id is not None:
        stop = get_or_404(db, Stop, data.stop_id)
        if stop.route_id != route.id:
            raise HTTPException(400, "That stop is not on this route")
    user.route_id = route.id
    user.stop_id = data.stop_id

    ticket = Ticket(
        user=user,
        route_id=route.id,
        route_name=route.name,
        stop_name=stop.name if stop else None,
        price=route.fare,
    )
    db.add(ticket)
    db.flush()
    ticket.ticket_number = f"TKT-{ticket.id:06d}"
    db.commit()
    db.refresh(user)
    return user


@router.delete("/route", response_model=UserOut)
def leave_route(user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.route_id = None
    user.stop_id = None
    db.commit()
    db.refresh(user)
    return user


@router.get("/routes/{route_id}/preview", response_model=RoutePreview)
def route_preview(route_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Who drives this route - shown while the passenger is choosing it."""
    route = get_or_404(db, Route, route_id)
    bus = route.bus
    driver = bus.driver if bus else None
    return RoutePreview.model_validate(
        {
            "bus": bus,
            "driver_name": driver.name if driver else None,
            "driver_phone": driver.phone if driver else None,
        },
        from_attributes=True,
    )


@router.get("/tracking", response_model=TrackingOut)
def tracking(user: User = Depends(current_user)):
    """Where is the driver of my route's bus right now?"""
    route = user.route
    if route is None:
        raise HTTPException(404, "You have not selected a route yet")

    bus = route.bus
    driver = bus.driver if bus else None
    has_location = driver is not None and driver.latitude is not None
    is_live = (
        has_location
        and driver.on_duty
        and driver.location_age_seconds is not None
        and driver.location_age_seconds <= STALE_AFTER_SECONDS
    )

    if bus is None:
        status = "No bus has been allocated to this route yet"
    elif driver is None:
        status = "This bus has no driver assigned yet"
    elif not driver.on_duty:
        status = "Driver is off duty"
    elif not has_location:
        status = "Waiting for the driver's first location update"
    elif not is_live:
        status = "Location signal is old - driver may have lost connection"
    else:
        status = "Live"

    near_stop = None
    if has_location and route.stops:
        near_stop = min(
            route.stops,
            key=lambda s: haversine_km(driver.latitude, driver.longitude, s.latitude, s.longitude),
        ).name

    distance = eta = None
    if has_location and user.stop:
        distance = round(haversine_km(driver.latitude, driver.longitude, user.stop.latitude, user.stop.longitude), 2)
        eta = round(distance / AVERAGE_BUS_SPEED_KMH * 60)

    return TrackingOut.model_validate(
        {
            "route": route,
            "my_stop": user.stop,
            "status": status,
            "is_live": is_live,
            "distance_km": distance,
            "eta_minutes": eta,
            "near_stop": near_stop,
        },
        from_attributes=True,
    )

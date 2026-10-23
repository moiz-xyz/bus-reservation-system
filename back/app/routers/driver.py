from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import require_role
from ..database import get_db
from ..models import Bus, Driver, Route, utcnow
from ..schemas import DriverBusIn, DriverMe, DriverPublic, DriverRouteIn, DutyIn, LocationIn, RouteBrief
from ..utils import commit_or_409, get_or_404

DUPLICATE_BUS = "A bus with this bus number or plate number is already registered"

router = APIRouter(prefix="/driver", tags=["driver"])
current_driver = require_role("driver")


@router.get("/me", response_model=DriverMe)
def me(driver: Driver = Depends(current_driver)):
    return driver


@router.post("/location", response_model=DriverPublic)
def update_location(data: LocationIn, driver: Driver = Depends(current_driver), db: Session = Depends(get_db)):
    driver.latitude = data.latitude
    driver.longitude = data.longitude
    driver.location_updated_at = utcnow()
    driver.on_duty = True
    db.commit()
    return driver


@router.put("/duty", response_model=DriverPublic)
def set_duty(data: DutyIn, driver: Driver = Depends(current_driver), db: Session = Depends(get_db)):
    driver.on_duty = data.on_duty
    db.commit()
    return driver


@router.get("/available-routes", response_model=list[RouteBrief])
def available_routes(driver: Driver = Depends(current_driver), db: Session = Depends(get_db)):
    """Routes a driver can pick: ones with no bus yet, plus the route they already drive."""
    own_bus_id = driver.bus.id if driver.bus else None
    query = select(Route).where(or_(Route.bus_id.is_(None), Route.bus_id == own_bus_id)).order_by(Route.name)
    return db.scalars(query).all()


def _save_bus(driver: Driver, data: DriverBusIn, db: Session):
    bus = driver.bus or Bus(driver_id=driver.id)
    bus.bus_number, bus.plate_number = data.bus_number, data.plate_number
    bus.model, bus.capacity = data.model, data.capacity
    db.add(bus)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, DUPLICATE_BUS)

    current_route = bus.route
    if data.route_id is not None:
        route = get_or_404(db, Route, data.route_id)
        if route.bus_id not in (None, bus.id):
            raise HTTPException(409, "Another bus already runs this route - choose a different one")
        if current_route and current_route.id != route.id:
            current_route.bus_id = None
            db.flush()
        route.bus_id = bus.id
    elif current_route:
        current_route.bus_id = None

    commit_or_409(db, DUPLICATE_BUS)
    db.refresh(driver)
    return driver


@router.post("/bus", response_model=DriverMe, status_code=201)
def register_bus(data: DriverBusIn, driver: Driver = Depends(current_driver), db: Session = Depends(get_db)):
    """The driver registers the bus they drive (and optionally its route)."""
    if driver.bus:
        raise HTTPException(409, "You already have a bus - edit it instead")
    return _save_bus(driver, data, db)


@router.put("/bus", response_model=DriverMe)
def update_bus(data: DriverBusIn, driver: Driver = Depends(current_driver), db: Session = Depends(get_db)):
    if not driver.bus:
        raise HTTPException(404, "You have not registered a bus yet")
    return _save_bus(driver, data, db)


@router.post("/route", response_model=DriverMe, status_code=201)
def create_route(data: DriverRouteIn, driver: Driver = Depends(current_driver), db: Session = Depends(get_db)):
    """The driver creates a new route and it is allocated to their bus."""
    if not driver.bus:
        raise HTTPException(400, "Register your bus first")
    if driver.bus.route:
        driver.bus.route.bus_id = None
        db.flush()
    route = Route(name=data.name, start_point=data.start_point, end_point=data.end_point, bus_id=driver.bus.id)
    route.set_stops(data.stops)
    db.add(route)
    commit_or_409(db, "A route with this name already exists")
    db.refresh(driver)
    return driver

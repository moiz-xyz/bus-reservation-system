from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..auth import hash_password, require_role
from ..database import get_db
from ..models import Bus, Driver, Route, Ticket, User
from ..schemas import (
    AssignBusIn,
    AssignDriverIn,
    BusIn,
    BusOut,
    DriverAdminOut,
    DriverRegister,
    RouteIn,
    RouteLive,
    UserOut,
    UserRegister,
)
from ..utils import commit_or_409, ensure_email_free, get_or_404

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_role("admin"))])


# ---------- buses ----------
@router.get("/buses", response_model=list[BusOut])
def list_buses(db: Session = Depends(get_db)):
    return db.scalars(select(Bus).order_by(Bus.bus_number)).all()


@router.post("/buses", response_model=BusOut, status_code=201)
def create_bus(data: BusIn, db: Session = Depends(get_db)):
    bus = Bus(**data.model_dump())
    db.add(bus)
    commit_or_409(db, "Bus number or plate number already exists")
    return bus


@router.put("/buses/{bus_id}", response_model=BusOut)
def update_bus(bus_id: int, data: BusIn, db: Session = Depends(get_db)):
    bus = get_or_404(db, Bus, bus_id)
    for key, value in data.model_dump().items():
        setattr(bus, key, value)
    commit_or_409(db, "Bus number or plate number already exists")
    return bus


@router.delete("/buses/{bus_id}", status_code=204)
def delete_bus(bus_id: int, db: Session = Depends(get_db)):
    bus = get_or_404(db, Bus, bus_id)
    if bus.route:
        bus.route.bus_id = None
    db.delete(bus)
    db.commit()


@router.put("/buses/{bus_id}/driver", response_model=BusOut)
def assign_driver(bus_id: int, data: AssignDriverIn, db: Session = Depends(get_db)):
    """Give a bus to a driver. If the driver had another bus, it is taken off that one."""
    bus = get_or_404(db, Bus, bus_id)
    if data.driver_id is not None:
        driver = get_or_404(db, Driver, data.driver_id)
        if driver.bus and driver.bus.id != bus.id:
            driver.bus.driver_id = None
            db.flush()
    bus.driver_id = data.driver_id
    db.commit()
    return bus


# ---------- routes ----------
@router.get("/routes", response_model=list[RouteLive])
def list_routes(db: Session = Depends(get_db)):
    return db.scalars(select(Route).order_by(Route.name)).all()


@router.post("/routes", response_model=RouteLive, status_code=201)
def create_route(data: RouteIn, db: Session = Depends(get_db)):
    route = Route(name=data.name, start_point=data.start_point, end_point=data.end_point, fare=data.fare)
    route.set_stops(data.stops)
    db.add(route)
    commit_or_409(db, "A route with this name already exists")
    return route


@router.put("/routes/{route_id}", response_model=RouteLive)
def update_route(route_id: int, data: RouteIn, db: Session = Depends(get_db)):
    route = get_or_404(db, Route, route_id)
    route.name, route.start_point, route.end_point = data.name, data.start_point, data.end_point
    route.fare = data.fare
    old_stops = [(s.name, s.latitude, s.longitude) for s in route.stops]
    if old_stops != [(s.name, s.latitude, s.longitude) for s in data.stops]:
        # Stops are replaced, so passengers on this route need to pick their stop again.
        db.execute(update(User).where(User.route_id == route.id).values(stop_id=None))
        route.set_stops(data.stops)
    commit_or_409(db, "A route with this name already exists")
    return route


@router.delete("/routes/{route_id}", status_code=204)
def delete_route(route_id: int, db: Session = Depends(get_db)):
    route = get_or_404(db, Route, route_id)
    db.execute(update(User).where(User.route_id == route.id).values(route_id=None, stop_id=None))
    db.execute(update(Ticket).where(Ticket.route_id == route.id).values(route_id=None))
    db.delete(route)
    db.commit()


@router.put("/routes/{route_id}/bus", response_model=RouteLive)
def allocate_bus(route_id: int, data: AssignBusIn, db: Session = Depends(get_db)):
    """Allocate a bus (and therefore its driver) to a route."""
    route = get_or_404(db, Route, route_id)
    if data.bus_id is not None:
        bus = get_or_404(db, Bus, data.bus_id)
        if bus.route and bus.route.id != route.id:
            bus.route.bus_id = None
            db.flush()
    route.bus_id = data.bus_id
    db.commit()
    return route


@router.get("/live", response_model=list[RouteLive])
def live_overview(db: Session = Depends(get_db)):
    """Every route with its bus and the driver's latest position, for the admin map."""
    return db.scalars(select(Route).order_by(Route.name)).all()


# ---------- drivers & users ----------
@router.get("/drivers", response_model=list[DriverAdminOut])
def list_drivers(db: Session = Depends(get_db)):
    return db.scalars(select(Driver).order_by(Driver.name)).all()


@router.post("/drivers", response_model=DriverAdminOut, status_code=201)
def create_driver(data: DriverRegister, db: Session = Depends(get_db)):
    ensure_email_free(db, data.email.lower())
    driver = Driver(
        name=data.name,
        email=data.email.lower(),
        phone=data.phone,
        license_number=data.license_number,
        password_hash=hash_password(data.password),
    )
    db.add(driver)
    commit_or_409(db, "This license number is already registered")
    return driver


@router.delete("/drivers/{driver_id}", status_code=204)
def delete_driver(driver_id: int, db: Session = Depends(get_db)):
    driver = get_or_404(db, Driver, driver_id)
    if driver.bus:
        driver.bus.driver_id = None
    db.delete(driver)
    db.commit()


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.name)).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(data: UserRegister, db: Session = Depends(get_db)):
    ensure_email_free(db, data.email.lower())
    user = User(
        name=data.name,
        email=data.email.lower(),
        phone=data.phone,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    commit_or_409(db, "Email already registered")
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, User, user_id))
    db.commit()

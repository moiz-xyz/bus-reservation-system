from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------
class UserRegister(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(pattern=EMAIL_PATTERN, max_length=120)
    phone: str = Field(min_length=5, max_length=30)
    password: str = Field(min_length=1)


class DriverRegister(UserRegister):
    license_number: str = Field(min_length=3, max_length=50)


class LoginIn(BaseModel):
    email: str
    password: str


class AdminLoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str


# ---------- stops / routes / buses ----------
class StopIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class StopOut(ORMModel):
    id: int
    name: str
    latitude: float
    longitude: float
    sequence: int


class RouteIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    start_point: str = Field(min_length=1, max_length=150)
    end_point: str = Field(min_length=1, max_length=150)
    fare: int = Field(200, ge=0, description="Ticket price for this route")
    stops: list[StopIn] = []


class DriverRouteIn(BaseModel):
    """A driver creating the route they drive. The ticket price is left to the admin."""

    name: str = Field(min_length=2, max_length=100)
    start_point: str = Field(min_length=1, max_length=150)
    end_point: str = Field(min_length=1, max_length=150)
    stops: list[StopIn] = Field(min_length=2)


class RouteBrief(ORMModel):
    id: int
    name: str
    start_point: str
    end_point: str
    fare: int


class BusIn(BaseModel):
    bus_number: str = Field(min_length=1, max_length=20)
    plate_number: str = Field(min_length=1, max_length=20)
    model: str = Field("", max_length=100)
    capacity: int = Field(40, ge=1, le=200)


class DriverBusIn(BusIn):
    """A driver registering or editing their own bus."""

    route_id: Optional[int] = None


class BusBrief(ORMModel):
    id: int
    bus_number: str
    plate_number: str
    model: str
    capacity: int


class DriverPublic(ORMModel):
    """What passengers are allowed to see about a driver."""

    id: int
    name: str
    phone: str
    on_duty: bool
    latitude: Optional[float]
    longitude: Optional[float]
    location_updated_at: Optional[datetime]
    location_age_seconds: Optional[int]


class DriverOut(DriverPublic):
    email: str
    license_number: str


class BusWithDriver(BusBrief):
    driver: Optional[DriverPublic]


class BusOut(BusWithDriver):
    route: Optional[RouteBrief]


class RouteOut(RouteBrief):
    stops: list[StopOut]


class TicketOut(ORMModel):
    ticket_number: str
    route_name: str
    stop_name: Optional[str]
    price: int
    created_at: datetime


class RouteLive(RouteBrief):
    stops: list[StopOut]
    bus: Optional[BusWithDriver]


class DriverAdminOut(DriverOut):
    bus: Optional[BusBrief]


class PassengerBrief(ORMModel):
    """What a driver may see about a passenger on their bus - no email or phone."""

    name: str
    stop: Optional[StopOut]
    current_ticket: Optional[TicketOut]


class DriverMe(DriverOut):
    bus: Optional[BusBrief]
    route: Optional[RouteOut]
    passengers: list[PassengerBrief]


class UserOut(ORMModel):
    id: int
    name: str
    email: str
    phone: str
    created_at: datetime
    route: Optional[RouteBrief]
    stop: Optional[StopOut]
    current_ticket: Optional[TicketOut]


# ---------- actions ----------
class AssignDriverIn(BaseModel):
    driver_id: Optional[int]


class AssignBusIn(BaseModel):
    bus_id: Optional[int]


class ChooseRouteIn(BaseModel):
    route_id: int
    stop_id: Optional[int] = None


class LocationIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class DutyIn(BaseModel):
    on_duty: bool


class TrackingOut(BaseModel):
    route: RouteLive
    my_stop: Optional[StopOut]
    status: str
    is_live: bool
    distance_km: Optional[float]
    eta_minutes: Optional[int]
    near_stop: Optional[str]



class RoutePreview(BaseModel):
    """Bus and driver on one route, shown to a passenger before they book it."""

    bus: Optional[BusBrief]
    driver_name: Optional[str]
    driver_phone: Optional[str]

import os
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

DEFAULT_FARE = int(os.getenv("DEFAULT_FARE", "200"))


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))


class User(Base):
    """Passengers who track the bus on their route."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(30))
    password_hash: Mapped[str] = mapped_column(String(200))
    route_id: Mapped[Optional[int]] = mapped_column(ForeignKey("routes.id", ondelete="SET NULL"))
    stop_id: Mapped[Optional[int]] = mapped_column(ForeignKey("stops.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    route: Mapped[Optional["Route"]] = relationship(back_populates="users")
    stop: Mapped[Optional["Stop"]] = relationship()
    tickets: Mapped[list["Ticket"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", order_by="Ticket.id.desc()"
    )

    @property
    def current_ticket(self) -> Optional["Ticket"]:
        """The latest ticket for the route the passenger is on now."""
        if self.route_id is None:
            return None
        return next((t for t in self.tickets if t.route_id == self.route_id), None)


class Driver(Base):
    """Bus drivers; their live GPS position is stored here."""

    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(30))
    license_number: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    on_duty: Mapped[bool] = mapped_column(Boolean, default=False)
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    location_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    bus: Mapped[Optional["Bus"]] = relationship(back_populates="driver")

    @property
    def route(self) -> Optional["Route"]:
        return self.bus.route if self.bus else None

    @property
    def passengers(self) -> list["User"]:
        """Passengers booked on this driver's route, in stop order."""
        if self.route is None:
            return []
        return sorted(self.route.users, key=lambda u: (u.stop.sequence if u.stop else 10**6, u.name))

    @property
    def location_age_seconds(self) -> Optional[int]:
        if self.location_updated_at is None:
            return None
        return int((utcnow() - self.location_updated_at).total_seconds())


class Bus(Base):
    __tablename__ = "buses"

    id: Mapped[int] = mapped_column(primary_key=True)
    bus_number: Mapped[str] = mapped_column(String(20), unique=True)
    plate_number: Mapped[str] = mapped_column(String(20), unique=True)
    model: Mapped[str] = mapped_column(String(100), default="")
    capacity: Mapped[int] = mapped_column(Integer, default=40)
    driver_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("drivers.id", ondelete="SET NULL"), unique=True
    )

    driver: Mapped[Optional[Driver]] = relationship(back_populates="bus")
    route: Mapped[Optional["Route"]] = relationship(back_populates="bus")


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    start_point: Mapped[str] = mapped_column(String(150))
    end_point: Mapped[str] = mapped_column(String(150))
    fare: Mapped[int] = mapped_column(Integer, default=DEFAULT_FARE, server_default=str(DEFAULT_FARE))
    bus_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("buses.id", ondelete="SET NULL"), unique=True
    )

    bus: Mapped[Optional[Bus]] = relationship(back_populates="route")
    stops: Mapped[list["Stop"]] = relationship(
        back_populates="route", cascade="all, delete-orphan", order_by="Stop.sequence"
    )
    users: Mapped[list[User]] = relationship(back_populates="route")

    def set_stops(self, stops):
        """Replace the stops with `stops` (objects with name/latitude/longitude), keeping their order."""
        self.stops.clear()
        for i, s in enumerate(stops):
            self.stops.append(Stop(name=s.name, latitude=s.latitude, longitude=s.longitude, sequence=i))


class Stop(Base):
    __tablename__ = "stops"

    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    sequence: Mapped[int] = mapped_column(Integer)

    route: Mapped[Route] = relationship(back_populates="stops")


class Ticket(Base):
    """Issued every time a passenger chooses a route."""

    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_number: Mapped[Optional[str]] = mapped_column(String(20), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    route_id: Mapped[Optional[int]] = mapped_column(ForeignKey("routes.id", ondelete="SET NULL"))
    # Names are copied so the ticket still reads correctly if the route is edited or deleted.
    route_name: Mapped[str] = mapped_column(String(100))
    stop_name: Mapped[Optional[str]] = mapped_column(String(100))
    price: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship(back_populates="tickets")

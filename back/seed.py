"""Fill the database with demo data:  python seed.py"""
from sqlalchemy import select

from app.auth import hash_password
from app.database import SessionLocal
from app.main import ensure_admin  # also creates tables
from app.models import Bus, Driver, Route, Stop, User

ROUTES = [
    {
        "name": "Route 1 - Saddar to Clifton",
        "start_point": "Saddar",
        "end_point": "Clifton",
        "stops": [
            ("Saddar", 24.8556, 67.0300),
            ("Regal Chowk", 24.8580, 67.0200),
            ("Teen Talwar", 24.8340, 67.0330),
            ("Do Talwar", 24.8250, 67.0340),
            ("Clifton Beach", 24.8070, 67.0300),
        ],
    },
    {
        "name": "Route 2 - Gulshan to University",
        "start_point": "Gulshan Chowrangi",
        "end_point": "University Road",
        "stops": [
            ("Gulshan Chowrangi", 24.9200, 67.0930),
            ("NIPA", 24.9170, 67.0970),
            ("Hassan Square", 24.9050, 67.0790),
            ("Civic Centre", 24.8950, 67.0740),
        ],
    },
]


def main():
    ensure_admin()
    with SessionLocal() as db:
        if db.scalar(select(Route)):
            print("Database already has data - skipping seed.")
            return

        drivers = [
            Driver(name="Ali Khan", email="driver1@demo.com", phone="0300-1111111",
                   license_number="LIC-1001", password_hash=hash_password("driver123")),
            Driver(name="Bilal Ahmed", email="driver2@demo.com", phone="0300-2222222",
                   license_number="LIC-1002", password_hash=hash_password("driver123")),
        ]
        buses = [
            Bus(bus_number="B-101", plate_number="KHI-1234", model="Hino 2022", capacity=45, driver=drivers[0]),
            Bus(bus_number="B-102", plate_number="KHI-5678", model="Isuzu 2021", capacity=40, driver=drivers[1]),
        ]
        routes = []
        for data, bus in zip(ROUTES, buses):
            route = Route(name=data["name"], start_point=data["start_point"], end_point=data["end_point"], bus=bus)
            route.stops = [Stop(name=n, latitude=lat, longitude=lng, sequence=i)
                           for i, (n, lat, lng) in enumerate(data["stops"])]
            routes.append(route)

        db.add_all(drivers + buses + routes)
        db.flush()
        db.add(User(name="Demo User", email="user@demo.com", phone="0300-3333333",
                    password_hash=hash_password("user123"), route=routes[0], stop=routes[0].stops[3]))
        db.commit()
        print("Seeded demo data:")
        print("  admin   -> admin / admin123")
        print("  driver  -> driver1@demo.com / driver123  (bus B-101, Route 1)")
        print("  driver  -> driver2@demo.com / driver123  (bus B-102, Route 2)")
        print("  user    -> user@demo.com / user123       (Route 1, stop Do Talwar)")


if __name__ == "__main__":
    main()

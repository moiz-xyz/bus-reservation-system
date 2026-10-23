# Bus Tracking System

React frontend · Python (FastAPI) backend · SQL database

Admins allocate buses (with their drivers) to routes. Drivers share their live GPS position.
Passengers pick their route and stop, and see on a map where their driver is, with the distance and an estimated arrival time.

## Folder layout

```
back/                      Python API
  app/models.py            SQL tables: users, drivers, buses, routes, stops, admins
  app/routers/auth.py      register / login (user, driver, admin)
  app/routers/admin.py     buses, routes, assign driver -> bus, allocate bus -> route
  app/routers/driver.py    driver profile, send location, duty on/off
  app/routers/user.py      choose route & stop, live tracking
  seed.py                  demo data
front/                     React (Vite) app
  src/pages/               Login, Register, Admin, Driver, User dashboards
  src/components/MapView   Leaflet / OpenStreetMap map
```

## Database

| Table     | What it holds |
|-----------|---------------|
| `users`   | Passengers: name, email, phone, password hash, chosen route and stop |
| `drivers` | Drivers: name, email, phone, license no., password hash, on duty, latitude/longitude, last update time |
| `buses`   | Bus number, plate number, model, capacity, assigned driver |
| `routes`  | Route name, start and end points, allocated bus |
| `stops`   | Stops on each route, in order, with coordinates |
| `admins`  | Admin logins |

How the tables connect: **user → route → bus → driver → live location**.

By default the database is SQLite, a file called `back/bus_tracking.db`. To use MySQL instead:

```bash
pip install pymysql
export DATABASE_URL="mysql+pymysql://root:password@localhost/bus_tracking"   # create the database first
```

For PostgreSQL, install `psycopg2-binary` and set `DATABASE_URL=postgresql://user:pass@localhost/bus_tracking`.
The tables are created automatically when the API starts.

## Run it

**Backend** (terminal 1):
```bash
cd back
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python seed.py                         # optional demo data
uvicorn app.main:app --reload --port 8000
```
Interactive API docs: http://localhost:8000/docs

**Frontend** (terminal 2):
```bash
cd front
npm install
npm run dev
```
Open http://localhost:5173

### Demo accounts (created by seed.py)
| Role      | Login | Password |
|-----------|-------|----------|
| Admin     | `admin` | `admin123` |
| Driver    | `driver1@demo.com` | `driver123` |
| Passenger | `user@demo.com` | `user123` |

To see live tracking, log in as the driver in one browser window and click **Simulate drive** (or **Start sharing GPS** on a phone).
Then log in as the passenger in another window (or a private window) and watch the 🚌 move.

## API summary

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| POST | `/auth/user/register`, `/auth/user/login` | anyone | passenger account |
| POST | `/auth/driver/register`, `/auth/driver/login` | anyone | driver account |
| POST | `/auth/admin/login` | admin | admin login |
| GET | `/routes` | anyone | routes and stops to choose from |
| GET/POST/PUT/DELETE | `/admin/buses[/{id}]` | admin | manage buses |
| PUT | `/admin/buses/{id}/driver` | admin | assign a driver to a bus |
| GET/POST/PUT/DELETE | `/admin/routes[/{id}]` | admin | manage routes and stops |
| PUT | `/admin/routes/{id}/bus` | admin | **allocate a bus to a route** |
| GET | `/admin/live` | admin | all buses on the map |
| GET | `/admin/drivers`, `/admin/users` | admin | list drivers / users |
| GET | `/driver/me` | driver | my bus and route |
| POST | `/driver/location` | driver | send current latitude/longitude |
| PUT | `/driver/duty` | driver | go on or off duty |
| GET | `/user/me` | user | my profile |
| PUT/DELETE | `/user/route` | user | choose or leave a route and stop |
| GET | `/user/tracking` | user | **live position of my driver**, distance and ETA |

Every request needs a JWT in the header `Authorization: Bearer <token>`. You get the token from the login endpoints.

## Before going to production
- Set a strong `SECRET_KEY` and change the admin password (see `back/.env.example`).
- Serve the app over HTTPS. Phones only allow GPS access on HTTPS pages (or on localhost).
- The ETA assumes an average speed of 25 km/h, measured in a straight line. For road-accurate ETAs, plug in a routing API such as OSRM or Google Directions.

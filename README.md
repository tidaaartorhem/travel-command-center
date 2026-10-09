# Travel Command Center — will this trip actually work?

Business travelers keep their itineraries in confirmation emails, and the only
number anyone checks is the departure time. Nobody answers the questions that
actually decide whether a trip survives reality: is this route chronically late?
Is a 45-minute connection at O'Hare a plan or a wish? What should I do the
morning of the flight?

Travel Command Center answers all three from real data. Every leg is scored
against the US Bureau of Transportation Statistics' airline on-time records,
every layover is tested against airport minimum connection times and the
inbound route's real delay behavior, and a deterministic morning-of brief turns
the numbers into a plan: check-in state, when to be at the airport, what to
watch.

**Live:** https://travel-command-center.web.app

## What it does

- **Trip overview** — all upcoming trips with per-leg risk bands (LOW / ELEVATED / HIGH / UNKNOWN), airport names from OpenFlights coordinates, and total trip distance.
- **Per-leg risk board** — each leg scored from its route's real July 2026 record: on-time share, average arrival delay, cancellation rate, and the number of flights behind the numbers.
- **Layover feasibility** — scheduled layover vs. minimum connection time, with an estimated misconnect probability derived from the inbound route's observed on-time share and delay tail. Illegal connections (under MCT) are flagged as HIGH, no hedging.
- **Route risk board** — all 9,401 scored routes, searchable and rankable, so you can compare carriers on the same route before booking.
- **Morning-of brief** — deterministic brief per trip: headline risk, check-in state relative to the brief date, airport timing, and the top watch items.
- **Add your own itinerary** — paste a CSV in the same schema as the seed file; the browser scores it against the bundled route statistics with the same rules as the Python engine.
- **No-data honesty** — routes outside BTS scope (e.g. international feeders) show as UNKNOWN with an explicit "not scored" note, never a guess.

## The data (real, no synthetic)

- **Flight statistics:** US Bureau of Transportation Statistics, Airline On-Time Performance, Table 236, July 2026 monthly file — 631,970 flight records aggregated into 9,401 (carrier, origin, dest) route statistics. Download: `https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_2026_7.zip`. The August 2026 file was not yet available on the morning of this build (BTS lags ~2 months), so July 2026 is the current month used.
- **Airports:** OpenFlights `airports.dat` (public domain mirror, jpatokal/openflights) — 7,698 airports with names, IATA codes, and coordinates. Raw: `https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat`.
- **Itineraries:** the seed trips are sample business itineraries in `data/raw/seed_trips.csv`; their routes were chosen from carriers and routes that actually appear in the July 2026 BTS file. BTS covers US reporting carriers, so US-domestic routes only.

Full provenance: `data/provenance.json`.

## Method

Deterministic rules over observed statistics. A route is scored from cancellation
rate (2+ pts if ≥2%), on-time share (2 pts if <70%), and average arrival delay
(1-2 pts if ≥25/40 min): 4+ points = HIGH, 2-3 = ELEVATED, else LOW. Misconnect
probability models inbound delay as a two-point mixture (on-time flights on
schedule, late flights at 2.2× the route's mean delay) and checks whether the
layover still clears the minimum connection time. Same inputs always give the
same output — no model, no prediction, no LLM. See `services/risk.py`.

## Architecture

```
data/raw/            otp_2026_7.zip (BTS July 2026), airports.dat, seed_trips.csv
services/            Python service layer (pandas)
  ingest.py          itinerary CSV -> trip objects
  risk.py            BTS aggregation + disruption bands + misconnect model
  airports.py        OpenFlights airport context
  briefing.py        deterministic morning-of brief generator
  main.py            CLI: builds web/public/tripdata.json from the raw data
web/                 React + TypeScript + Vite frontend (light mode)
  src/risk.ts        browser-side copy of the scoring rules (used by the upload panel)
  src/upload.ts      itinerary CSV parser
  public/tripdata.json  derived bundle (1.7 MB) — the only thing the UI reads
```

The frontend never reads the raw BTS zip; it renders the derived bundle.

## Run the tests

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest services/tests -q     # 25 tests
cd web && npm install && npm test                 # 20 tests
```

## Rebuild the data bundle

```bash
.venv/bin/python -m services.main \
  --bts data/raw/otp_2026_7.zip \
  --airports data/raw/airports.dat \
  --trips data/raw/seed_trips.csv \
  --out web/public/tripdata.json \
  --today 2026-10-09
cd web && npm run build
```

## Redeploy

Firebase Hosting, site `travel-command-center` (project `portfolio-3da31`):

```bash
~/workspace/tools/node_modules/.bin/firebase deploy --only hosting:travel-command-center
```

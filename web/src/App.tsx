import { useEffect, useMemo, useState } from 'react';
import type { TripBundle } from './types';
import { TripCard } from './components/TripCard';
import { TripDetail } from './components/TripDetail';
import { RouteBoard } from './components/RouteBoard';
import { UploadPanel } from './components/UploadPanel';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; bundle: TripBundle }
  | { status: 'error'; message: string };

type View = 'trips' | 'routes' | 'upload';

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [view, setView] = useState<View>('trips');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('./tripdata.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} while fetching tripdata.json`);
        return res.json() as Promise<TripBundle>;
      })
      .then((bundle) => {
        if (!cancelled) {
          setState({ status: 'ready', bundle });
          setSelected(bundle.trips[0]?.trip_id ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, []);

  const activeTrip = useMemo(() => {
    if (state.status !== 'ready') return null;
    return state.bundle.trips.find((t) => t.trip_id === selected) ?? state.bundle.trips[0] ?? null;
  }, [state, selected]);

  return (
    <div className="app">
      <div className="hero">
        <div className="eyebrow" data-n="01">Trip command center</div>
        <h1>Will this trip <span className="grad">actually work?</span></h1>
        <p>
          Business itineraries live in confirmation emails, and the only number anyone
          checks is the departure time. This scores every leg against real US airline
          on-time statistics, tests whether the layovers survive reality, and writes the
          morning-of brief so the day starts with a plan instead of a surprise.
        </p>
        {state.status === 'ready' && (
          <div className="meta">
            <span className="pill">{state.bundle.summary.trips} trips · {state.bundle.summary.legs} legs</span>
            <span className="pill">{state.bundle.summary.routes_scored.toLocaleString()} routes scored</span>
            <span className="pill">{state.bundle.summary.bts_rows.toLocaleString()} BTS flight records</span>
            <span className="pill">data month: July 2026</span>
          </div>
        )}
      </div>

      <div className="tabs">
        <button className={`tab${view === 'trips' ? ' on' : ''}`} onClick={() => setView('trips')}>01 Trips</button>
        <button className={`tab${view === 'routes' ? ' on' : ''}`} onClick={() => setView('routes')}>02 Route board</button>
        <button className={`tab${view === 'upload' ? ' on' : ''}`} onClick={() => setView('upload')}>03 Add itinerary</button>
      </div>

      {state.status === 'loading' && <div className="card" style={{ marginTop: 24 }}>Loading trip data…</div>}
      {state.status === 'error' && <div className="card" style={{ marginTop: 24 }}><div className="err">{state.message}</div></div>}

      {state.status === 'ready' && view === 'trips' && (
        <>
          <div className="eyebrow" data-n="02">Upcoming trips</div>
          <div className="grid3">
            {state.bundle.trips.map((t) => (
              <TripCard key={t.trip_id} trip={t} active={t.trip_id === activeTrip?.trip_id} onClick={() => setSelected(t.trip_id)} />
            ))}
          </div>
          {activeTrip && (
            <>
              <div className="eyebrow" data-n="03">Trip detail</div>
              <TripDetail
                trip={activeTrip}
                brief={state.bundle.briefs[activeTrip.trip_id] ?? null}
                airports={state.bundle.airports}
              />
            </>
          )}
        </>
      )}

      {state.status === 'ready' && view === 'routes' && (
        <>
          <div className="eyebrow" data-n="02">Route risk board</div>
          <p className="sub" style={{ maxWidth: 720 }}>
            Every route with observations in the July 2026 BTS file, ranked by disruption
            risk. Bands come from cancellation rate, on-time share, and average arrival delay.
          </p>
          <RouteBoard routes={state.bundle.route_table} />
        </>
      )}

      {state.status === 'ready' && view === 'upload' && (
        <>
          <div className="eyebrow" data-n="02">Score your own itinerary</div>
          <UploadPanel routes={state.bundle.route_table} />
        </>
      )}

      <div className="footer">
        <div className="eyebrow" data-n="04">Data provenance</div>
        <div className="kv"><span className="k">Flight statistics</span><span className="v">US Bureau of Transportation Statistics, Airline On-Time Performance, Table 236 — July 2026 monthly file, 631,970 records</span></div>
        <div className="kv"><span className="k">Airports</span><span className="v">OpenFlights airports.dat (public domain mirror), 7,698 airports</span></div>
        <div className="kv"><span className="k">Scope</span><span className="v">US reporting carriers; international feeder legs show as unscored rather than guessed</span></div>
        <div className="kv"><span className="k">Method</span><span className="v">Deterministic rules over observed statistics — no model, no prediction, no LLM</span></div>
      </div>
    </div>
  );
}

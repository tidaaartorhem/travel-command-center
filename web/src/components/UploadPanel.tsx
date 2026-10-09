import { useState } from 'react';
import type { RouteStats } from '../types';
import { parseItineraryCsv } from '../upload';
import { scoreUploadedTrip, type UploadedTripResult } from '../risk';
import { fmtClock, fmtDate, pct } from '../format';

const EXAMPLE = `trip_id,trip_name,leg_no,flight,carrier,origin,dest,date,dep,arr,confirmation
sfq,Client Onsite SF,1,UA 1544,UA,ORD,SFO,2026-10-28,06:00,08:45,XK2P
sfq,Client Onsite SF,2,AS 322,AS,SFO,SEA,2026-10-28,10:15,12:20,XK2P`;

export function UploadPanel({ routes }: { routes: RouteStats[] }) {
  const [text, setText] = useState(EXAMPLE);
  const [results, setResults] = useState<UploadedTripResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    try {
      const parsed = parseItineraryCsv(text);
      const routeMap = new Map(routes.map((r) => [`${r.carrier}|${r.origin}|${r.dest}`, r]));
      setResults(parsed.map((t) => scoreUploadedTrip(t.tripName, t.legs, routeMap)));
    } catch (e) {
      setResults(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Add your own itinerary</h3>
        <div className="sub" style={{ marginBottom: 10 }}>
          Paste an itinerary CSV (same columns as the seed file: trip_id, trip_name, leg_no,
          flight, carrier, origin, dest, date, dep, arr, confirmation). Legs are scored in your
          browser against the bundled route statistics.
        </div>
        <textarea className="csv" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        <div>
          <button className="cta" onClick={run}>Score this itinerary</button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>

      {results?.map((r, i) => (
        <div className="card" key={i} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <h3 style={{ fontSize: 19 }}>{r.name}</h3>
            <span className={`band ${r.tripBand}`}>Trip risk: {r.tripBand}</span>
          </div>
          {r.legs.map((l) => (
            <div className="leg-row" key={l.flight}>
              <div style={{ flex: 1 }}>
                <div className="route">{l.origin} <span style={{ color: 'var(--teal)' }}>→</span> {l.dest}</div>
                <div className="statline">
                  <span><b>{l.flight}</b></span>
                  <span>{fmtDate(l.date)} · {fmtClock(l.dep)} – {fmtClock(l.arr)}</span>
                </div>
                {l.stats && (
                  <div className="statline">
                    <span>on-time <b>{l.stats.on_time_pct}%</b></span>
                    <span>avg delay <b>{l.stats.avg_arr_delay_min} min</b></span>
                    <span>cancelled <b>{l.stats.cancelled_pct}%</b></span>
                  </div>
                )}
              </div>
              <span className={`band ${l.band}`}>{l.band}</span>
            </div>
          ))}
          {r.connections.map((c) => (
            <div key={c.from_flight + c.to_flight} className="sub" style={{ padding: '8px 0' }}>
              {c.airport}: {c.layover_min} min layover {c.from_flight} → {c.to_flight}
              {' '}(minimum {c.mct_min} min)
              {c.misconnect_prob != null && <> — misconnect estimate <b>{pct(c.misconnect_prob)}</b></>}
              {' '}<span className={`band ${c.band}`}>{c.tight ? 'Too tight' : c.band}</span>
            </div>
          ))}
          {r.alerts.map((a, j) => (
            <div className={`alert ${a.severity}`} key={j}>{a.text}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

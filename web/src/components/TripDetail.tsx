import type { AirportInfo, MorningBrief, ScoredTrip } from '../types';
import { fmtClock, fmtDate, fmtKm, pct } from '../format';

export function TripDetail({ trip, brief, airports }: {
  trip: ScoredTrip; brief: MorningBrief | null; airports: Record<string, AirportInfo>;
}) {
  const airportName = (code: string) => {
    const a = airports[code];
    return a ? `${a.name} (${a.city})` : code;
  };
  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ fontSize: 24 }}>{trip.name}</h2>
          <span className={`band ${trip.trip_band}`}>Trip risk: {trip.trip_band}</span>
        </div>
        <div className="sub" style={{ marginTop: 6 }}>
          {trip.total_distance_km != null && <>{fmtKm(trip.total_distance_km)} total distance · </>}
          Confirmation {trip.legs[0]?.confirmation || '—'}
        </div>
        {trip.legs.map((l) => (
          <div className="leg-row" key={l.flight + l.date}>
            <div style={{ flex: 1 }}>
              <div className="route">{l.origin} <span style={{ color: 'var(--teal)' }}>→</span> {l.dest}</div>
              <div className="sub">{airportName(l.origin)} to {airportName(l.dest)}</div>
              <div className="statline">
                <span><b>{l.flight}</b></span>
                <span>{fmtDate(l.date)} · {fmtClock(l.dep)} – {fmtClock(l.arr)}</span>
                {l.distance_km != null && <span>{fmtKm(l.distance_km)}</span>}
              </div>
              {l.stats && (
                <div className="statline">
                  <span>on-time <b>{l.stats.on_time_pct}%</b></span>
                  <span>avg delay <b>{l.stats.avg_arr_delay_min} min</b></span>
                  <span>cancelled <b>{l.stats.cancelled_pct}%</b></span>
                  <span className="mono">{l.stats.flights.toLocaleString()} flights</span>
                </div>
              )}
            </div>
            <span className={`band ${l.band}`}>{l.band}</span>
          </div>
        ))}
      </div>

      {trip.connections.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, marginBottom: 8 }}>Layover feasibility</h3>
          {trip.connections.map((c) => (
            <div key={c.from_flight + c.to_flight} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <b>{c.airport}</b> · {c.from_flight} → {c.to_flight}
                  <div className="sub">
                    {c.layover_min} min scheduled vs {c.mct_min} min minimum connection time
                    {c.misconnect_prob != null && <> · misconnect estimate <b>{pct(c.misconnect_prob)}</b></>}
                  </div>
                </div>
                <span className={`band ${c.band}`}>{c.tight ? 'Too tight' : c.band}</span>
              </div>
              {c.misconnect_prob != null && (
                <div className="bar" style={{ marginTop: 8 }}>
                  <i style={{ width: `${Math.round(c.misconnect_prob * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 4 }}>Alerts</h3>
          {trip.alerts.length === 0 && <div className="sub">No alerts — every leg and connection looks clean.</div>}
          {trip.alerts.map((a, i) => (
            <div className={`alert ${a.severity}`} key={i}>{a.text}</div>
          ))}
        </div>
        {brief && (
          <div className="card">
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Morning-of brief</h3>
            <div className="brief-block"><div className="k">Headline</div><div className="v">{brief.headline}</div></div>
            <div className="brief-block"><div className="k">Check-in</div><div className="v">{brief.checkin}</div></div>
            <div className="brief-block"><div className="k">Airport timing</div><div className="v">{brief.leave_by}</div></div>
            <div className="brief-block"><div className="k">Watch list</div>
              {brief.watch.length === 0 && <div className="v sub">Nothing to watch.</div>}
              {brief.watch.map((w, i) => <div className="v" key={i} style={{ marginBottom: 6 }}>→ {w}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

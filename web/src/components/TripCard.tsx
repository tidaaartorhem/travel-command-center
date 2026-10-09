import type { ScoredTrip } from '../types';
import { fmtDate, fmtKm } from '../format';

export function TripCard({ trip, onClick, active }: {
  trip: ScoredTrip; onClick: () => void; active: boolean;
}) {
  return (
    <div className={`card trip-card${active ? ' active' : ''}`} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span className={`band ${trip.trip_band}`}>{trip.trip_band}</span>
        <span className="sub mono">{fmtDate(trip.legs[0].date)}</span>
      </div>
      <h3 style={{ margin: '12px 0 6px', fontSize: 20 }}>{trip.name}</h3>
      <div className="sub">
        {trip.legs.map((l) => `${l.origin} → ${l.dest}`).join('  ·  ')}
      </div>
      <div className="statline" style={{ marginTop: 12 }}>
        <span><b>{trip.legs.length}</b> legs</span>
        <span><b>{fmtKm(trip.total_distance_km)}</b> total</span>
        <span><b>{trip.connections.length}</b> connection{trip.connections.length === 1 ? '' : 's'}</span>
        <span><b>{trip.alerts.length}</b> alert{trip.alerts.length === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

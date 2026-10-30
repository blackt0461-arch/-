// Transit travel time from Google Maps (Maps JavaScript API, routes library). Browser only.
// The API key must be restricted to this site's address in Google Cloud.

let loading = null;

function loadMaps(apiKey) {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    window.__alarmMapsReady = () => resolve();
    const s = document.createElement('script');
    const q = new URLSearchParams({ key: apiKey, v: 'weekly', loading: 'async', language: 'ja', region: 'JP', callback: '__alarmMapsReady' });
    s.src = `https://maps.googleapis.com/maps/api/js?${q}`;
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error('Googleマップを読み込めませんでした')); };
    document.head.append(s);
  });
  return loading;
}

const hm = d => d.toLocaleTimeString('ja-JP', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Tokyo' });

// Minutes needed to leave `origin` and be at `destination` by `arriveBy` (a Date), by train.
// Counted from the moment you must leave the origin until `arriveBy`, so waiting at the
// destination is included and the result errs on the safe side.
export async function transitMinutes({ apiKey, origin, destination, arriveBy }) {
  await loadMaps(apiKey);
  const { Route } = await google.maps.importLibrary('routes');
  const { routes } = await Route.computeRoutes({
    origin,
    destination,
    travelMode: 'TRANSIT',
    arrivalTime: arriveBy,
    language: 'ja',
    region: 'JP',
    fields: ['durationMillis', 'legs'],
  });
  const route = routes?.[0];
  if (!route) throw new Error('経路が見つかりませんでした');
  const steps = route.legs?.flatMap(l => l.steps || []) || [];
  const firstIdx = steps.findIndex(s => s.transitDetails?.departureTime);
  let leave;
  let summary;
  if (firstIdx >= 0) {
    const first = steps[firstIdx].transitDetails;
    const walkBefore = steps.slice(0, firstIdx).reduce((sum, s) => sum + (s.staticDurationMillis || 0), 0);
    leave = new Date(first.departureTime.getTime() - walkBefore);
    const line = first.transitLine?.shortName || first.transitLine?.name || '';
    const stop = first.departureStop?.name || '';
    summary = `${stop} ${hm(first.departureTime)}発${line ? ` ${line}` : ''}`;
  } else if (route.durationMillis) {
    leave = new Date(arriveBy.getTime() - route.durationMillis);
    summary = '徒歩';
  } else {
    throw new Error('所要時間を取得できませんでした');
  }
  const minutes = Math.ceil((arriveBy.getTime() - leave.getTime()) / 60000);
  if (!(minutes > 0 && minutes <= 600)) throw new Error(`所要時間が不正です（${minutes}分）`);
  return { minutes, summary };
}

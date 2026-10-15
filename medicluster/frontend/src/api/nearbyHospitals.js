// Nearby hospitals/clinics from OpenStreetMap (Overpass API), sorted by distance.

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @param {{lat:number,lng:number}} c  search centre
 * @param {number} radiusKm
 * @returns {Promise<Array<{place_id,name,address,phone,emergency,lat,lng,isHospital,rating,distKm}>>}
 */
export async function fetchNearbyHospitals(c, radiusKm) {
  const r = radiusKm * 1000;
  const overpassQuery = `[out:json][timeout:25];(node["amenity"="hospital"](around:${r},${c.lat},${c.lng});way["amenity"="hospital"](around:${r},${c.lat},${c.lng});node["amenity"="clinic"](around:${r},${c.lat},${c.lng});node["healthcare"="hospital"](around:${r},${c.lat},${c.lng}););out center;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: overpassQuery,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Overpass error ${res.status}`);
  const data = await res.json();
  return (data.elements ?? [])
    .filter((e) => (e.lat && e.lon) || (e.center?.lat && e.center?.lon))
    .map((e) => {
      const lat = e.lat ?? e.center.lat;
      const lng = e.lon ?? e.center.lon;
      const tags = e.tags ?? {};
      return {
        place_id: String(e.id),
        name: tags.name || tags["name:en"] || "Hospital",
        address: tags["addr:street"]
          ? `${tags["addr:housenumber"] || ""} ${tags["addr:street"]}`.trim()
          : tags["addr:full"] || "",
        phone: tags.phone || tags["contact:phone"] || "",
        emergency: tags.emergency === "yes",
        lat, lng,
        isHospital: tags.amenity === "hospital" || tags.healthcare === "hospital",
        rating: null,
        distKm: haversine(c.lat, c.lng, lat, lng),
      };
    })
    .sort((a, b) => a.distKm - b.distKm);
}

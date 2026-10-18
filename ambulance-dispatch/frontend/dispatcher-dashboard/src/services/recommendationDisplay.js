// Nearby API distances are great-circle kilometres, not road distances or ETAs.
export function formatDistanceKm(distance) {
  return typeof distance === 'number' && Number.isFinite(distance) && distance >= 0
    ? `${distance.toFixed(1)} km` : 'Unavailable';
}

export function formatEta(minutes) {
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0
    ? `${minutes} min` : 'Unavailable';
}

export function formatHospitalScore(score) {
  return typeof score === 'number' && Number.isFinite(score) ? `${score.toFixed(0)} points` : 'Unavailable';
}

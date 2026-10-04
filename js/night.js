// Night-mode window check. Handles windows that wrap midnight (23:00 -> 07:00).

function minutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function isNight(date, nightMode) {
  if (!nightMode) return false;
  const start = minutes(nightMode.start);
  const end = minutes(nightMode.end);
  const now = date.getHours() * 60 + date.getMinutes();
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

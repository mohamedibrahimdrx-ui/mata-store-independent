// Day/month boundaries in Egypt local time (Africa/Cairo, including daylight saving), so "today" and
// "this month" match the shop owner's calendar and not UTC.
const TZ = "Africa/Cairo";
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function partsAt(ms) {
  const out = {};
  for (const part of formatter.formatToParts(new Date(ms))) if (part.type !== "literal") out[part.type] = Number(part.value);
  return out;
}
// Difference between Cairo wall-clock time and UTC at a given instant (in ms).
function offsetMs(ms) {
  const p = partsAt(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
// UTC instant of the first moment of the Cairo calendar day y-m-d (month is 1-12).
function startOfDayUtc(y, m, d) {
  const naive = Date.UTC(y, m - 1, d);
  const guess = naive - offsetMs(naive);
  return naive - offsetMs(guess);
}
const pad = (n) => String(n).padStart(2, "0");
function localDate(ms) {
  const p = partsAt(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
function todayInCairo() {
  return localDate(Date.now());
}

// Accepts "YYYY-MM-DD" or "YYYY-MM"; returns null when the date does not exist.
function parseDate(value) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(value || ""));
  if (!match) return null;
  const y = Number(match[1]); const m = Number(match[2]); const d = match[3] ? Number(match[3]) : 1;
  if (y < 2020 || y > 2100 || m < 1 || m > 12) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

function dayRange({ y, m, d }) {
  return { from: startOfDayUtc(y, m, d), to: startOfDayUtc(y, m, d + 1) };
}
function monthRange({ y, m }) {
  return { from: startOfDayUtc(y, m, 1), to: startOfDayUtc(y, m + 1, 1) };
}

module.exports = { TZ, localDate, todayInCairo, parseDate, dayRange, monthRange, startOfDayUtc };

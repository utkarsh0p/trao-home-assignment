const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now" / "4 hours ago" / "3 days ago" — no date library for one helper. */
export function formatRelative(value) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";

  const elapsed = Date.now() - then;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), "hour");
  if (elapsed < 30 * DAY) return plural(Math.floor(elapsed / DAY), "day");

  return new Date(then).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function plural(count, unit) {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

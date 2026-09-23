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

/**
 * "3h 45m" / "45m" / "2h". Minutes are integers by contract (brief §5), so there is
 * nothing to round — and rounding was the bug: Math.round(29 / 60) rendered a 29-minute
 * plan as "0 hours of work".
 */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.trunc(minutes ?? 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

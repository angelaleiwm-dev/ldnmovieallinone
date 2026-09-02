// Shared normalization logic used by every "combine" step (combine.mjs
// for the main site, combine-lff.mjs for the festival section) — turns
// whatever date/time format a fetcher gives into one consistent shape.
// Kept in one place so both pipelines stay in sync automatically rather
// than risking two copies drifting apart.

const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10,
  december: 11, dec: 11,
};

// Some fetchers (Prince Charles Cinema: "Wednesday 26th August", BFI:
// "Sat 5 Sep", LFF: "07 October 2026") give dates as human text, some
// with a year and some without. Others (Cineworld, Vue, Picturehouse)
// already give ISO dates. This turns any of them into "YYYY-MM-DD".
export function normalizeDate(rawDate, referenceDate) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;

  const match = rawDate.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = MONTHS[match[2].toLowerCase()];
  if (month === undefined) return null;

  // Use an explicit year if the text gave one (LFF does). Otherwise
  // assume the current year — unless that would put the date far in the
  // past, which means it must mean next year; cinema listings only ever
  // show upcoming dates.
  if (match[3]) {
    return new Date(Date.UTC(parseInt(match[3], 10), month, day)).toISOString().slice(0, 10);
  }

  let year = referenceDate.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, month, day));
  const diffDays = (candidate - referenceDate) / 86400000;
  if (diffDays < -180) {
    candidate = new Date(Date.UTC(year + 1, month, day));
  }

  return candidate.toISOString().slice(0, 10);
}

// Adds minutes to a "YYYY-MM-DDTHH:MM:SS" string and returns the same
// format. Deliberately avoids `new Date(dateTime)` on a string with no
// timezone suffix — that's parsed as the SERVER's local time in JS, which
// would silently break this math if the fetch step ever runs somewhere
// other than the UK. Using Date.UTC purely as neutral arithmetic (not as
// a real UTC instant) keeps this stable regardless of server timezone,
// since every value here is only ever compared to another value computed
// the same way.
export function addMinutes(dateTime, minutes) {
  const [datePart, timePart] = dateTime.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min, s] = timePart.split(":").map(Number);
  const ms = Date.UTC(y, m - 1, d, h, min, s) + minutes * 60000;
  return new Date(ms).toISOString().slice(0, 19);
}

// Some fetchers give 24-hour "HH:MM" already. Prince Charles Cinema gives
// "2:30 pm". This turns either into "HH:MM" 24-hour.
export function normalizeTime(rawTime) {
  if (/^\d{2}:\d{2}$/.test(rawTime)) return rawTime;

  const match = rawTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const period = match[3].toLowerCase();
  if (period === "pm" && hour !== 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/**
 * Normalizes a fetcher's raw showings into the combined-JSON shape.
 * Unparsable date/times are skipped and recorded in `errors` (pushed
 * into the array passed in) rather than silently dropped.
 */
export function normalizeShowings(rawShowings, fetcherName, referenceDate, errors) {
  const results = [];

  for (const showing of rawShowings) {
    const date = normalizeDate(showing.date, referenceDate);
    const time = normalizeTime(showing.time);
    if (!date || !time) {
      errors.push({ fetcher: fetcherName, reason: "unparsable date/time", showing });
      continue;
    }

    const dateTime = `${date}T${time}:00`;
    const runtimeMinutes =
      typeof showing.runtimeMinutes === "number" ? showing.runtimeMinutes : null;
    // The double/triple-bill planners need to know when a film actually
    // ends — precompute it here once, rather than have every consumer
    // redo the same date-math (and get it wrong at midnight boundaries).
    const endDateTime = runtimeMinutes ? addMinutes(dateTime, runtimeMinutes) : null;

    results.push({
      cinema: showing.cinema,
      film: showing.film,
      date,
      time,
      dateTime,
      runtimeMinutes,
      endDateTime,
      format: showing.format ?? null,
      bookingUrl: showing.bookingUrl,
    });
  }

  return results;
}

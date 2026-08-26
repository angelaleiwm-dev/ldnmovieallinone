// Core double-bill matching logic — no DOM code here, just data in,
// candidate pairings out, so this can be tested/reasoned about on its
// own. See web/zones.mjs for the travel-time rules this leans on.

import { minGapMinutes, MAX_GAP_MIN } from "./zones.mjs";
import { normalizeTitleForGrouping } from "./title-utils.mjs";

function toEpochMinutes(dateTime) {
  // dateTime is "YYYY-MM-DDTHH:MM:SS" from combine.mjs, built with
  // timezone-neutral arithmetic — parse it the same way here rather than
  // risk `new Date(dateTime)`'s local-timezone ambiguity on a string with
  // no timezone suffix.
  const [datePart, timePart] = dateTime.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = timePart.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, min) / 60000;
}

/**
 * Finds every valid double-bill pairing within `showings`.
 *
 * A pairing is valid when:
 * - Film A and Film B are different films
 * - Film B starts after Film A ends, with at least the required minimum
 *   gap for that cinema pair (see zones.mjs) — and that requirement can
 *   be null, meaning the pairing is excluded outright (too far apart)
 * - The gap is not so large it stops being "one evening" (MAX_GAP_MIN)
 *
 * Deliberately does NOT filter by matching `date` strings — comparing
 * real start/end timestamps (which is what the gap check already does)
 * naturally handles a film that runs past midnight without needing any
 * special-case date logic.
 *
 * Only showings with a known runtime can be Film A (we need to know when
 * it ends). Any showing can be Film B — only its start time matters.
 *
 * Pass `filmA` / `filmB` (film titles) to restrict the search to two
 * specific films; omit both for "surprise me" across everything given.
 */
export function findPairs(showings, { filmA = null, filmB = null } = {}) {
  const filmAKey = filmA ? normalizeTitleForGrouping(filmA) : null;
  const filmBKey = filmB ? normalizeTitleForGrouping(filmB) : null;

  const candidatesA = showings.filter((s) => {
    if (!s.runtimeMinutes || !s.endDateTime) return false;
    if (filmAKey && normalizeTitleForGrouping(s.film) !== filmAKey) return false;
    return true;
  });

  const results = [];

  for (const a of candidatesA) {
    const aKey = normalizeTitleForGrouping(a.film);
    const aEndMin = toEpochMinutes(a.endDateTime);

    for (const b of showings) {
      if (a === b) continue;

      const bKey = normalizeTitleForGrouping(b.film);
      if (bKey === aKey) continue; // must be a different film
      if (filmBKey && bKey !== filmBKey) continue;
      // In two-specific-films mode, respect whichever film the caller
      // named as "A" vs "B" — don't also match the reverse order here,
      // the caller runs both orders if they want both.
      if (filmAKey && filmBKey && bKey !== filmBKey) continue;

      const gapMin = toEpochMinutes(b.dateTime) - aEndMin;
      if (gapMin <= 0) continue; // B doesn't start after A ends

      const required = minGapMinutes(a.cinema, b.cinema);
      if (required == null) continue; // excluded pairing
      if (gapMin < required) continue; // too tight
      if (gapMin > MAX_GAP_MIN) continue; // not "one evening" anymore

      results.push({
        filmA: a,
        filmB: b,
        gapMinutes: gapMin,
        sameCinema: a.cinema === b.cinema,
      });
    }
  }

  results.sort((x, y) => {
    if (x.sameCinema !== y.sameCinema) return x.sameCinema ? -1 : 1;
    return x.gapMinutes - y.gapMinutes;
  });

  return results;
}

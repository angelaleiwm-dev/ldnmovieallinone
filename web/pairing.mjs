// Core double/triple-bill matching logic — no DOM code here, just data
// in, candidate pairings out, so this can be tested/reasoned about on
// its own and reused by both the main planner (web/zones.mjs's gap
// rules) and the LFF planner (web/lff-zones.mjs's gap rules).

import { MAX_GAP_MIN } from "./zones.mjs";
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

// Core primitive: given one specific showing that's already been chosen
// as "the film you just watched," find every other showing that could
// validly follow it — different film, starts after this one ends with
// at least the required gap for that cinema/venue pair, and not so far
// out it stops being "one evening." Both findPairs and findTriples are
// built on this, so a triple bill is just "find a follower, then find a
// follower of that."
//
// Deliberately does NOT filter by matching `date` strings — comparing
// real start/end timestamps naturally handles a film that runs past
// midnight without needing any special-case date logic.
function findFollowers(fromShowing, showings, minGapFn, filmKeyFilter) {
  if (!fromShowing.runtimeMinutes || !fromShowing.endDateTime) return [];

  const fromKey = normalizeTitleForGrouping(fromShowing.film);
  const fromEndMin = toEpochMinutes(fromShowing.endDateTime);
  const results = [];

  for (const next of showings) {
    if (next === fromShowing) continue;

    const nextKey = normalizeTitleForGrouping(next.film);
    if (nextKey === fromKey) continue; // must be a different film
    if (filmKeyFilter && nextKey !== filmKeyFilter) continue;

    const gapMin = toEpochMinutes(next.dateTime) - fromEndMin;
    if (gapMin <= 0) continue; // doesn't start after fromShowing ends

    const required = minGapFn(fromShowing.cinema, next.cinema);
    if (required == null) continue; // excluded pairing (too far apart)
    if (gapMin < required) continue; // too tight
    if (gapMin > MAX_GAP_MIN) continue; // not "one evening" anymore

    results.push({
      showing: next,
      gapMinutes: gapMin,
      sameCinema: fromShowing.cinema === next.cinema,
    });
  }

  return results;
}

/**
 * Finds every valid double-bill pairing within `showings`, using
 * `minGapFn(cinemaA, cinemaB)` to decide the minimum gap required (or
 * `null` to exclude that pairing outright) — see zones.mjs / lff-zones.mjs.
 *
 * Only showings with a known runtime can be Film A (we need to know when
 * it ends). Any showing can be Film B — only its start time matters.
 *
 * Pass `filmA` / `filmB` (film titles) to restrict the search to two
 * specific films; omit both for "surprise me" across everything given.
 */
export function findPairs(showings, minGapFn, { filmA = null, filmB = null } = {}) {
  const filmAKey = filmA ? normalizeTitleForGrouping(filmA) : null;
  const filmBKey = filmB ? normalizeTitleForGrouping(filmB) : null;

  const candidatesA = showings.filter((s) => {
    if (!s.runtimeMinutes || !s.endDateTime) return false;
    if (filmAKey && normalizeTitleForGrouping(s.film) !== filmAKey) return false;
    return true;
  });

  const results = [];
  for (const a of candidatesA) {
    for (const f of findFollowers(a, showings, minGapFn, filmBKey)) {
      results.push({
        filmA: a,
        filmB: f.showing,
        gapMinutes: f.gapMinutes,
        sameCinema: f.sameCinema,
      });
    }
  }

  results.sort((x, y) => {
    if (x.sameCinema !== y.sameCinema) return x.sameCinema ? -1 : 1;
    return x.gapMinutes - y.gapMinutes;
  });

  return results;
}

/**
 * Finds every valid triple-bill (A then B then C), by chaining
 * findFollowers twice: every valid A→B pair from findPairs, then every
 * valid follower of B to serve as C — with C also required to be a
 * different film from A (findFollowers on its own only guarantees C
 * differs from B).
 *
 * Pass `filmA` / `filmB` / `filmC` to restrict to specific films; any
 * combination may be omitted for "surprise me" on the rest.
 */
export function findTriples(
  showings,
  minGapFn,
  { filmA = null, filmB = null, filmC = null } = {}
) {
  const filmCKey = filmC ? normalizeTitleForGrouping(filmC) : null;
  const pairs = findPairs(showings, minGapFn, { filmA, filmB });

  const results = [];
  for (const ab of pairs) {
    const aKey = normalizeTitleForGrouping(ab.filmA.film);
    for (const f of findFollowers(ab.filmB, showings, minGapFn, filmCKey)) {
      if (normalizeTitleForGrouping(f.showing.film) === aKey) continue; // C must differ from A too
      results.push({
        filmA: ab.filmA,
        filmB: ab.filmB,
        filmC: f.showing,
        gapAB: ab.gapMinutes,
        gapBC: f.gapMinutes,
        allSameCinema: ab.sameCinema && f.sameCinema,
      });
    }
  }

  results.sort((x, y) => {
    if (x.allSameCinema !== y.allSameCinema) return x.allSameCinema ? -1 : 1;
    return x.gapAB + x.gapBC - (y.gapAB + y.gapBC);
  });

  return results;
}

// Geographic zones for the double-bill planner's travel-time rules.
// This is a one-time, hand-tuned data file (per the plan agreed with the
// user) — not a live maps/travel-time lookup. Safe to edit any time a
// cinema moves, or if real usage shows a gap number is wrong; nothing
// else in the app needs to change.

export const ZONES = {
  "Prince Charles Cinema": "west-end",
  "Picturehouse Central": "west-end",
  "Odeon London Haymarket": "west-end",
  "Curzon Soho": "west-end",
  "ICA Cinema": "west-end",

  "Curzon Mayfair": "mayfair",
  "Curzon Bloomsbury": "bloomsbury",

  "BFI Southbank": "south-bank",
  "BFI IMAX": "south-bank",

  "Barbican Cinema": "city",

  "Cineworld O2 Greenwich": "greenwich-peninsula",
  "Odeon Greenwich": "greenwich-town",

  "Vue Westfield Stratford City": "stratford",

  "Genesis Cinema": "genesis",
  "The Castle Cinema": "castle",
  "Rio Cinema": "rio",
};

const SAME_CINEMA_GAP_MIN = 10;
const SAME_ZONE_GAP_MIN = 30;
const CROSS_ZONE_GAP_MIN = 45;
export const MAX_GAP_MIN = 150; // ~2.5 hours — beyond this it's not "one evening"

// A same-zone pairing that's tighter than the 30 min default because the
// two cinemas are genuinely adjacent.
const SAME_ZONE_OVERRIDES = {
  "south-bank": 15, // BFI IMAX and BFI Southbank are essentially next door
};

// Cross-zone pairings that are easier than the 45 min default, because a
// direct tube/bus link makes the trip reliable despite being "different
// zones." Keys are the two zone names, sorted alphabetically and joined
// with "|" — see zoneKey() below.
const CROSS_ZONE_OVERRIDES = {
  "greenwich-peninsula|stratford": 30, // one stop on the Jubilee line
  "castle|genesis": 60, // ~40 min bus in practice
  "castle|rio": 40, // ~30 min trip
  "genesis|rio": 40, // ~30 min trip
};

// Cross-zone pairings excluded entirely — too far apart to reliably plan
// a back-to-back evening around, even within the 150 min cap.
// NOTE: Mayfair and Bloomsbury are inferred to follow the same "far from
// outer London" pattern as the West End/South Bank core zones, since
// that wasn't explicitly confirmed pair-by-pair — flag if wrong.
const OUTER_ZONES = ["greenwich-peninsula", "greenwich-town", "genesis", "castle", "rio"];
const CENTRAL_ZONES = ["west-end", "south-bank", "mayfair", "bloomsbury", "city"];
const EXCLUDED_PAIRS = new Set([
  ...CENTRAL_ZONES.flatMap((central) =>
    OUTER_ZONES.map((outer) => zoneKey(central, outer))
  ),
  zoneKey("mayfair", "bloomsbury"), // 45+ min walk, 35+ min bus best-case
]);
// Stratford is NOT in OUTER_ZONES — Central ↔ Stratford pairings still
// use the default cross-zone 45 min gap (Jubilee/Central line makes it
// workable), except where CROSS_ZONE_OVERRIDES tightens it further.

function zoneKey(zoneA, zoneB) {
  return [zoneA, zoneB].sort().join("|");
}

/**
 * Minimum gap (minutes) required between Film A's end and Film B's start
 * for a valid pairing at these two cinemas. Returns null if the pairing
 * should be excluded outright (too far apart, or an unrecognized cinema).
 */
export function minGapMinutes(cinemaA, cinemaB) {
  if (cinemaA === cinemaB) return SAME_CINEMA_GAP_MIN;

  const zoneA = ZONES[cinemaA];
  const zoneB = ZONES[cinemaB];
  if (!zoneA || !zoneB) return null; // unknown cinema — don't guess

  if (zoneA === zoneB) return SAME_ZONE_OVERRIDES[zoneA] ?? SAME_ZONE_GAP_MIN;

  const key = zoneKey(zoneA, zoneB);
  if (EXCLUDED_PAIRS.has(key)) return null;
  return CROSS_ZONE_OVERRIDES[key] ?? CROSS_ZONE_GAP_MIN;
}

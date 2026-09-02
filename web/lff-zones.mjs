// Gap rules for the LFF double/triple-bill planner. Deliberately much
// simpler than web/zones.mjs's neighborhood-zone model — the festival's
// own venues are more tightly clustered and don't need the same
// geography, per the explicit spec: a flat minimum gap between any two
// different venues, with one specific override for a pair of venues that
// are immediately next to each other.

const SAME_VENUE_GAP_MIN = 10;
const DEFAULT_CROSS_VENUE_GAP_MIN = 30;

// Keys are the two venue names, sorted alphabetically and joined with
// "|" — see venueKey() below.
const CROSS_VENUE_OVERRIDES = {
  "bfi southbank|southbank centre – royal festival hall": 20,
};

function venueKey(venueA, venueB) {
  return [venueA, venueB].map((v) => v.toLowerCase()).sort().join("|");
}

/**
 * Minimum gap (minutes) required between one screening's end and the
 * next one's start, for these two LFF venues. Never excludes a pairing
 * outright (unlike the main planner's zones.mjs) — the festival's venues
 * are all close enough across London to at least be a candidate.
 */
export function lffMinGap(venueA, venueB) {
  if (venueA === venueB) return SAME_VENUE_GAP_MIN;
  return CROSS_VENUE_OVERRIDES[venueKey(venueA, venueB)] ?? DEFAULT_CROSS_VENUE_GAP_MIN;
}

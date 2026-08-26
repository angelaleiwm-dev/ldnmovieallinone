// Cinemas format the same film's title slightly differently — e.g.
// "Coyote vs. ACME" vs "Coyote vs. Acme" (just capitalization), or
// "The Odyssey" vs "The Odyssey (2026)" (a trailing year). This turns
// either into the same key so they match as the same film. It
// deliberately does NOT strip other parenthetical text, because things
// like "Toxic (Kannada)" vs "Toxic (Telugu)" are genuinely different
// screenings (different language prints) that must stay separate.
export function normalizeTitleForGrouping(title) {
  return title
    .toLowerCase()
    .replace(/\(\s*(19|20)\d{2}\s*\)\s*$/, "")
    .trim()
    .replace(/\s+/g, " ");
}

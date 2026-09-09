// "Watchlist" (films you're interested in) and "My Bill" (specific combos
// you've decided on) — both client-side only, no accounts, no backend,
// just localStorage. Namespaced per site ("main" vs "lff") since both
// sites share one browser origin under GitHub Pages (same domain, just a
// different path) and would otherwise silently share one list between two
// completely different datasets.
//
// Known, deliberate limitation: everything here is per-device/per-browser.
// There's no login system anywhere on this site, so there's nothing to
// sync a list to — this matches how the rest of the site is built, not an
// oversight.

import { normalizeTitleForGrouping } from "./title-utils.mjs";

function showingKey(s) {
  return `${s.bookingUrl}|${s.dateTime}`;
}

function comboFilms(combo) {
  return [combo.filmA, combo.filmB, combo.filmC].filter(Boolean);
}

// A stable identity for one saved combo — same films, same specific
// showings, in order. Used to detect "already saved" and to remove the
// right entry later.
export function comboId(combo) {
  return comboFilms(combo)
    .map(showingKey)
    .join("::");
}

export function createBillStore(namespace) {
  const WATCHLIST_KEY = `ldnscreens:watchlist:${namespace}`;
  const BILL_KEY = `ldnscreens:bill:${namespace}`;

  function readList(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      // Corrupt JSON, storage disabled, private browsing, whatever — an
      // empty list is a safe fallback, not a crash.
      return [];
    }
  }

  function writeList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // Storage full/disabled — the feature just silently doesn't persist
      // rather than breaking the rest of the page over something this
      // minor.
    }
  }

  // ---------- Watchlist: film titles only, no showtime attached ----------

  function getWatchlist() {
    return readList(WATCHLIST_KEY);
  }

  function isWatchlisted(title) {
    const key = normalizeTitleForGrouping(title);
    return getWatchlist().some((t) => normalizeTitleForGrouping(t) === key);
  }

  function addToWatchlist(title) {
    if (isWatchlisted(title)) return;
    writeList(WATCHLIST_KEY, [...getWatchlist(), title]);
  }

  function removeFromWatchlist(title) {
    const key = normalizeTitleForGrouping(title);
    writeList(
      WATCHLIST_KEY,
      getWatchlist().filter((t) => normalizeTitleForGrouping(t) !== key)
    );
  }

  // ---------- My Bill: specific saved combos ----------

  // filmA is always the earliest-watched film in a saved combo (the
  // planner only ever builds combos in chronological order), so it's a
  // reliable sort key without needing to inspect every film in the combo.
  function getBill() {
    return readList(BILL_KEY).sort((a, b) =>
      a.combo.filmA.dateTime.localeCompare(b.combo.filmA.dateTime)
    );
  }

  function isInBill(id) {
    return getBill().some((entry) => entry.id === id);
  }

  function addToBill(combo) {
    const id = comboId(combo);
    if (isInBill(id)) return;
    writeList(BILL_KEY, [...getBill(), { id, savedAt: new Date().toISOString(), combo }]);
  }

  function removeFromBill(id) {
    writeList(
      BILL_KEY,
      getBill().filter((entry) => entry.id !== id)
    );
  }

  // A watchlisted film counts as "planned" once it appears in any saved
  // combo — this is the mechanism that links the two features, rather
  // than a separate manual "mark as planned" step.
  function isFilmPlanned(title) {
    const key = normalizeTitleForGrouping(title);
    return getBill().some((entry) =>
      comboFilms(entry.combo).some((s) => normalizeTitleForGrouping(s.film) === key)
    );
  }

  return {
    getWatchlist,
    isWatchlisted,
    addToWatchlist,
    removeFromWatchlist,
    getBill,
    isInBill,
    addToBill,
    removeFromBill,
    isFilmPlanned,
    comboId,
  };
}

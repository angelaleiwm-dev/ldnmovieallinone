// Fetcher: Cineworld O2 Greenwich
// Reads Cineworld's own public JSON API (the same one their website's
// showtimes page calls) and returns a list of
// { cinema, film, date, time, format, bookingUrl } records.
//
// Why a plain HTTP request instead of a browser (unlike Prince Charles
// Cinema): Cineworld's site loads showtimes from a clean REST API, and
// that API works fine with a direct request — no JavaScript rendering
// needed, so this fetcher is much lighter and faster.

import { fileURLToPath } from "node:url";

const CINEMA_NAME = "Cineworld O2 Greenwich";
const TENANT_ID = "10108"; // Cineworld's site-wide ID, same for every UK cinema
const CINEMA_ID = "077"; // Cineworld's internal ID for this specific branch
const API_BASE = "https://www.cineworld.co.uk/uk/data-api-service/v1/quickbook";

// How many days ahead to pull listings for. Cineworld typically only has
// ~3-4 weeks of bookable dates open at once anyway.
const DAYS_AHEAD = 21;

// A descriptive User-Agent so Cineworld's server logs show a real,
// identifiable, low-volume client rather than an anonymous scraper.
const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angellei88@gmail.com)";

// Attribute tags that describe the *format* of a screening (screen tech,
// subtitles, audio description, etc.) as opposed to genre, age rating,
// or venue-facility tags — Cineworld mixes all of these into one flat
// "attributeIds" list, so we filter down to the ones worth showing.
const FORMAT_ATTRIBUTE_IDS = new Set([
  // screening-type
  "2d", "3d", "avx", "dolby-atmos", "ge-3d",
  // special-type
  "3d-vip", "4dx", "4k", "70-mm", "ice", "imax", "imax-3d", "imax-3d-vip",
  "imax-vip", "imax-vr", "infinity-vision", "recliner", "rpx", "rpx-3d",
  "rpx-3d-vip", "rpx-vip", "screenx", "superscreen", "superscreen-hdr", "vip",
  // screening-addons
  "120-fps", "35-mm", "dbox", "hfr", "laser",
  // language/accessibility that's genuinely part of "what kind of screening is this"
  "audio-described", "subbed", "sub-titled", "dubbed",
]);

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Cineworld API request failed (${res.status}): ${url}`);
  }
  return res.json();
}

export async function fetchCineworldO2Greenwich() {
  const until = isoDate(new Date(Date.now() + DAYS_AHEAD * 24 * 60 * 60 * 1000));

  const datesResponse = await fetchJson(
    `${API_BASE}/${TENANT_ID}/dates/in-cinema/${CINEMA_ID}/until/${until}?attr=&lang=en_GB`
  );
  const dates = datesResponse.body?.dates ?? [];

  const results = [];

  for (const date of dates) {
    const eventsResponse = await fetchJson(
      `${API_BASE}/${TENANT_ID}/film-events/in-cinema/${CINEMA_ID}/at-date/${date}?attr=&lang=en_GB`
    );
    const films = eventsResponse.body?.films ?? [];
    const events = eventsResponse.body?.events ?? [];

    const filmsById = new Map(films.map((f) => [f.id, f]));

    for (const event of events) {
      const film = filmsById.get(event.filmId);
      if (!film) continue; // shouldn't happen, but don't guess a title

      const [, time] = (event.eventDateTime || "").split("T");
      if (!time) continue;

      const formatTags = (event.attributeIds || []).filter((id) =>
        FORMAT_ATTRIBUTE_IDS.has(id)
      );

      results.push({
        cinema: CINEMA_NAME,
        film: film.name,
        date: event.businessDay || date, // ISO YYYY-MM-DD
        time: time.slice(0, 5), // "14:15:00" -> "14:15"
        format: formatTags.length ? formatTags.join(", ") : null,
        runtimeMinutes: typeof film.length === "number" ? film.length : null,
        bookingUrl: event.bookingLink || null,
      });
    }
  }

  return results;
}

// Allow running directly: `node fetchers/cineworld-o2-greenwich.mjs`
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchCineworldO2Greenwich();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

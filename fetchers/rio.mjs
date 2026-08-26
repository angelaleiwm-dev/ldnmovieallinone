// Fetcher: Rio Cinema
// Reads riocinema.org.uk (a "Rio.dll" legacy ASP-style booking system) —
// server-rendered HTML, no browser needed.
//
// Two-step crawl: the WhatsOn listing page links to every currently
// showing film (?f=<id>), and each film's own page lists its entire
// future schedule in one request.
//
// Same responsive-duplicate gotcha as Genesis Cinema: this page renders
// both a mobile and desktop copy of the identical showtimes list
// (Bulma's is-hidden-tablet/is-hidden-desktop classes) — scoped to just
// one to avoid double-counting every showing (verified against the live
// DOM: 10 total .performance elements for a film with only 5 real dates).
//
// Runtime comes from embedded JSON-LD (schema.org Event) data rather
// than DOM scraping — cleaner and more reliable. Its startDate carries a
// misleading "Z" (UTC) suffix that doesn't match reality: the numeric
// time in it is identical to the displayed local time, confirming it's
// actually local wall-clock time mislabeled as UTC — so it's read here
// as plain text, not real-UTC-converted, same as every other fetcher's
// date/time handling.

import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";

const CINEMA_NAME = "Rio Cinema";
const SITE_ORIGIN = "https://riocinema.org.uk";
const LISTING_URL = `${SITE_ORIGIN}/Rio.dll/WhatsOn`;

// The scoped copy of the showtimes list to read — see module comment.
const SCOPED_LIST_SELECTOR = ".is-hidden-tablet.is-hidden-desktop li.performance";

const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angellei88@gmail.com)";

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.text();
}

async function getFilmIds() {
  const html = await fetchHtml(LISTING_URL);
  const ids = [...new Set([...html.matchAll(/WhatsOn\?f=(\d+)/g)].map((m) => m[1]))];
  return ids;
}

function parseRuntimeFromJsonLd(html) {
  const match = html.match(/"duration"\s*:\s*"(\d+)\s*minutes"/i);
  return match ? parseInt(match[1], 10) : null;
}

async function getFilmShowings(filmId) {
  const url = `${LISTING_URL}?f=${filmId}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const film = $("h1.title").first().text().trim();
  if (!film) return [];

  const runtimeMinutes = parseRuntimeFromJsonLd(html);

  const results = [];
  $(SCOPED_LIST_SELECTOR).each((_, li) => {
    const el = $(li);
    const date = el.find(".date").first().text().trim(); // "Thu 27 Aug"
    const time = el.find(".perf-time").first().text().trim(); // "20:50"
    const relativeHref = el.find("a.booking").first().attr("href");
    if (!date || !time || !relativeHref) return;

    results.push({
      cinema: CINEMA_NAME,
      film,
      date,
      time,
      format: null,
      runtimeMinutes,
      bookingUrl: new URL(relativeHref, url).toString(),
    });
  });

  return results;
}

export async function fetchRio() {
  const filmIds = await getFilmIds();
  const results = [];

  for (const filmId of filmIds) {
    try {
      results.push(...(await getFilmShowings(filmId)));
    } catch (err) {
      console.error(`Rio Cinema film ${filmId} failed: ${err.message}`);
    }
  }

  return results;
}

// Allow running directly: `node fetchers/rio.mjs`
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchRio();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

// Fetcher: The Castle Cinema (Hackney)
// Reads thecastlecinema.com — server-rendered HTML, no browser needed.
//
// Note: there are TWO Castle Cinema locations (Hackney and Sidcup) —
// this is Hackney specifically, matching the one on the user's list.
//
// Two-step crawl: the listings page links to every currently-showing
// film, and each film's own page lists its entire future schedule in
// one request (not just today), so no day-by-day crawling needed.
//
// Each showtime link carries a clean `data-start-time` ISO datetime
// attribute directly — no text parsing needed for date/time at all.

import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";

const CINEMA_NAME = "The Castle Cinema";
const SITE_ORIGIN = "https://thecastlecinema.com";
const LISTINGS_URL = `${SITE_ORIGIN}/listings/`;

const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angellei88@gmail.com)";

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.text();
}

async function getFilmPaths() {
  const html = await fetchHtml(LISTINGS_URL);
  const $ = cheerio.load(html);
  const paths = new Set();
  $('a[href^="/programme/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (/^\/programme\/\d+\/[a-z0-9-]+\/?$/.test(href)) paths.add(href);
  });
  return [...paths];
}

async function getFilmShowings(path) {
  const url = `${SITE_ORIGIN}${path}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const titleTag = $("title").text(); // "Film Name - Castle Hackney"
  const film = titleTag.includes(" - ") ? titleTag.split(" - ")[0].trim() : null;
  if (!film) return [];

  const runtimeText = $(".film-duration").first().text();
  const runtimeMatch = runtimeText.match(/(\d+)\s*mins/i);
  const runtimeMinutes = runtimeMatch ? parseInt(runtimeMatch[1], 10) : null;

  const results = [];
  $(".performance-button").each((_, el) => {
    const a = $(el);
    const startTime = a.attr("data-start-time"); // "2026-08-27T20:45:00"
    const href = a.attr("href");
    if (!startTime || !href) return;

    const [date, time] = startTime.split("T");
    const screen = a.find(".screen").first().text().trim();

    results.push({
      cinema: CINEMA_NAME,
      film,
      date, // already ISO YYYY-MM-DD
      time: time.slice(0, 5), // already 24-hour HH:MM
      format: screen || null,
      runtimeMinutes,
      bookingUrl: `${SITE_ORIGIN}${href}`,
    });
  });

  return results;
}

export async function fetchCastle() {
  const paths = await getFilmPaths();
  const results = [];

  for (const path of paths) {
    try {
      results.push(...(await getFilmShowings(path)));
    } catch (err) {
      console.error(`Castle Cinema "${path}" failed: ${err.message}`);
    }
  }

  return results;
}

// Allow running directly: `node fetchers/castle.mjs`
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchCastle();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

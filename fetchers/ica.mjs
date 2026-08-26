// Fetcher: ICA Cinema
// Reads ica.art's film pages — server-rendered HTML, no browser needed,
// no bot-detection encountered.
//
// Two-step crawl: the /films index links to every currently-listed film,
// and each film's own page conveniently lists its ENTIRE future schedule
// in one request (not just one day), so there's no need to crawl
// day-by-day like Barbican/BFI.
//
// No booking link exists per showtime on this site at all (checked the
// live DOM — the schedule rows have zero <a> tags). Per the agreed
// relaxed booking-link requirement, this uses the film's own page as the
// link for every one of its showtimes.
//
// No runtime is listed anywhere on ICA's site either — left null here
// rather than adding an external film-database dependency without
// checking first. Showings from this cinema just can't be the first
// film in a pairing (need a known end time for that), only the second.

import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";

const CINEMA_NAME = "ICA Cinema";
const SITE_ORIGIN = "https://www.ica.art";
const FILM_INDEX_URL = `${SITE_ORIGIN}/films`;

const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angellei88@gmail.com)";

// ICA bakes premiere badges straight into their own <title> tag, e.g.
// "ICA | UK PREMIERE The Visitor" or even "UK PREMIEREIn-I In Motion"
// (no space at all) — strips those out rather than showing "UK PREMIERE"
// as if it were part of the actual film title.
function cleanFilmTitle(title) {
  return title
    .replace(/\b(UK|WORLD|EUROPEAN|LONDON)\s*PREMIERE\s*/gi, "")
    .replace(/^:\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.text();
}

async function getFilmSlugs() {
  const html = await fetchHtml(FILM_INDEX_URL);
  const $ = cheerio.load(html);
  const slugs = new Set();
  $('a[href^="/films/"]').each((_, el) => {
    const href = $(el).attr("href");
    const slug = href.replace("/films/", "");
    // Excludes the year-archive links (/films/2026, /films/2025, ...) —
    // everything else is either a real film page or a strand/category
    // page that simply won't have any .performance.future rows, which
    // is harmless (yields zero showings, not bad data).
    if (slug && !/^\d{4}$/.test(slug)) slugs.add(slug);
  });
  return [...slugs];
}

// "am"/"pm" times here are already the format combine.mjs expects
// ("2:00 pm"), just need the stray leading zero on the hour trimmed —
// actually combine.mjs's regex handles a leading zero fine, so no
// conversion needed here at all.
async function getFilmShowings(slug) {
  const url = `${SITE_ORIGIN}/films/${slug}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const titleTag = $("title").text(); // "ICA | Film Name"
  const rawFilm = titleTag.includes("|") ? titleTag.split("|")[1].trim() : null;
  const film = rawFilm ? cleanFilmTitle(rawFilm) : null;
  if (!film) return [];

  const results = [];
  $(".performance.future").each((_, el) => {
    const dateText = $(el).find(".date").first().text().trim(); // "Thu, 27 Aug 2026"
    const time = $(el).find(".time").first().text().trim(); // "02:00 pm"
    const venue = $(el).find(".venue").first().text().trim(); // "Cinema 1"
    if (!dateText || !time) return;

    results.push({
      cinema: CINEMA_NAME,
      film,
      date: dateText,
      time,
      format: venue || null,
      runtimeMinutes: null, // not published anywhere on this site
      bookingUrl: url,
    });
  });

  return results;
}

export async function fetchIca() {
  const slugs = await getFilmSlugs();
  const results = [];

  for (const slug of slugs) {
    try {
      results.push(...(await getFilmShowings(slug)));
    } catch (err) {
      console.error(`ICA film "${slug}" failed: ${err.message}`);
    }
  }

  return results;
}

// Allow running directly: `node fetchers/ica.mjs`
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchIca();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

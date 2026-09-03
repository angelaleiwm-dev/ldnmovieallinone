// Fetcher: BFI Southbank (+ BFI IMAX, once it's on this platform)
// Reads cinemas.bfi.org.uk, BFI's new beta site. Written to handle
// multiple venues from one film-detail page (BFI Southbank and BFI IMAX
// can share a listing), but in practice only BFI Southbank currently has
// data here — BFI IMAX is still entirely on BFI's OLD legacy site
// (whatson.bfi.org.uk/imax/), which sits behind Cloudflare's full
// interactive "Just a moment" challenge, same blocker as Odeon/Curzon.
// Skipped for the same reason: it blocks even an automated browser
// session, not just plain HTTP. If BFI finishes migrating IMAX to this
// beta site, IMAX showings will start appearing here with zero code
// changes — VENUES already includes it.
//
// This site is server-rendered plain HTML (confirmed: a plain HTTP fetch
// returns the same showtime data a browser would see), so no
// Playwright/browser is needed here, unlike Prince Charles Cinema or Vue.
//
// Two-step crawl: first get the list of every film currently on
// (/whats-on), then visit each film's own page to read its actual
// showtimes — the listing page shows dates but not times, only the
// per-film page has the real schedule.

import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";

const SITE_ORIGIN = "https://cinemas.bfi.org.uk";
const WHATS_ON_URL = `${SITE_ORIGIN}/whats-on`;
const VENUES = ["BFI Southbank", "BFI IMAX"];

const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angelaleiwm@gmail.com)";

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${url}`);
  }
  return res.text();
}

async function getFilmSlugs() {
  const html = await fetchHtml(WHATS_ON_URL);
  const $ = cheerio.load(html);
  const slugs = new Set();
  $('a[href^="/whats-on/"]').each((_, el) => {
    const href = $(el).attr("href");
    const slug = href.replace("/whats-on/", "").split("?")[0].split("#")[0];
    if (slug) slugs.add(slug);
  });
  return [...slugs];
}

// "1h 25m" / "2h" / "45m" -> minutes
function parseRuntime(text) {
  if (!text) return null;
  const hoursMatch = text.match(/(\d+)h/);
  const minsMatch = text.match(/(\d+)m/);
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
  if (!hoursMatch && !minsMatch) return null;
  return hours * 60 + mins;
}

async function getFilmShowings(slug) {
  const url = `${SITE_ORIGIN}/whats-on/${slug}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const list = $(".performanceList").first();
  const film = list.attr("data-ga-show-title");
  const runtimeMinutes = parseRuntime(list.attr("data-ga-show-run-time"));
  if (!film) return []; // page shape didn't match what we expect — skip rather than guess

  const results = [];

  // Date headings and their showtimes are grouped together per day-block
  // (<div><h3>Mon 31 Aug</h3><ul>...performances...</ul></div>).
  $("#shows > div").each((_, dayBlock) => {
    const date = $(dayBlock).find("h3").first().text().trim();
    if (!date) return;

    $(dayBlock)
      .find(".performanceDetails")
      .each((_, perf) => {
        const venue = $(perf).attr("data-ga-vanue"); // yes, "vanue" — BFI's own typo
        if (!VENUES.includes(venue)) return;

        const link = $(perf).find('a[data-ga-event="booking_click"]').first();
        const time = link.text().trim();
        const bookingUrl = link.attr("href");
        if (!time || !bookingUrl) return;

        const screenMatch = (link.attr("aria-label") || "").match(/Screen\s+\S+/i);
        const formatValue = ($(perf).attr("data-ga-show-format") || "").trim();
        const formatParts = [formatValue, screenMatch ? screenMatch[0] : null].filter(
          Boolean
        );

        results.push({
          cinema: venue,
          film,
          date, // e.g. "Mon 31 Aug" — normalized (year assumed) in combine.mjs
          time,
          format: formatParts.length ? formatParts.join(", ") : null,
          runtimeMinutes,
          bookingUrl,
        });
      });
  });

  return results;
}

export async function fetchBfi() {
  const slugs = await getFilmSlugs();
  const results = [];

  for (const slug of slugs) {
    try {
      const showings = await getFilmShowings(slug);
      results.push(...showings);
    } catch (err) {
      console.error(`BFI film "${slug}" failed: ${err.message}`);
    }
  }

  return results;
}

// Allow running directly: `node fetchers/bfi.mjs`
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchBfi();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

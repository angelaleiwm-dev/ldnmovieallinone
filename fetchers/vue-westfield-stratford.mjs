// Fetcher: Vue Westfield Stratford City
// Reads Vue's own public JSON API (the same one their website's showtimes
// page calls) and returns a list of
// { cinema, film, date, time, format, bookingUrl } records.
//
// Why this needs a real browser (Playwright), unlike Cineworld: Vue's API
// is protected by Cloudflare Bot Management — it rejects plain HTTP
// requests with a 401 once Cloudflare's scoring kicks in, because they
// lack the `__cf_bm` cookie Cloudflare only hands out after a real browser
// passes its JS challenge. The workaround here still uses Vue's clean
// JSON API (not DOM scraping) — we just make the request *from inside* a
// real browser page, so the cookie Cloudflare already issued applies
// automatically, the same way it would for a real visitor's browser.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const CINEMA_NAME = "Vue Westfield Stratford City";
const CINEMA_ID = "10074";
const WHATS_ON_URL = "https://www.myvue.com/cinema/westfield-stratford-city/whats-on";
const API_BASE = "/api/microservice/showings";
const BOOKING_ORIGIN = "https://www.myvue.com";

const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angellei88@gmail.com)";

// Session attributes worth showing as "format" (screen tech, accessibility,
// non-English language) vs. attributes we skip (movie-level tags like
// "Family Blockbuster", or booking mechanics like "Single Seat").
function isFormatAttribute(attr) {
  if (attr.attributeType === "Session_Special") return true; // Laser, 3D, IMAX, etc.
  if (attr.attributeType === "Session" && attr.name === "Audio Description (AD)")
    return true;
  if (attr.attributeType === "Language" && attr.value !== "english") return true;
  return false;
}

export async function fetchVueWestfieldStratford() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: USER_AGENT });

  try {
    // Loading the real page first is what earns the Cloudflare cookie;
    // every API call below reuses this same page's session.
    await page.goto(WHATS_ON_URL, { waitUntil: "domcontentloaded" });

    // Despite the "forNextWeek" name, this is simply the list of dates Vue
    // currently has bookable for this cinema (a rolling ~7-day window).
    const datesResponse = await page.evaluate(
      async ({ apiBase, cinemaId }) => {
        const res = await fetch(
          `${apiBase}/showingDates?cinemaId=${cinemaId}&minEmbargoLevel=2&forNextWeek=true`
        );
        if (!res.ok) throw new Error(`showingDates failed: ${res.status}`);
        return res.json();
      },
      { apiBase: API_BASE, cinemaId: CINEMA_ID }
    );
    const dates = (datesResponse.result ?? []).map((d) => d.showingDate);

    const results = [];

    for (const date of dates) {
      const filmsResponse = await page.evaluate(
        async ({ apiBase, cinemaId, date }) => {
          const res = await fetch(
            `${apiBase}/cinemas/${cinemaId}/films?showingDate=${date}&minEmbargoLevel=3&includesSession=true&includeSessionAttributes=true`
          );
          if (!res.ok) throw new Error(`films failed: ${res.status}`);
          return res.json();
        },
        { apiBase: API_BASE, cinemaId: CINEMA_ID, date }
      );
      const films = filmsResponse.result ?? [];

      for (const film of films) {
        for (const group of film.showingGroups ?? []) {
          for (const session of group.sessions ?? []) {
            const [showDate, showTime] = (session.startTime || "").split("T");
            if (!showDate || !showTime) continue;

            const formatTags = (session.attributes || [])
              .filter(isFormatAttribute)
              .map((a) => a.name);

            results.push({
              cinema: CINEMA_NAME,
              film: film.filmTitle,
              date: showDate, // ISO YYYY-MM-DD
              time: showTime.slice(0, 5), // "15:05:00" -> "15:05"
              format: formatTags.length ? formatTags.join(", ") : null,
              runtimeMinutes:
                typeof film.runningTime === "number" ? film.runningTime : null,
              bookingUrl: session.bookingUrl
                ? `${BOOKING_ORIGIN}${session.bookingUrl}`
                : null,
            });
          }
        }
      }
    }

    return results;
  } finally {
    await browser.close();
  }
}

// Allow running directly: `node fetchers/vue-westfield-stratford.mjs`
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchVueWestfieldStratford();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

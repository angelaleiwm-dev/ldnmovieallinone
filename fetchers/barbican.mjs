// Fetcher: Barbican Cinema
// Reads barbican.org.uk's cinema listing, one day at a time via a plain
// URL query param (?day=YYYY-MM-DD) — server-rendered HTML, no browser
// needed, no bot-detection encountered.

import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";

const CINEMA_NAME = "Barbican Cinema";
const LISTING_URL = "https://www.barbican.org.uk/whats-on/cinema";
const DAYS_AHEAD = 21;

const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angelaleiwm@gmail.com)";

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// "1hr 52mins" / "2hrs 52mins" / "1 hr 50 min" -> minutes
function parseRuntime(text) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*hrs?\s*(\d+)?\s*mins?/i);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + mins;
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.text();
}

async function getShowingsForDate(date) {
  const html = await fetchHtml(`${LISTING_URL}?day=${date}`);
  const $ = cheerio.load(html);
  const results = [];

  $(".cinema-listing-card").each((_, card) => {
    const film = $(card).find(".cinema-listing-card__title").first().text().trim();
    if (!film) return;

    const runtimeMinutes = parseRuntime(
      $(card).find(".cinema-listing-card__tag").first().text()
    );

    $(card)
      .find(".cinema-instance-list__instance")
      .each((_, instance) => {
        const el = $(instance);
        const bookingUrl = el.find('a[href*="tickets.barbican.org.uk"]').first().attr("href");
        const timeMatch = el.text().match(/(\d{1,2})\.(\d{2})\s*(am|pm)/i);
        if (!bookingUrl || !timeMatch) return;

        const time = `${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3].toLowerCase()}`;

        // Accessibility/format tags (AD = audio described, CAP = captioned,
        // etc.) sit in tooltip trigger buttons within this instance.
        const formatTags = el
          .find(".tooltip__trigger span")
          .map((_, t) => $(t).text().trim())
          .get()
          .filter(Boolean);

        results.push({
          cinema: CINEMA_NAME,
          film,
          date, // ISO YYYY-MM-DD — this page is already scoped to one day
          time,
          format: formatTags.length ? formatTags.join(", ") : null,
          runtimeMinutes,
          bookingUrl,
        });
      });
  });

  return results;
}

export async function fetchBarbican() {
  const results = [];
  const today = new Date();

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = isoDate(new Date(today.getTime() + i * 24 * 60 * 60 * 1000));
    try {
      results.push(...(await getShowingsForDate(date)));
    } catch (err) {
      console.error(`Barbican ${date} failed: ${err.message}`);
    }
  }

  return results;
}

// Allow running directly: `node fetchers/barbican.mjs`
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchBarbican();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

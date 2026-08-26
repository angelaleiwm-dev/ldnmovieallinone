// Fetcher: Prince Charles Cinema
// Reads https://princecharlescinema.com/whats-on/ and returns a list of
// { cinema, film, date, time, format, bookingUrl } records.
//
// Why a real browser (Playwright) instead of a plain HTTP fetch:
// the showtimes on this page are injected by JavaScript after load
// (confirmed by comparing a raw HTTP fetch against the rendered page),
// so a simple fetch() gets an empty shell with no film data.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const CINEMA_NAME = "Prince Charles Cinema";
const WHATS_ON_URL = "https://princecharlescinema.com/whats-on/";

// A descriptive User-Agent so the cinema's server logs show a real,
// identifiable, low-volume client rather than an anonymous scraper.
const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angellei88@gmail.com)";

export async function fetchPrinceCharles() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: USER_AGENT });

  try {
    // "networkidle" is unreliable here — this site keeps background
    // connections open (analytics, etc.) so it can hang well past when
    // the actual film data has loaded. Wait for the DOM instead, then
    // wait for the specific element the AJAX call fills in.
    await page.goto(WHATS_ON_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("a.film_book_button", { timeout: 30000 });

    const showings = await page.evaluate((cinemaName) => {
      const results = [];

      document.querySelectorAll(".jacro-event").forEach((eventEl) => {
        const titleEl = eventEl.querySelector("a.liveeventtitle");
        const film = titleEl ? titleEl.textContent.trim() : null;
        if (!film) return; // skip anything we can't confidently name

        eventEl
          .querySelectorAll(".performance-list-items")
          .forEach((list) => {
            // Within one <ul>, date headings and showtime <li>s are
            // SIBLINGS in DOM order (not nested) — e.g. heading, li, li,
            // heading, li, heading, li — so the date for each <li> is
            // whichever heading most recently preceded it.
            let currentDate = null;

            Array.from(list.children).forEach((child) => {
              if (child.classList.contains("heading")) {
                currentDate = child.textContent.trim();
                return;
              }
              if (child.tagName !== "LI") return;

              const link = child.querySelector("a.film_book_button");
              if (!link) return;

              const timeEl = link.querySelector(".time");
              const time = timeEl ? timeEl.textContent.trim() : null;
              const bookingUrl = link.href || null;

              // The format (35mm, 4K, subtitled, etc.) is stored as the
              // <li> class list, e.g. class="35mm" or class="4k sub".
              const format = (child.className || "").trim() || null;

              if (currentDate && time && bookingUrl) {
                results.push({
                  cinema: cinemaName,
                  film,
                  date: currentDate,
                  time,
                  format,
                  bookingUrl,
                });
              }
            });
          });
      });

      return results;
    }, CINEMA_NAME);

    return showings;
  } finally {
    await browser.close();
  }
}

// Allow running directly: `node fetchers/prince-charles.mjs`
// (compares real filesystem paths, not raw URL strings, so this works on
// Windows too, where file:// URLs and argv paths are formatted differently)
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchPrinceCharles();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

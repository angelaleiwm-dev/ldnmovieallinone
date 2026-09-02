// Fetcher: BFI London Film Festival 2026 (7–18 October)
// Reads whatson.bfi.org.uk/lff/ — the same legacy BFI platform as the old
// BFI Southbank site, but this specific section intermittently rate-limits
// even an automated Playwright browser session (403s that clear up after
// backing off) — so every request here goes through retryFetch() rather
// than being called directly once.
//
// Two passes:
// 1. Crawl each festival day's listing page (one request per day) to
//    discover every screening: film title, venue, date/time, and a link
//    to that film's own BFI info page.
// 2. Visit each *unique* film's info page once (deduplicated by its
//    article ID) to read its runtime — the day listings don't show it.
//
// Deliberately does NOT clean/strip anything from titles — event names
// like "Screen Talk: Andrew Scott" or "Relaxed Screening: Elsinore" are
// the real, complete event titles on BFI's own site, not a badge on top
// of a film title, so stripping any part of them would be wrong.
//
// Booking links: general ticket sales for LFF don't open until later in
// the on-sale schedule, so there is no per-session booking link to give
// yet — every showing links to the film's own BFI info page instead,
// which is also genuinely more useful for festival planning ahead of
// sale dates than a booking link would be.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SITE_ORIGIN = "https://whatson.bfi.org.uk";
const BASE_URL = `${SITE_ORIGIN}/lff/Online/default.asp`;
const FESTIVAL_DAYS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(
  (d) => `202610${String(d).padStart(2, "0")}`
);

// This site's block has turned out to be persistent enough that a full
// 12-day + hundreds-of-films crawl can't reliably finish in one run. Every
// day's listing and every film's runtime is cached to disk as soon as
// it's fetched, so a later run only needs to go after whatever's still
// missing — both far more polite to BFI's servers than re-crawling
// everything each time, and resilient to this run itself being
// interrupted partway through.
const CACHE_DIR = "data/lff-cache";
const RUNTIME_CACHE_PATH = join(CACHE_DIR, "runtime.json");

async function loadRuntimeCache() {
  if (!existsSync(RUNTIME_CACHE_PATH)) return new Map();
  const raw = JSON.parse(await readFile(RUNTIME_CACHE_PATH, "utf-8"));
  return new Map(Object.entries(raw));
}

async function saveRuntimeCache(cache) {
  await writeFile(RUNTIME_CACHE_PATH, JSON.stringify(Object.fromEntries(cache), null, 2));
}

function dayCachePath(day) {
  return join(CACHE_DIR, `day-${day}.json`);
}

async function loadDayCache(day) {
  const path = dayCachePath(day);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf-8"));
}

async function saveDayCache(day, items) {
  await writeFile(dayCachePath(day), JSON.stringify(items, null, 2));
}

const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angellei88@gmail.com)";

// A few different cinemas literally share the LFF programme with our
// regular venues; keep the LFF venue names in the same style as those so
// a viewer isn't confused by two different names for one building. Venue
// text arrives as e.g. "ICA, Screen 1" or "BFI Southbank, Screen NFT1" —
// strip a trailing ", Screen ..." segment, and fold BFI's own two
// inconsistent spellings of the Royal Festival Hall into one name.
function normalizeVenue(raw) {
  if (/royal festival hall/i.test(raw)) {
    return "Southbank Centre – Royal Festival Hall";
  }
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length > 1 && /screen/i.test(parts[parts.length - 1])) {
    return parts.slice(0, -1).join(", ");
  }
  return raw;
}

// Retries a page.goto on a 403 (the intermittent block this section
// shows — testing found it's probabilistic/rate-window based, not a
// hard per-session flag: the exact same request succeeds again on retry,
// even in the same browser context) with increasing backoff, rather than
// treating a single 403 as a hard failure.
async function retryGoto(page, url, attempts = 6) {
  let lastStatus = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 3000 * 2 ** (i - 1)));
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    lastStatus = res.status();
    if (lastStatus === 200) return true;
  }
  console.error(`Gave up on ${url} after ${attempts} attempts (last status ${lastStatus})`);
  return false;
}

// A short pause between every request (not just retries) — keeping the
// overall request rate low is both more polite to BFI's servers and, per
// testing, reduces how often the block triggers in the first place.
const REQUEST_PAUSE_MS = 1500;
function pause() {
  return new Promise((r) => setTimeout(r, REQUEST_PAUSE_MS));
}

function extractArticleId(href) {
  const match = href.match(/article_id=([^&]+)/);
  return match ? match[1] : href;
}

async function getRuntimeMinutes(page, infoUrl, cache) {
  const key = extractArticleId(infoUrl);
  if (cache.has(key)) return cache.get(key);

  let minutes = null;
  const ok = await retryGoto(page, infoUrl);
  if (ok) {
    const text = await page.evaluate(() => document.body.innerText);
    const match = text.match(/(\d+)\s*min\b/i);
    minutes = match ? parseInt(match[1], 10) : null;
  }
  cache.set(key, minutes);
  return minutes;
}

// A fresh browser context (new cookies, no accumulated history) every
// this-many requests — cheap compared to relaunching the whole browser
// process, and gives the block another chance to clear if it's building
// up across a long run.
const FRESH_CONTEXT_EVERY = 8;

export async function fetchLff() {
  await mkdir(CACHE_DIR, { recursive: true });
  const runtimeCache = await loadRuntimeCache();

  const browser = await chromium.launch();
  let context = null;
  let page = null;
  let requestsOnContext = 0;

  async function freshPage() {
    if (context) await context.close();
    context = await browser.newContext({ userAgent: USER_AGENT });
    page = await context.newPage();
    requestsOnContext = 0;
  }

  async function withPage() {
    if (!page || requestsOnContext >= FRESH_CONTEXT_EVERY) await freshPage();
    requestsOnContext++;
    return page;
  }

  try {
    const raw = [];
    let daysStillMissing = 0;

    for (const day of FESTIVAL_DAYS) {
      const cached = await loadDayCache(day);
      if (cached) {
        raw.push(...cached);
        continue;
      }

      const url = `${BASE_URL}?BOparam::WScontent::loadArticle::permalink=${day}`;
      const ok = await retryGoto(await withPage(), url);
      await pause();
      if (!ok) {
        daysStillMissing++;
        continue;
      }

      const items = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(".result-box-item")).map((el) => {
          const nameLink = el.querySelector(".item-name a");
          const startDateEl = el.querySelector(".item-start-date .start-date");
          const venueEl = el.querySelector(".item-venue");
          return {
            film: nameLink ? nameLink.textContent.trim() : null,
            infoHref: nameLink ? nameLink.getAttribute("href") : null,
            startDateText: startDateEl ? startDateEl.textContent.trim() : null,
            venueText: venueEl ? venueEl.textContent.trim() : null,
          };
        });
      });

      const validItems = items.filter(
        (item) => item.film && item.infoHref && item.startDateText && item.venueText
      );
      await saveDayCache(day, validItems);
      raw.push(...validItems);
    }

    if (daysStillMissing > 0) {
      console.error(
        `${daysStillMissing} day(s) still couldn't be fetched this run — already-cached days were reused, ` +
          `re-running this fetcher later will retry only the missing ones.`
      );
    }

    // "Wednesday 07 October 2026 17:30" -> date "07 October 2026", time "17:30"
    const results = [];
    let sinceLastSave = 0;
    for (const item of raw) {
      const match = item.startDateText.match(/(\d{1,2}\s+\w+\s+\d{4})\s+(\d{2}:\d{2})/);
      if (!match) continue;
      const [, date, time] = match;

      const infoUrl = new URL(item.infoHref, `${BASE_URL}`).toString();
      const cacheKey = extractArticleId(infoUrl);
      let runtimeMinutes;
      if (runtimeCache.has(cacheKey)) {
        runtimeMinutes = runtimeCache.get(cacheKey);
      } else {
        runtimeMinutes = await getRuntimeMinutes(await withPage(), infoUrl, runtimeCache);
        await pause();
        sinceLastSave++;
        if (sinceLastSave >= 5) {
          await saveRuntimeCache(runtimeCache);
          sinceLastSave = 0;
        }
      }

      results.push({
        cinema: normalizeVenue(item.venueText),
        film: item.film,
        date,
        time,
        format: null,
        runtimeMinutes,
        bookingUrl: infoUrl,
      });
    }

    await saveRuntimeCache(runtimeCache);
    return results;
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

// Allow running directly: `node fetchers/lff.mjs`
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchLff();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

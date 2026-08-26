// Fetcher: Genesis Cinema
// Reads genesiscinema.co.uk's "What's On" page — server-rendered HTML,
// no browser needed. The whole programme (every film, every date, every
// time, runtime included) is on ONE page, no day-by-day crawling needed.
//
// Real gotcha found while inspecting this: the page renders BOTH a
// desktop and a mobile version of the identical showtimes list in the
// DOM simultaneously (Tailwind's hidden/md:block responsive pattern),
// toggling visibility with CSS rather than only rendering one — so
// parsing without scoping to just one of them would silently double
// every showing. Scoped to the desktop block only.

import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";

const CINEMA_NAME = "Genesis Cinema";
const LISTING_URL = "https://www.genesiscinema.co.uk/whatson/all";

const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angellei88@gmail.com)";

function parseRuntime(text) {
  const match = text.match(/(\d+)\s*mins/i);
  return match ? parseInt(match[1], 10) : null;
}

export async function fetchGenesis() {
  const res = await fetch(LISTING_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${LISTING_URL}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const results = [];

  // Each film block is one of these grids; matched broadly then filtered
  // to ones that actually contain a film title link, since this class
  // combination isn't unique to film blocks on its own.
  $('h1.pb-2').each((_, h1) => {
    const filmBlock = $(h1).closest(".grid.grid-cols-10");
    if (!filmBlock.length) return;

    const film = $(h1).text().trim();
    if (!film) return;

    const runtimeMinutes = parseRuntime(filmBlock.text());

    // The desktop-only date/time block — see the module comment above
    // for why scoping to just this one matters.
    filmBlock.find(".hidden.md\\:block > div").each((_, dateBlock) => {
      const el = $(dateBlock);
      const date = el.clone().children().remove().end().text().trim();
      if (!date) return;

      el.find("a.perfButton").each((_, link) => {
        const a = $(link);
        const bookingUrl = a.attr("href");
        const time = a.find("span").last().text().trim();
        if (!bookingUrl || !time) return;

        results.push({
          cinema: CINEMA_NAME,
          film,
          date,
          time,
          format: null,
          runtimeMinutes,
          bookingUrl,
        });
      });
    });
  });

  return results;
}

// Allow running directly: `node fetchers/genesis.mjs`
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchGenesis();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

// Runs every fetcher, normalizes their output into one consistent shape,
// and writes the result to data/combined.json for the website to read.
//
// This is the ONLY place that knows about individual fetchers — the
// website only ever reads data/combined.json. Adding a new cinema means
// writing a fetcher and adding one line to the FETCHERS list below;
// nothing else in the project needs to change.
//
// The date/time normalization itself lives in normalize.mjs, shared with
// combine-lff.mjs (the festival section's own combine step).

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { normalizeShowings } from "./normalize.mjs";
import { fetchPrinceCharles } from "./fetchers/prince-charles.mjs";
import { fetchCineworldO2Greenwich } from "./fetchers/cineworld-o2-greenwich.mjs";
import { fetchVueWestfieldStratford } from "./fetchers/vue-westfield-stratford.mjs";
import { fetchPicturehouseCentral } from "./fetchers/picturehouse-central.mjs";
import { fetchBfi } from "./fetchers/bfi.mjs";
import { fetchBarbican } from "./fetchers/barbican.mjs";
import { fetchIca } from "./fetchers/ica.mjs";
import { fetchGenesis } from "./fetchers/genesis.mjs";
import { fetchCastle } from "./fetchers/castle.mjs";
import { fetchRio } from "./fetchers/rio.mjs";

const FETCHERS = [
  fetchPrinceCharles,
  fetchCineworldO2Greenwich,
  fetchVueWestfieldStratford,
  fetchPicturehouseCentral,
  fetchBfi,
  fetchBarbican,
  fetchIca,
  fetchGenesis,
  fetchCastle,
  fetchRio,
];

const OUTPUT_PATH = "data/combined.json";
// The deployed site (GitHub Pages, served from docs/) reads its own copy —
// there's no server-side step to pull from data/ at deploy time, so this
// combine step is what keeps the live site's data current.
const SITE_OUTPUT_PATH = "docs/data/combined.json";

// This runs unattended (daily, via GitHub Actions) — if most fetchers fail
// in one run (a site's layout changed, a network blip, a cinema's site
// down), don't let that silently replace good data with a thin/empty
// result. Only refuses to write when there was a healthy prior file to
// protect; a genuinely first-ever run still writes normally.
async function wouldRegressData(newCount) {
  if (!existsSync(OUTPUT_PATH)) return false;
  try {
    const previous = JSON.parse(await readFile(OUTPUT_PATH, "utf-8"));
    const previousCount = previous.showings?.length ?? 0;
    if (previousCount === 0) return false;
    return newCount < previousCount * 0.5;
  } catch {
    return false; // unreadable/corrupt previous file — fine to overwrite
  }
}

async function main() {
  const referenceDate = new Date();
  const combined = [];
  const errors = [];

  for (const fetcher of FETCHERS) {
    try {
      const raw = await fetcher();
      combined.push(...normalizeShowings(raw, fetcher.name, referenceDate, errors));
      console.log(`${fetcher.name}: ${raw.length} showings`);
    } catch (err) {
      console.error(`${fetcher.name} FAILED: ${err.message}`);
      errors.push({ fetcher: fetcher.name, reason: err.message });
    }
  }

  combined.sort((a, b) => a.dateTime.localeCompare(b.dateTime));

  if (await wouldRegressData(combined.length)) {
    console.log(
      `\nGot only ${combined.length} showings, far fewer than last time — likely one or more ` +
        `cinema sites were down or blocking us. Keeping the existing data as-is rather than ` +
        `overwriting it with a bad result. Re-run this later once things are responding normally.`
    );
    return;
  }

  const payload = JSON.stringify(
    { generatedAt: new Date().toISOString(), showings: combined, errors },
    null,
    2
  );

  await mkdir("data", { recursive: true });
  await writeFile(OUTPUT_PATH, payload);

  await mkdir("docs/data", { recursive: true });
  await writeFile(SITE_OUTPUT_PATH, payload);

  console.log(`\nWrote ${combined.length} showings to ${OUTPUT_PATH} and ${SITE_OUTPUT_PATH}`);
  if (errors.length) {
    console.log(`${errors.length} showings/fetchers had problems — see "errors" in the output file.`);
  }
}

main();

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

import { writeFile, mkdir } from "node:fs/promises";
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

  await mkdir("data", { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), showings: combined, errors }, null, 2)
  );

  console.log(`\nWrote ${combined.length} showings to ${OUTPUT_PATH}`);
  if (errors.length) {
    console.log(`${errors.length} showings/fetchers had problems — see "errors" in the output file.`);
  }
}

main();

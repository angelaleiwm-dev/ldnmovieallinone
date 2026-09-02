// Same job as combine.mjs, but for the BFI London Film Festival section —
// kept as a separate pipeline and a separate output file
// (data/lff-combined.json) since the festival is its own dataset with
// its own venues, not merged into the regular cinema listings.

import { writeFile, mkdir } from "node:fs/promises";
import { normalizeShowings } from "./normalize.mjs";
import { fetchLff } from "./fetchers/lff.mjs";

const OUTPUT_PATH = "data/lff-combined.json";

async function main() {
  const referenceDate = new Date();
  const errors = [];
  let combined = [];

  try {
    const raw = await fetchLff();
    combined = normalizeShowings(raw, "fetchLff", referenceDate, errors);
    console.log(`fetchLff: ${raw.length} showings`);
  } catch (err) {
    console.error(`fetchLff FAILED: ${err.message}`);
    errors.push({ fetcher: "fetchLff", reason: err.message });
  }

  combined.sort((a, b) => a.dateTime.localeCompare(b.dateTime));

  await mkdir("data", { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), showings: combined, errors }, null, 2)
  );

  console.log(`\nWrote ${combined.length} showings to ${OUTPUT_PATH}`);
  if (errors.length) {
    console.log(`${errors.length} showings had problems — see "errors" in the output file.`);
  }
}

main();

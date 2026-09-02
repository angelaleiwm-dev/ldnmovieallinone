// Same job as combine.mjs, but for the BFI London Film Festival section —
// kept as a separate pipeline and a separate output file
// (data/lff-combined.json) since the festival is its own dataset with
// its own venues, not merged into the regular cinema listings.
//
// Important for ticket-sale-day robustness: this NEVER runs live when a
// visitor loads the site — visitors only ever read the JSON file this
// writes, on whatever schedule this is run separately. So even if BFI's
// site is completely down or overwhelmed with traffic when this runs,
// the safeguard below means the site keeps serving the last successful
// fetch instead of going blank.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { normalizeShowings } from "./normalize.mjs";
import { fetchLff } from "./fetchers/lff.mjs";

const OUTPUT_PATH = "data/lff-combined.json";

// If BFI's site is down/blocking hard when this runs, don't let a bad
// run silently replace yesterday's good data with an empty (or
// suspiciously thin) one — keep serving the last real result instead.
// Only refuses to write when there WAS a healthy prior file to protect;
// a genuinely first-ever run with nothing to compare against still
// writes normally, however small.
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

  if (await wouldRegressData(combined.length)) {
    console.log(
      `\nGot only ${combined.length} showings, far fewer than last time — likely BFI's site was ` +
        `down or blocking us. Keeping the existing ${OUTPUT_PATH} as-is rather than overwriting it ` +
        `with a bad result. Re-run this later once BFI's site is responding normally again.`
    );
    return;
  }

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

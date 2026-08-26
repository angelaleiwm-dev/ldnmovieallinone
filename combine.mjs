// Runs every fetcher, normalizes their output into one consistent shape,
// and writes the result to data/combined.json for the website to read.
//
// This is the ONLY place that knows about individual fetchers — the
// website only ever reads data/combined.json. Adding a new cinema means
// writing a fetcher and adding one line to the FETCHERS list below;
// nothing else in the project needs to change.

import { writeFile, mkdir } from "node:fs/promises";
import { fetchPrinceCharles } from "./fetchers/prince-charles.mjs";
import { fetchCineworldO2Greenwich } from "./fetchers/cineworld-o2-greenwich.mjs";
import { fetchVueWestfieldStratford } from "./fetchers/vue-westfield-stratford.mjs";
import { fetchPicturehouseCentral } from "./fetchers/picturehouse-central.mjs";

const FETCHERS = [
  fetchPrinceCharles,
  fetchCineworldO2Greenwich,
  fetchVueWestfieldStratford,
  fetchPicturehouseCentral,
];

const OUTPUT_PATH = "data/combined.json";

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// Some fetchers (Prince Charles Cinema) give dates as human text with no
// year, e.g. "Wednesday 26th August". Others (Cineworld, Vue) already give
// ISO dates. This turns either into a plain "YYYY-MM-DD" string.
function normalizeDate(rawDate, referenceDate) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;

  const match = rawDate.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = MONTHS[match[2].toLowerCase()];
  if (month === undefined) return null;

  // No year in the text, so assume the current year — unless that would
  // put the date far in the past (which means it must mean next year;
  // cinema listings only ever show upcoming dates).
  let year = referenceDate.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, month, day));
  const diffDays = (candidate - referenceDate) / 86400000;
  if (diffDays < -180) {
    candidate = new Date(Date.UTC(year + 1, month, day));
  }

  return candidate.toISOString().slice(0, 10);
}

// Some fetchers give 24-hour "HH:MM" already. Prince Charles Cinema gives
// "2:30 pm". This turns either into "HH:MM" 24-hour.
function normalizeTime(rawTime) {
  if (/^\d{2}:\d{2}$/.test(rawTime)) return rawTime;

  const match = rawTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const period = match[3].toLowerCase();
  if (period === "pm" && hour !== 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

async function main() {
  const referenceDate = new Date();
  const combined = [];
  const errors = [];

  for (const fetcher of FETCHERS) {
    try {
      const raw = await fetcher();
      for (const showing of raw) {
        const date = normalizeDate(showing.date, referenceDate);
        const time = normalizeTime(showing.time);
        if (!date || !time) {
          errors.push({ fetcher: fetcher.name, reason: "unparsable date/time", showing });
          continue;
        }
        combined.push({
          cinema: showing.cinema,
          film: showing.film,
          date,
          time,
          dateTime: `${date}T${time}:00`,
          format: showing.format ?? null,
          bookingUrl: showing.bookingUrl,
        });
      }
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

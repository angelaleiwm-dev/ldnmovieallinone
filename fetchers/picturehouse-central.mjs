// Fetcher: Picturehouse Central
// Reads Picturehouse's own JSON API (the same one their website's
// showtimes page calls) and returns a list of
// { cinema, film, date, time, format, bookingUrl } records.
//
// Why this needs a two-step request instead of one plain fetch: the
// showtimes endpoint is a POST behind standard Laravel CSRF protection
// (NOT bot-detection like Odeon/Curzon/Vue — this is just ordinary web-app
// session handling). A first GET earns a session cookie and CSRF token;
// that token gets echoed back as a header on the actual data request,
// exactly like the site's own JavaScript does.

import { fileURLToPath } from "node:url";

const CINEMA_NAME = "Picturehouse Central";
const CINEMA_ID = "022";
const CINEMA_PAGE_URL = "https://www.picturehouses.com/cinema/picturehouse-central";
const API_URL = "https://www.picturehouses.com/api/scheduled-movies-ajax";
const BOOKING_URL_TEMPLATE = (cinemaId, sessionId) =>
  `https://web.picturehouses.com/order/showtimes/${cinemaId}-${sessionId}/seats`;

const USER_AGENT =
  "ldnmovieallinone-fetcher/0.1 (personal showtimes aggregator; contact: angellei88@gmail.com)";

function parseCookies(setCookieHeaders) {
  const jar = {};
  for (const cookieStr of setCookieHeaders) {
    const [pair] = cookieStr.split(";");
    const idx = pair.indexOf("=");
    jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1);
  }
  return jar;
}

async function getSession() {
  const res = await fetch(CINEMA_PAGE_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Failed to load cinema page for session (${res.status})`);
  }
  const cookieJar = parseCookies(res.headers.getSetCookie());
  const cookieHeader = Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const csrfToken = decodeURIComponent(cookieJar["XSRF-TOKEN"] || "");
  if (!csrfToken) {
    throw new Error("No XSRF-TOKEN cookie returned — Picturehouse's session flow may have changed");
  }
  return { cookieHeader, csrfToken };
}

export async function fetchPicturehouseCentral() {
  const { cookieHeader, csrfToken } = await getSession();

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader,
      "X-XSRF-TOKEN": csrfToken,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams({ cinema_id: CINEMA_ID }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Picturehouse API request failed (${res.status})`);
  }
  const data = await res.json();

  const results = [];
  for (const movie of data.movies ?? []) {
    for (const showtime of movie.show_times ?? []) {
      if (showtime.CinemaId !== CINEMA_ID) continue; // defensive, API already filters

      const formatTags = showtime.SessionAttributesNames || [];

      results.push({
        cinema: CINEMA_NAME,
        film: movie.Title,
        date: showtime.date_f, // already ISO YYYY-MM-DD
        time: showtime.time, // already 24-hour HH:MM
        format: formatTags.length ? formatTags.join(", ") : null,
        bookingUrl: BOOKING_URL_TEMPLATE(CINEMA_ID, showtime.SessionId),
      });
    }
  }

  return results;
}

// Allow running directly: `node fetchers/picturehouse-central.mjs`
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const showings = await fetchPicturehouseCentral();
  console.log(`Found ${showings.length} showings.`);
  console.log(JSON.stringify(showings.slice(0, 5), null, 2));
}

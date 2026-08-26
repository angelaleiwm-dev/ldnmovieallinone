# Fetcher status

Tracks which of the 16 V1 cinemas have a working fetcher, and notes on
anything that made a cinema harder than the others.

| Cinema | Status | Method | Notes |
|---|---|---|---|
| Prince Charles Cinema | ✅ Done | Playwright (DOM scrape) | Showtimes are JS-rendered, no API found |
| Cineworld O2 Greenwich | ✅ Done | Plain HTTP (JSON API) | Clean tenant-based API, likely reusable for other Cineworld branches |
| Vue Westfield Stratford City | ✅ Done | Playwright + JSON API | API is clean but gated by Cloudflare Bot Management (401 on plain HTTP); calling it from inside a real browser session works |
| Odeon London Haymarket | ⏸️ Skipped | — | Blocked by Cloudflare's full interactive challenge ("Just a moment..."), which detected and blocked even an automated Playwright browser session. Revisit later — see AGENTS.md's ethical-scraping stance before trying harder workarounds. |
| Odeon Greenwich | ⏸️ Skipped | — | Same platform/blocker as Odeon London Haymarket |
| Curzon Soho | ⏸️ Skipped | — | Same "Omnia" CMS platform + Cloudflare challenge as Odeon — same blocker, applying the same decision |
| Curzon Mayfair | ⏸️ Skipped | — | Same platform/blocker as Curzon Soho |
| Curzon Bloomsbury | ⏸️ Skipped | — | Same platform/blocker as Curzon Soho |
| BFI IMAX | ⬜ Not started | | |
| BFI Southbank | ⬜ Not started | | |
| Barbican Cinema | ⬜ Not started | | |
| ICA Cinema | ⬜ Not started | | |
| Genesis Cinema | ⬜ Not started | | |
| The Castle Cinema | ⬜ Not started | | |
| Rio Cinema | ⬜ Not started | | |
| Picturehouse Central | ✅ Done | Plain HTTP (JSON API + Laravel CSRF handshake) | 264 showings, 57 films. Booking link format confirmed by extracting the real DOM's `data-sessionid`/href pattern from the live site, but the booking page itself is a client-rendered SPA that didn't fully render in the test browser tool (no errors, valid session data embedded — likely a tooling quirk, not a broken link). Worth spot-checking manually once. |

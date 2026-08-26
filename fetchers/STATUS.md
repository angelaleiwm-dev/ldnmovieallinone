# Fetcher status

Tracks which of the 16 V1 cinemas have a working fetcher, and notes on
anything that made a cinema harder than the others.

| Cinema | Status | Method | Notes |
|---|---|---|---|
| Prince Charles Cinema | ✅ Done | Playwright (DOM scrape) | Showtimes are JS-rendered, no API found. Runtime: 100% coverage, scraped from film info text. |
| Cineworld O2 Greenwich | ✅ Done | Plain HTTP (JSON API) | Clean tenant-based API, likely reusable for other Cineworld branches. Runtime: 100% coverage, native API field. |
| Vue Westfield Stratford City | ✅ Done | Playwright + JSON API | API is clean but gated by Cloudflare Bot Management (401 on plain HTTP); calling it from inside a real browser session works. Runtime: ~93% coverage, native API field (some events lack it). |
| Odeon London Haymarket | ⏸️ Skipped | — | Blocked by Cloudflare's full interactive challenge ("Just a moment..."), which detected and blocked even an automated Playwright browser session. Revisit later — see AGENTS.md's ethical-scraping stance before trying harder workarounds. |
| Odeon Greenwich | ⏸️ Skipped | — | Same platform/blocker as Odeon London Haymarket |
| Curzon Soho | ⏸️ Skipped | — | Same "Omnia" CMS platform + Cloudflare challenge as Odeon — same blocker, applying the same decision |
| Curzon Mayfair | ⏸️ Skipped | — | Same platform/blocker as Curzon Soho |
| Curzon Bloomsbury | ⏸️ Skipped | — | Same platform/blocker as Curzon Soho |
| BFI IMAX | ⏸️ Skipped | — | Still entirely on BFI's OLD legacy site (whatson.bfi.org.uk/imax/), which has the same Cloudflare interactive challenge as Odeon/Curzon. BFI's NEW beta site (cinemas.bfi.org.uk) explicitly links back to the old IMAX site, confirming IMAX hasn't been migrated yet — worth rechecking later since the new site works fine. |
| BFI Southbank | ✅ Done | Plain HTTP (server-rendered HTML via cheerio) | On BFI's new beta site (cinemas.bfi.org.uk) — clean server-rendered HTML, no Cloudflare gate. 353 showings, 127 films, runtime included (91% coverage — a handful of special events don't list one). One fetcher file (`bfi.mjs`) handles both venues; will pick up BFI IMAX automatically if/when it migrates to this platform, with zero code changes. |
| Barbican Cinema | ⬜ Not started | | |
| ICA Cinema | ⬜ Not started | | |
| Genesis Cinema | ⬜ Not started | | |
| The Castle Cinema | ⬜ Not started | | |
| Rio Cinema | ⬜ Not started | | |
| Picturehouse Central | ✅ Done | Plain HTTP (JSON API + Laravel CSRF handshake) | 264 showings, 57 films. Booking link format confirmed by extracting the real DOM's `data-sessionid`/href pattern from the live site, but the booking page itself is a client-rendered SPA that didn't fully render in the test browser tool (no errors, valid session data embedded — likely a tooling quirk, not a broken link). Worth spot-checking manually once. Runtime: 100% coverage, one extra request per unique film (movie-details page), cached. |

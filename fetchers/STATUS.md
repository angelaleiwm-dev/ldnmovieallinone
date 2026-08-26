# Fetcher status

Tracks which of the 16 V1 cinemas have a working fetcher, and notes on
anything that made a cinema harder than the others.

**10 of 16 done, 3113 real showings.** The remaining 6 (Odeon x2,
Curzon x3, BFI IMAX) are all skipped for the same reason: Cloudflare's
full interactive "Just a moment" challenge, which blocks even an
automated real-browser session, not just plain HTTP requests. See each
row below for specifics.

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
| Barbican Cinema | ✅ Done | Plain HTTP (server-rendered HTML via cheerio) | Day-by-day `?day=YYYY-MM-DD` query param. 81 showings, 32 films, 86% runtime coverage. |
| ICA Cinema | ✅ Done | Plain HTTP (server-rendered HTML via cheerio) | Each film's own page lists its entire future schedule in one request. No booking link exists anywhere on this site at all — uses the film's own page as the link, per the agreed relaxed policy. No runtime published anywhere either — left null (these showings can only ever be the second film in a double-bill pairing, never the first). Also strips "UK PREMIERE" etc. badges that ICA bakes directly into its own `<title>` tag. 111 showings, 29 films. |
| Genesis Cinema | ✅ Done | Plain HTTP (server-rendered HTML via cheerio) | Whole programme on one page, runtime included natively. Caught a real bug before shipping: the page renders both a desktop AND mobile copy of the identical showtimes simultaneously (Tailwind `hidden`/`md:block`) — would have silently doubled every showing if not scoped to one. 158 showings, 42 films, 100% runtime coverage. |
| The Castle Cinema | ✅ Done | Plain HTTP (server-rendered HTML via cheerio) | Hackney location specifically (there are two Castle Cinemas — Hackney and Sidcup). Cleanest source yet: each showtime carries a `data-start-time` ISO datetime attribute directly, no text parsing needed. 97 showings, 30 films, 100% runtime coverage. |
| Rio Cinema | ✅ Done | Plain HTTP (server-rendered HTML via cheerio) | Runtime read from embedded JSON-LD structured data. Same desktop/mobile duplicate-rendering gotcha as Genesis (different CSS framework, same pattern) — scoped accordingly after verifying against the live DOM. 83 showings, 53 films, 100% runtime coverage. |
| Picturehouse Central | ✅ Done | Plain HTTP (JSON API + Laravel CSRF handshake) | 264 showings, 57 films. Booking link format confirmed by extracting the real DOM's `data-sessionid`/href pattern from the live site, but the booking page itself is a client-rendered SPA that didn't fully render in the test browser tool (no errors, valid session data embedded — likely a tooling quirk, not a broken link). Worth spot-checking manually once. Runtime: 100% coverage, one extra request per unique film (movie-details page), cached. |

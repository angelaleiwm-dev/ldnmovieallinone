# LDN Screens

A personal, mobile-first website that pulls real showtimes from 10 independently-run London
cinema booking systems into one place — with a double-bill planner for everyday use, and a
dedicated **BFI London Film Festival 2026** section adding triple-bill planning on top, all
accounting for real travel time between venues.

**Live:** [angelaleiwm-dev.github.io/ldnmovieallinone](https://angelaleiwm-dev.github.io/ldnmovieallinone/)
· **LFF planner:** [/lff](https://angelaleiwm-dev.github.io/ldnmovieallinone/lff/)

Built solo, Aug 2026 – ongoing, in close collaboration with Claude Code (see [§ My role vs. the AI's role](#my-role-vs-the-ais-role)).

---

## What this is

London has dozens of great independent and chain cinemas, and each one only publishes its own
showtimes on its own website, in its own format. LDN Screens fetches real showtime data from 10
of those cinemas daily, normalizes it into one consistent shape, and serves it as a single
mobile-first site — so "what's on tonight, anywhere in London" is one page instead of ten browser
tabs.

- **Browse** — filter by Today / Tomorrow / This Week / All, filter by cinema, search by title.
- **Double Bill** — pick a date and get real double-bill suggestions (two films you could
  actually watch back-to-back that evening, with enough travel time between venues), or pick two
  specific films and see every day/time they line up — searchable in either order.
- **BFI London Film Festival 2026** — a fully separate site (own fetcher, own dataset, own
  venues) layering a **triple**-bill planner on top, tuned to the festival's own venue geography.

## Why it exists

Existing cinema listing apps show showtimes one screening at a time. None of them solve the
actual planning problem a keen filmgoer has: *"I want to see two films today — which two are
actually possible, and in what order, without missing the start of either one?"* That gets
especially hard during a festival, when one night might have a dozen overlapping screenings
spread across venues on opposite sides of the city.

## Key features

- **Unified browsing** across 10 cinemas, filterable and searchable. Films spanning many
  showtimes collapse into a summary card (`12 showings · 3 cinemas · 106 min`) to keep long lists
  scannable.
- **Cross-cinema film matching** — the same film often appears with slightly different
  formatting per cinema (`"Coyote vs. ACME"` vs `"Coyote vs. Acme"`, or a trailing year); these
  merge into one listing, while genuinely different prints (e.g. separate language dubs) stay
  correctly separate.
- **"Pick a Date" planner** — for any date, automatically finds valid pairings and splits results
  into *Same Cinema* / *Different Cinemas* columns, each with a "show more" if there's more than
  the top few to see.
- **"Pick films" planner** — choose either film first; the other field live-filters to only
  titles that can actually pair with it, in that role, somewhere in the data.
- **Real travel-time modelling** — London divided into hand-tuned geographic zones with
  minimum-gap rules (same cinema / same zone / cross-zone), plus specific overrides based on real
  transit knowledge.
- **Triple-bill planning** (LFF only) — the same matching engine extended to three films in one
  day, built by chaining the double-bill logic, not rewriting it.
- **Resilience by design** — a scheduled refresh that returns suspiciously little data (source
  down or blocking) is refused rather than allowed to silently overwrite yesterday's good data.

## Architecture

A small ETL pipeline feeding a static frontend. Each cinema has its own "fetcher" script that
knows how to read *that one site*; everything downstream only ever deals with one consistent
shape of data.

```
10 fetchers   →   combine.mjs   →   docs/data/combined.json   →   docs/ (static site)
(one script       (normalizes        (single source of truth —      Browse + Double Bill
 per cinema)       every date/        the site never talks to a
                   time format,       cinema live)
                   computes end-
                   times)
```

The LFF section runs the same pattern as a parallel pipeline: `fetchers/lff.mjs` →
`combine-lff.mjs` → `docs/lff/data/lff-combined.json` → `docs/lff/` (own site, own venues, own
gap rules, sharing the core matching engine via `pairing.mjs`).

This decoupling is deliberate: adding cinema #11 means writing one new fetcher and adding one
line to `combine.mjs` — the frontend never changes. The planner's matching logic (`pairing.mjs`)
and its geographic rules (`zones.mjs` / `lff-zones.mjs`) are pure, independently-testable modules
— which is what made it possible to bolt on a second, differently-configured planner for the
festival without duplicating the algorithm.

## BFI London Film Festival 2026

A second, fully separate site at [`/lff`](https://angelaleiwm-dev.github.io/ldnmovieallinone/lff/) — its own fetcher, dataset, and venues — built around the same
matching engine as the everyday planner, extended to a third film.

- **Its own dataset, on purpose** — the festival runs at a mix of regular cinemas and
  festival-only venues (Southbank Centre's Royal Festival Hall) on a schedule completely
  different from normal daily showtimes.
- **Triple bill via the same primitive** — every valid A→B pair, then every valid follower of B
  to serve as C, filtering out C secretly being A again.
- **Its own travel-time rules** — a flat 30-minute minimum between any two different venues, with
  a 20-minute override for BFI Southbank ↔ Royal Festival Hall (they sit immediately next to each
  other).
- **Titles kept exactly as published** — BFI bakes event type into the title on this section of
  their site ("Screen Talk: Andrew Scott", "Relaxed Screening: Elsinore" are the complete, real
  event names, not a badge on a film title) — the fetcher applies zero title-cleaning here.
- **Manually cross-checked against BFI's own listings** — the automated fetcher's day-cache is
  reused once populated (so a daily job doesn't need to re-crawl the whole festival and risk
  BFI's Cloudflare protection), which means newly-announced screenings on already-cached days
  don't appear automatically. Caught by periodically re-diffing the live programme against the
  cache.

## Getting started

```bash
git clone https://github.com/angelaleiwm-dev/ldnmovieallinone.git
cd ldnmovieallinone
npm install
npx playwright install chromium   # only needed for the two Playwright-based fetchers

npm run combine       # runs all 10 cinema fetchers, writes docs/data/combined.json
npm run combine:lff    # runs the LFF fetcher, writes docs/lff/data/lff-combined.json

npm run web            # serves docs/ at http://localhost:5173, matching production exactly
```

Individual fetchers can also be run on their own, e.g. `npm run fetch:prince-charles`.

## Data automation

A daily [GitHub Actions workflow](.github/workflows/refresh-data.yml) runs both `combine.mjs`
and `combine-lff.mjs` and commits the result if the data changed — the live site never fetches
anything itself, it only ever reads the last committed JSON.

## Cinema-by-cinema status

*The BFI LFF 2026 section is tracked separately — its own venues, not repeated here.*

| Cinema | Status | Method |
|---|---|---|
| Prince Charles Cinema | ✅ Live | Playwright (DOM render) |
| Cineworld O2 Greenwich | ✅ Live | Plain HTTP JSON API |
| Vue Westfield Stratford City | ✅ Live | Playwright + JSON API |
| Picturehouse Central | ✅ Live | HTTP + CSRF handshake |
| BFI Southbank | ✅ Live | Server-rendered HTML |
| Barbican Cinema | ✅ Live | Server-rendered HTML |
| ICA Cinema | ✅ Live | Server-rendered HTML |
| Genesis Cinema | ✅ Live | Server-rendered HTML |
| The Castle Cinema | ✅ Live | Server-rendered HTML |
| Rio Cinema | ✅ Live | HTML + JSON-LD |
| Odeon (Haymarket & Greenwich) | ⛔ Blocked | Cloudflare challenge |
| Curzon (Soho, Mayfair, Bloomsbury) | ⛔ Blocked | Cloudflare challenge |
| BFI IMAX | ⛔ Blocked | Cloudflare challenge |

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (ES modules) |
| Data fetching | native `fetch`, Playwright (headless browser automation) |
| HTML parsing | Cheerio |
| Caching | Disk-based JSON checkpoints — resumable, interruption-safe fetching |
| Frontend | Vanilla JavaScript, HTML5, CSS3 — no framework, no build step |
| Server | Minimal hand-written Node `http` server (no Express) |
| Deployment | GitHub Pages, served from `docs/`; daily refresh via GitHub Actions |

## Technical challenges worth knowing about

- **Ten booking systems, zero public documentation.** Each had to be reverse-engineered
  individually — a clean JSON API (Cineworld), an API gated behind Cloudflare Bot Management
  (Vue, solved by earning a real browser session's trust cookie first), a Laravel CSRF handshake
  (Picturehouse), plain server-rendered HTML (BFI, Barbican, ICA, Genesis), embedded JSON-LD
  (Rio), and a legacy ASP-style system with clean `data-*` attributes (The Castle).
- **Anti-bot protection, solved where legitimate, declined where not.** Six cinemas sit behind
  Cloudflare's full interactive challenge; rather than escalate to fingerprint spoofing, these are
  documented as out of scope — a deliberate trade-off, not a technical dead end.
- **Two silent 2×-duplication bugs caught before shipping** — two cinema sites each render a
  hidden duplicate copy of their showtimes list for responsive layouts. Caught by checking live
  DOM element counts against expected showing counts before writing either parser.
- **A CSS cascade trap** — a component's own `display: flex` was silently overriding the
  browser's built-in `[hidden]` attribute. Fixed with one global rule making `hidden`
  unconditionally authoritative.
- **A block that comes and goes, not a wall.** BFI's festival section intermittently
  rate-limits even a real automated browser session — the same request can fail, then succeed
  seconds later. Fixed architecturally: every festival day and film runtime is cached to disk the
  moment it's fetched, so a later run only chases what's still missing.
- **A source going down shouldn't mean the site goes blank.** Both combine scripts now refuse to
  overwrite yesterday's good data with a suspiciously thin result — a source outage degrades to
  "slightly stale," never "blank."

## Privacy, copyright & robustness

- **Privacy:** no accounts, no tracking cookies, no analytics.
- **Copyright:** only factual data is captured — titles, showtimes, runtimes, venue names. No
  posters, no synopses. Every listing links straight back to the source's own official page.
- **Scraping terms of service:** the one genuinely gray area, acknowledged rather than
  hand-waved. Mitigated with a descriptive `User-Agent` and real contact email on every request,
  deliberately low request volume, and a plain footer disclosure on both sites.

## My role vs. the AI's role

Built in close collaboration with Claude Code, used as an on-demand technical co-founder rather
than an autocomplete tool.

**Mine:** product direction and prioritization at every stage; every scope decision (what to
build, defer, or explicitly skip and why); the ethical line on anti-bot workarounds; real-world
domain knowledge no amount of code could substitute for (actual London transit times, including
the festival's own Southbank Centre/BFI Southbank walking distance); flagging the ticket-sale-day
data-loss risk before it became a real incident; hands-on testing of every feature before
accepting it as done; and the UX fixes that came only from actually using the product.

**AI-assisted:** site investigation, code implementation, debugging, and verification — done
under direction, reviewed against real data at every step.

## Status

Public and live, refreshing daily on its own. Currently used by the author and festival-goer
friends; architected so wider public use is a small step, not a rewrite.

---

*Unofficial, fan-made project — not affiliated with any cinema, the BFI, or the London Film
Festival. Contact: [angelaleiwm@gmail.com](mailto:angelaleiwm@gmail.com) ·
[LinkedIn](https://linkedin.com/in/weng-man-lei-angela)*

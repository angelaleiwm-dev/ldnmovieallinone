import { normalizeTitleForGrouping } from "./title-utils.mjs";

const DATA_URL = "data/combined.json";

// A film card auto-expands once it has this many showings or fewer —
// no point hiding 1-2 rows behind a click.
const AUTO_EXPAND_THRESHOLD = 2;

const state = {
  showings: [],
  activeFilter: "today",
  searchTerm: "",
  cinemaFilter: new Set(), // empty = no filter, show every cinema
  expandedCards: new Set(), // manually-expanded card keys
};

const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");
const searchEl = document.getElementById("search");
const cinemaFilterEl = document.getElementById("cinema-filter");
const lastUpdatedEl = document.getElementById("last-updated");
// Scoped to #browse-view specifically — the planner's mode-tab buttons
// share the ".filter-tab" class for styling only, and must NOT also be
// picked up by this query, or clicking them fires this file's handler
// too (silently corrupting the browse view's filter state).
const filterTabs = document.querySelectorAll("#browse-view .filter-tab");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayHeading(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  if (isoDate === today) return "Today";
  if (isoDate === tomorrow) return "Tomorrow";
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function formatTime12h(time24) {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

function getFilteredShowings() {
  const term = state.searchTerm.trim().toLowerCase();
  const today = todayISO();

  let byDate;
  // A search overrides the date-tab filter — the user explicitly asked to
  // look something up, so we search everything we have, not just "today".
  if (term) {
    byDate = state.showings.filter((s) => s.film.toLowerCase().includes(term));
  } else if (state.activeFilter === "today") {
    byDate = state.showings.filter((s) => s.date === today);
  } else if (state.activeFilter === "tomorrow") {
    const tomorrow = addDays(today, 1);
    byDate = state.showings.filter((s) => s.date === tomorrow);
  } else if (state.activeFilter === "week") {
    const weekEnd = addDays(today, 6);
    byDate = state.showings.filter((s) => s.date >= today && s.date <= weekEnd);
  } else {
    byDate = state.showings; // "all"
  }

  if (state.cinemaFilter.size === 0) return byDate;
  return byDate.filter((s) => state.cinemaFilter.has(s.cinema));
}

function groupByDateThenFilm(showings) {
  const byDate = new Map();
  for (const s of showings) {
    if (!byDate.has(s.date)) byDate.set(s.date, new Map());
    const byFilm = byDate.get(s.date);
    const key = normalizeTitleForGrouping(s.film);
    if (!byFilm.has(key)) byFilm.set(key, { titleCounts: new Map(), showings: [] });
    const group = byFilm.get(key);
    group.titleCounts.set(s.film, (group.titleCounts.get(s.film) || 0) + 1);
    group.showings.push(s);
  }
  // Sort dates chronologically, and within each date sort films by their
  // earliest showing time so the day reads in a sensible order.
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, byFilm]) => {
      const films = [...byFilm.values()]
        .map((group) => {
          // Display whichever exact title spelling was most common among
          // this film's showings (ties broken alphabetically, for a
          // stable result run to run).
          const [displayTitle] = [...group.titleCounts.entries()].sort(
            (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
          )[0];
          return {
            film: displayTitle,
            showings: group.showings.sort((a, b) => a.time.localeCompare(b.time)),
          };
        })
        .sort((a, b) => a.showings[0].time.localeCompare(b.showings[0].time));
      return { date, films };
    });
}

// A popular film can rack up a dozen+ showings across several cinemas in
// one day — a flat time list gets unreadable fast. Grouping by cinema
// when expanded makes it scannable ("Prince Charles: 6:15, 8:35 /
// Picturehouse: 7:00") instead of one jumbled list sorted only by time.
function groupShowingsByCinema(showings) {
  const byCinema = new Map();
  for (const s of showings) {
    if (!byCinema.has(s.cinema)) byCinema.set(s.cinema, []);
    byCinema.get(s.cinema).push(s);
  }
  return [...byCinema.entries()]
    .map(([cinema, list]) => ({
      cinema,
      showings: list.sort((a, b) => a.time.localeCompare(b.time)),
    }))
    .sort((a, b) => a.showings[0].time.localeCompare(b.showings[0].time));
}

function filmCardHtml(filmGroup, dateKey) {
  const cardKey = `${dateKey}|${normalizeTitleForGrouping(filmGroup.film)}`;
  const count = filmGroup.showings.length;
  const cinemas = [...new Set(filmGroup.showings.map((s) => s.cinema))];
  const runtimeMinutes = filmGroup.showings.find((s) => s.runtimeMinutes)?.runtimeMinutes;

  // Small enough lists just show as-is — collapsing 1-2 rows behind a
  // click would be more friction than it saves, so they're not
  // collapsible at all (no point rendering a toggle that can't do
  // anything). A search implies you want to see this specific film's
  // times, so matches auto-expand too, but stay collapsible since a
  // large search-expanded list may still be worth collapsing back.
  const isCollapsible = count > AUTO_EXPAND_THRESHOLD;
  const expanded =
    !isCollapsible || state.searchTerm.trim().length > 0 || state.expandedCards.has(cardKey);

  const summaryParts = [`${count} showing${count === 1 ? "" : "s"}`];
  if (cinemas.length > 1) summaryParts.push(`${cinemas.length} cinemas`);
  if (runtimeMinutes) summaryParts.push(`${runtimeMinutes} min`);

  const byCinema = groupShowingsByCinema(filmGroup.showings);
  const headingTag = isCollapsible ? "button" : "div";
  const headingAttrs = isCollapsible
    ? `class="film-card-toggle" data-toggle="${escapeHtml(cardKey)}" aria-expanded="${expanded}"`
    : `class="film-card-toggle film-card-toggle--static"`;

  return `
    <article class="film-card">
      <${headingTag} ${headingAttrs}>
        <span>
          <span class="film-title">${escapeHtml(filmGroup.film)}</span>
          <span class="film-summary">${escapeHtml(summaryParts.join(" · "))}</span>
        </span>
        ${isCollapsible ? `<span class="toggle-icon" aria-hidden="true">${expanded ? "−" : "+"}</span>` : ""}
      </${headingTag}>
      <div class="film-card-times" ${expanded ? "" : "hidden"}>
        ${byCinema
          .map(
            (cinemaGroup) => `
          <div class="cinema-group">
            <div class="cinema-group-name">${escapeHtml(cinemaGroup.cinema)}</div>
            ${cinemaGroup.showings
              .map(
                (s) => `
              <div class="showing-row">
                <div class="showing-cinema">
                  ${s.format ? `<div class="showing-format">${escapeHtml(s.format)}</div>` : ""}
                </div>
                <div class="showing-time">${formatTime12h(s.time)}</div>
                <a class="book-btn" href="${s.bookingUrl}" target="_blank" rel="noopener noreferrer">Book</a>
              </div>
            `
              )
              .join("")}
          </div>
        `
          )
          .join("")}
      </div>
    </article>
  `;
}

function render() {
  const filtered = getFilteredShowings();

  if (filtered.length === 0) {
    resultsEl.innerHTML = `<p class="status">No showings found. Try a different filter or search term.</p>`;
    return;
  }

  const grouped = groupByDateThenFilm(filtered);

  resultsEl.innerHTML = grouped
    .map(
      (dayGroup) => `
      <section class="day-group">
        <h2 class="day-heading">${formatDayHeading(dayGroup.date)}</h2>
        ${dayGroup.films.map((filmGroup) => filmCardHtml(filmGroup, dayGroup.date)).join("")}
      </section>
    `
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderCinemaFilterChips() {
  const cinemas = [...new Set(state.showings.map((s) => s.cinema))].sort();
  cinemaFilterEl.innerHTML = cinemas
    .map(
      (cinema) => `
      <button class="cinema-chip" data-cinema="${escapeHtml(cinema)}">
        ${escapeHtml(cinema)}
      </button>
    `
    )
    .join("");

  cinemaFilterEl.querySelectorAll(".cinema-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const cinema = chip.dataset.cinema;
      if (state.cinemaFilter.has(cinema)) {
        state.cinemaFilter.delete(cinema);
        chip.classList.remove("active");
      } else {
        state.cinemaFilter.add(cinema);
        chip.classList.add("active");
      }
      render();
    });
  });
}

// The filter tabs say "Today"/"Tomorrow"/"This Week", which is ambiguous
// right around midnight — show the actual date(s) too so it's unambiguous
// regardless of when someone's looking at it.
function populateFilterTabDates() {
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6);
  const short = (isoDate) =>
    new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  document.getElementById("filter-date-today").textContent = ` (${short(today)})`;
  document.getElementById("filter-date-tomorrow").textContent = ` (${short(tomorrow)})`;
  document.getElementById("filter-date-week").textContent = ` (${short(today)}–${short(weekEnd)})`;
}

async function init() {
  populateFilterTabDates();
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Failed to load showtimes (${res.status})`);
    const data = await res.json();
    state.showings = data.showings;

    const updated = new Date(data.generatedAt);
    lastUpdatedEl.textContent = `Data last updated: ${updated.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;

    renderCinemaFilterChips();
    render();
  } catch (err) {
    statusEl.textContent = `Couldn't load showtimes: ${err.message}`;
  }
}

filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    filterTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.activeFilter = tab.dataset.filter;
    render();
  });
});

searchEl.addEventListener("input", (e) => {
  state.searchTerm = e.target.value;
  render();
});

// Event delegation for card expand/collapse — the results list is
// rewritten wholesale on every render, so listeners attached directly to
// individual cards would be lost each time; one listener on the
// container survives re-renders.
resultsEl.addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-toggle]");
  if (!toggle) return;
  const key = toggle.dataset.toggle;
  if (state.expandedCards.has(key)) {
    state.expandedCards.delete(key);
  } else {
    state.expandedCards.add(key);
  }
  render();
});

init();

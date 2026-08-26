import { normalizeTitleForGrouping } from "./title-utils.mjs";

const DATA_URL = "/data/combined.json";

const state = {
  showings: [],
  activeFilter: "today",
  searchTerm: "",
};

const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");
const searchEl = document.getElementById("search");
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

  // A search overrides the date-tab filter — the user explicitly asked to
  // look something up, so we search everything we have, not just "today".
  if (term) {
    return state.showings.filter((s) => s.film.toLowerCase().includes(term));
  }

  const today = todayISO();
  if (state.activeFilter === "today") {
    return state.showings.filter((s) => s.date === today);
  }
  if (state.activeFilter === "tomorrow") {
    const tomorrow = addDays(today, 1);
    return state.showings.filter((s) => s.date === tomorrow);
  }
  if (state.activeFilter === "week") {
    const weekEnd = addDays(today, 6);
    return state.showings.filter((s) => s.date >= today && s.date <= weekEnd);
  }
  return state.showings; // "all"
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
        ${dayGroup.films
          .map(
            (filmGroup) => `
          <article class="film-card">
            <h3 class="film-title">${escapeHtml(filmGroup.film)}</h3>
            ${filmGroup.showings
              .map(
                (s) => `
              <div class="showing-row">
                <div class="showing-cinema">
                  <div class="showing-cinema-name">${escapeHtml(s.cinema)}</div>
                  ${s.format ? `<div class="showing-format">${escapeHtml(s.format)}</div>` : ""}
                </div>
                <div class="showing-time">${formatTime12h(s.time)}</div>
                <a class="book-btn" href="${s.bookingUrl}" target="_blank" rel="noopener noreferrer">Book</a>
              </div>
            `
              )
              .join("")}
          </article>
        `
          )
          .join("")}
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

async function init() {
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

init();

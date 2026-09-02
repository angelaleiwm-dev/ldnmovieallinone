import { normalizeTitleForGrouping } from "./title-utils.mjs";

const DATA_URL = "/data/lff-combined.json";
const AUTO_EXPAND_THRESHOLD = 2;

const state = {
  showings: [],
  searchTerm: "",
  expandedCards: new Set(),
};

let resultsEl;
let searchEl;
let updatedEl;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatTime12h(time24) {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

function formatDayHeading(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function groupShowingsByCinema(showings) {
  const byCinema = new Map();
  for (const s of showings) {
    if (!byCinema.has(s.cinema)) byCinema.set(s.cinema, []);
    byCinema.get(s.cinema).push(s);
  }
  return [...byCinema.entries()]
    .map(([cinema, list]) => ({ cinema, showings: list.sort((a, b) => a.time.localeCompare(b.time)) }))
    .sort((a, b) => a.showings[0].time.localeCompare(b.showings[0].time));
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
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, byFilm]) => {
      const films = [...byFilm.values()]
        .map((group) => {
          const [displayTitle] = [...group.titleCounts.entries()].sort(
            (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
          )[0];
          return { film: displayTitle, showings: group.showings.sort((a, b) => a.time.localeCompare(b.time)) };
        })
        .sort((a, b) => a.showings[0].time.localeCompare(b.showings[0].time));
      return { date, films };
    });
}

function filmCardHtml(filmGroup, dateKey) {
  const cardKey = `${dateKey}|${normalizeTitleForGrouping(filmGroup.film)}`;
  const count = filmGroup.showings.length;
  const cinemas = [...new Set(filmGroup.showings.map((s) => s.cinema))];
  const runtimeMinutes = filmGroup.showings.find((s) => s.runtimeMinutes)?.runtimeMinutes;

  const isCollapsible = count > AUTO_EXPAND_THRESHOLD;
  const expanded =
    !isCollapsible || state.searchTerm.trim().length > 0 || state.expandedCards.has(cardKey);

  const summaryParts = [`${count} showing${count === 1 ? "" : "s"}`];
  if (cinemas.length > 1) summaryParts.push(`${cinemas.length} venues`);
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
                <a class="book-btn" href="${s.bookingUrl}" target="_blank" rel="noopener noreferrer">Info</a>
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
  const term = state.searchTerm.trim().toLowerCase();
  const filtered = term
    ? state.showings.filter((s) => s.film.toLowerCase().includes(term))
    : state.showings;

  if (filtered.length === 0) {
    resultsEl.innerHTML = `<p class="status">No festival showings found${term ? " for that search" : ""}.</p>`;
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

export async function initLffBrowse() {
  resultsEl = document.getElementById("lff-browse-results");
  searchEl = document.getElementById("lff-browse-search");
  updatedEl = document.getElementById("lff-browse-updated");

  searchEl.addEventListener("input", (e) => {
    state.searchTerm = e.target.value;
    render();
  });

  resultsEl.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle]");
    if (!toggle) return;
    const key = toggle.dataset.toggle;
    if (state.expandedCards.has(key)) state.expandedCards.delete(key);
    else state.expandedCards.add(key);
    render();
  });

  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Failed to load LFF showtimes (${res.status})`);
    const data = await res.json();
    state.showings = data.showings;

    const updated = new Date(data.generatedAt);
    updatedEl.textContent = `Programme data last updated: ${updated.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;

    render();
  } catch (err) {
    resultsEl.innerHTML = `<p class="status">Couldn't load festival showtimes: ${escapeHtml(err.message)}</p>`;
  }
}

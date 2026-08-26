import { findPairs } from "./pairing.mjs";
import { normalizeTitleForGrouping } from "./title-utils.mjs";

const DATA_URL = "/data/combined.json";
const MAX_SUGGESTIONS = 4;

const state = {
  showings: [],
  mode: "surprise", // "surprise" | "pick"
  date: todayISO(),
  filmA: null,
  filmB: null,
};

const els = {
  modeTabs: document.querySelectorAll(".planner-mode-tab"),
  dateInput: document.getElementById("planner-date"),
  pickForm: document.getElementById("planner-pick-form"),
  filmAInput: document.getElementById("planner-film-a"),
  filmBInput: document.getElementById("planner-film-b"),
  filmOptions: document.getElementById("planner-film-options"),
  results: document.getElementById("planner-results"),
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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

function formatDateLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const today = todayISO();
  if (isoDate === today) return "Today";
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

// Build a deduplicated, nicely-cased list of film titles for the two
// "pick your own films" inputs — same title-merging logic the browse view
// uses, so what you pick here matches what you'd see there.
function uniqueFilmTitles(showings) {
  const byKey = new Map(); // normalized key -> Map(originalTitle -> count)
  for (const s of showings) {
    const key = normalizeTitleForGrouping(s.film);
    if (!byKey.has(key)) byKey.set(key, new Map());
    const counts = byKey.get(key);
    counts.set(s.film, (counts.get(s.film) || 0) + 1);
  }
  return [...byKey.values()]
    .map((counts) => [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0])
    .sort((a, b) => a.localeCompare(b));
}

function pairCardHtml({ filmA, filmB, gapMinutes, sameCinema }) {
  const travelNote = sameCinema
    ? "Same cinema"
    : `Different cinemas — allow travel time`;

  return `
    <article class="pair-card">
      <div class="pair-note">${travelNote} · ${gapMinutes} min gap</div>
      ${[filmA, filmB]
        .map(
          (s, i) => `
        <div class="pair-film">
          <div class="pair-film-label">${i === 0 ? "First" : "Then"}</div>
          <div class="pair-film-title">${escapeHtml(s.film)}</div>
          <div class="pair-film-details">
            ${escapeHtml(s.cinema)} · ${formatTime12h(s.time)}
            ${s.runtimeMinutes ? ` · ${s.runtimeMinutes} min` : ""}
          </div>
          <a class="book-btn" href="${s.bookingUrl}" target="_blank" rel="noopener noreferrer">View</a>
        </div>
      `
        )
        .join("")}
    </article>
  `;
}

function renderSingleFilmFallback(dayShowings, dateLabel) {
  els.results.innerHTML = `
    <p class="status">
      Only one film is showing ${dateLabel === "Today" ? "today" : "on " + dateLabel} —
      not enough for a double bill. Here's what's showing:
    </p>
    <article class="pair-card">
      ${dayShowings
        .map(
          (s) => `
        <div class="pair-film">
          <div class="pair-film-title">${escapeHtml(s.film)}</div>
          <div class="pair-film-details">${escapeHtml(s.cinema)} · ${formatTime12h(s.time)}</div>
          <a class="book-btn" href="${s.bookingUrl}" target="_blank" rel="noopener noreferrer">View</a>
        </div>
      `
        )
        .join("")}
    </article>
  `;
}

function renderSurprise() {
  const dateLabel = formatDateLabel(state.date);
  const dayShowings = state.showings.filter((s) => s.date === state.date);

  const distinctFilms = new Set(dayShowings.map((s) => normalizeTitleForGrouping(s.film)));
  if (distinctFilms.size === 0) {
    els.results.innerHTML = `<p class="status">No showings found for ${dateLabel}.</p>`;
    return;
  }
  if (distinctFilms.size === 1) {
    renderSingleFilmFallback(dayShowings, dateLabel);
    return;
  }

  const pairs = findPairs(dayShowings).slice(0, MAX_SUGGESTIONS);
  if (pairs.length === 0) {
    els.results.innerHTML = `<p class="status">No workable double-bill pairing found for ${dateLabel} — the films on don't line up with enough gap (or enough travel time) between them. Try a different date.</p>`;
    return;
  }

  els.results.innerHTML = `<h2 class="day-heading">${dateLabel}</h2>${pairs
    .map(pairCardHtml)
    .join("")}`;
}

function renderPick() {
  if (!state.filmA || !state.filmB) {
    els.results.innerHTML = `<p class="status">Pick two films above to see how you could watch them back-to-back.</p>`;
    return;
  }

  const pairs = findPairs(state.showings, { filmA: state.filmA, filmB: state.filmB });
  if (pairs.length === 0) {
    els.results.innerHTML = `<p class="status">"${escapeHtml(state.filmA)}" and "${escapeHtml(
      state.filmB
    )}" don't currently overlap on any day within your cinema list — no valid back-to-back pairing found, in either order.</p>`;
    return;
  }

  els.results.innerHTML = pairs.slice(0, MAX_SUGGESTIONS).map(pairCardHtml).join("");
}

function render() {
  if (state.mode === "surprise") {
    renderSurprise();
  } else {
    renderPick();
  }
}

function initModeTabs() {
  els.modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      els.modeTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.mode = tab.dataset.mode;
      els.dateInput.closest(".planner-date-row").hidden = state.mode !== "surprise";
      els.pickForm.hidden = state.mode !== "pick";
      render();
    });
  });
}

function initDateInput() {
  els.dateInput.value = state.date;
  els.dateInput.addEventListener("change", () => {
    if (els.dateInput.value) {
      state.date = els.dateInput.value;
      render();
    }
  });
}

function initPickForm() {
  els.filmAInput.addEventListener("change", () => {
    state.filmA = els.filmAInput.value || null;
    render();
  });
  els.filmBInput.addEventListener("change", () => {
    state.filmB = els.filmBInput.value || null;
    render();
  });
}

export async function initPlanner() {
  initModeTabs();
  initDateInput();
  initPickForm();

  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Failed to load showtimes (${res.status})`);
    const data = await res.json();
    state.showings = data.showings;

    els.filmOptions.innerHTML = uniqueFilmTitles(state.showings)
      .map((title) => `<option value="${escapeHtml(title)}"></option>`)
      .join("");

    render();
  } catch (err) {
    els.results.innerHTML = `<p class="status">Couldn't load showtimes: ${escapeHtml(err.message)}</p>`;
  }
}

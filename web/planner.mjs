import { findPairs } from "./pairing.mjs";
import { minGapMinutes } from "./zones.mjs";
import { normalizeTitleForGrouping } from "./title-utils.mjs";

const DATA_URL = "/data/combined.json";
const MAX_SUGGESTIONS = 4;

const state = {
  showings: [],
  mode: "surprise", // "surprise" | "pick"
  date: todayISO(),
  filmA: null,
  filmB: null,
  knownFilmKeys: new Set(), // populated once data loads
};

// Since results now update on every keystroke, typing "A Confu..." partway
// through "A Confucian Confusion" would otherwise briefly render as "no
// film pairs with 'A Confu...'" — treat a title as chosen only once it
// exactly matches a real film, not any non-empty text.
function isKnownFilm(title) {
  return !!title && state.knownFilmKeys.has(normalizeTitleForGrouping(title));
}

const els = {
  modeTabs: document.querySelectorAll(".planner-mode-tab"),
  dateInput: document.getElementById("planner-date"),
  pickForm: document.getElementById("planner-pick-form"),
  filmAInput: document.getElementById("planner-film-a"),
  filmBInput: document.getElementById("planner-film-b"),
  filmBHint: document.getElementById("planner-film-b-hint"),
  filmOptionsA: document.getElementById("planner-film-options-a"),
  filmOptionsB: document.getElementById("planner-film-options-b"),
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

  const allPairs = findPairs(dayShowings, minGapMinutes);
  if (allPairs.length === 0) {
    els.results.innerHTML = `<p class="status">No workable double-bill pairing found for ${dateLabel} — the films on don't line up with enough gap (or enough travel time) between them. Try a different date.</p>`;
    return;
  }

  // Split into two even halves — same-cinema pairs (simplest, no travel)
  // and cross-cinema pairs — rather than one list where same-cinema
  // volume can crowd out cross-cinema options entirely. If one side has
  // nothing, the other gets the full double allowance instead of sitting
  // at half capacity for no reason.
  const sameCinemaPairs = allPairs.filter((p) => p.sameCinema);
  const crossCinemaPairs = allPairs.filter((p) => !p.sameCinema);

  let sameCinemaShown;
  let crossCinemaShown;
  if (sameCinemaPairs.length === 0) {
    sameCinemaShown = [];
    crossCinemaShown = crossCinemaPairs.slice(0, MAX_SUGGESTIONS * 2);
  } else if (crossCinemaPairs.length === 0) {
    sameCinemaShown = sameCinemaPairs.slice(0, MAX_SUGGESTIONS * 2);
    crossCinemaShown = [];
  } else {
    sameCinemaShown = sameCinemaPairs.slice(0, MAX_SUGGESTIONS);
    crossCinemaShown = crossCinemaPairs.slice(0, MAX_SUGGESTIONS);
  }

  els.results.innerHTML = `
    <h2 class="day-heading">${dateLabel}</h2>
    <div class="surprise-columns">
      ${surpriseColumnHtml("Same Cinema", sameCinemaShown)}
      ${surpriseColumnHtml("Different Cinemas", crossCinemaShown)}
    </div>
  `;
}

function surpriseColumnHtml(title, pairs) {
  return `
    <section class="surprise-column">
      <h3 class="surprise-column-heading">${escapeHtml(title)}</h3>
      ${
        pairs.length
          ? pairs.map(pairCardHtml).join("")
          : `<p class="status status--compact">None available for this date.</p>`
      }
    </section>
  `;
}

function renderPick() {
  if (!isKnownFilm(state.filmA) || !isKnownFilm(state.filmB)) {
    els.results.innerHTML = `<p class="status">Pick two films above to see how you could watch them back-to-back.</p>`;
    return;
  }

  const pairs = findPairs(state.showings, minGapMinutes, {
    filmA: state.filmA,
    filmB: state.filmB,
  });
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

// The second dropdown should only ever offer films that can actually
// follow the chosen first film somewhere in the data — otherwise you can
// pick a pairing that was never going to work and only find out after
// hitting "no results". findPairs with just filmA set (no filmB) already
// returns every valid pairing for that film in one pass, so we don't need
// to check candidates one at a time.
function updateFilmBOptions() {
  if (!isKnownFilm(state.filmA)) {
    els.filmOptionsB.innerHTML = "";
    els.filmBInput.disabled = true;
    els.filmBInput.placeholder = state.filmA
      ? "Finish typing or pick from the list above"
      : "Pick a first film above";
    els.filmBHint.textContent = "";
    return;
  }

  const candidatePairs = findPairs(state.showings, minGapMinutes, { filmA: state.filmA });
  const validSecondFilms = uniqueFilmTitles(candidatePairs.map((p) => p.filmB));

  if (validSecondFilms.length === 0) {
    els.filmOptionsB.innerHTML = "";
    els.filmBInput.disabled = true;
    els.filmBInput.placeholder = "No films pair with this one";
    els.filmBHint.textContent = `No film currently pairs with "${state.filmA}" on any day in your cinema list — try a different first film.`;
    if (state.filmB) {
      state.filmB = null;
      els.filmBInput.value = "";
    }
    return;
  }

  els.filmBInput.disabled = false;
  els.filmBInput.placeholder = "Type a film title…";
  els.filmOptionsB.innerHTML = validSecondFilms
    .map((title) => `<option value="${escapeHtml(title)}"></option>`)
    .join("");
  els.filmBHint.textContent = `${validSecondFilms.length} film${
    validSecondFilms.length === 1 ? "" : "s"
  } pair well with "${state.filmA}".`;

  // If the previously chosen second film is no longer valid for this
  // first film, clear it rather than silently keep an invalid selection.
  const stillValid =
    state.filmB &&
    validSecondFilms.some(
      (t) => normalizeTitleForGrouping(t) === normalizeTitleForGrouping(state.filmB)
    );
  if (state.filmB && !stillValid) {
    state.filmB = null;
    els.filmBInput.value = "";
  }
}

function initPickForm() {
  // These inputs live inside a <form>, so pressing Enter would otherwise
  // submit it — a full page reload/navigation that silently wipes the
  // planner's state, which looks exactly like "I pressed Enter and
  // nothing happened, then the results didn't update."
  els.pickForm.addEventListener("submit", (e) => e.preventDefault());

  // "input" (not just "change") so results update live as you type —
  // change only fires once the field loses focus, which meant nothing
  // visibly happened until you clicked elsewhere.
  els.filmAInput.addEventListener("input", () => {
    state.filmA = els.filmAInput.value || null;
    updateFilmBOptions();
    render();
  });
  els.filmBInput.addEventListener("input", () => {
    state.filmB = els.filmBInput.value || null;
    render();
  });
  updateFilmBOptions(); // set the initial disabled state
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

    const filmTitles = uniqueFilmTitles(state.showings);
    state.knownFilmKeys = new Set(filmTitles.map(normalizeTitleForGrouping));
    els.filmOptionsA.innerHTML = filmTitles
      .map((title) => `<option value="${escapeHtml(title)}"></option>`)
      .join("");

    render();
  } catch (err) {
    els.results.innerHTML = `<p class="status">Couldn't load showtimes: ${escapeHtml(err.message)}</p>`;
  }
}

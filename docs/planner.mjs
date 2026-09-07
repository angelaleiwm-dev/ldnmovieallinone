import { findPairs } from "./pairing.mjs";
import { minGapMinutes } from "./zones.mjs";
import { normalizeTitleForGrouping } from "./title-utils.mjs";

const DATA_URL = "data/combined.json";
const MAX_SUGGESTIONS = 4;

const state = {
  showings: [],
  mode: "surprise", // "surprise" | "pick"
  date: todayISO(),
  filmA: null,
  filmB: null,
  knownFilmKeys: new Set(), // populated once data loads
  allFilmTitles: [],
  expanded: { same: false, cross: false }, // "show more" state for Pick a Date, reset per date
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
  filmAHint: document.getElementById("planner-film-a-hint"),
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

function formatDateShort(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
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

function filmBlockHtml(label, s) {
  return `
    <div class="pair-film">
      <div class="pair-film-label">${escapeHtml(label)}</div>
      <div class="pair-film-title">${escapeHtml(s.film)}</div>
      <div class="pair-film-when">${formatDateShort(s.date)} · ${formatTime12h(s.time)}</div>
      <div class="pair-film-where">
        ${escapeHtml(s.cinema)}${s.runtimeMinutes ? ` · ${s.runtimeMinutes} min` : ""}
      </div>
      <a class="book-btn" href="${s.bookingUrl}" target="_blank" rel="noopener noreferrer">View</a>
    </div>
  `;
}

function pairCardHtml({ filmA, filmB, gapMinutes, sameCinema }) {
  const headerLabel = sameCinema
    ? `Same cinema · ${filmA.cinema}`
    : `Different cinemas · ${filmA.cinema} – ${filmB.cinema}`;

  return `
    <article class="pair-card">
      <div class="pair-note">${escapeHtml(headerLabel)}</div>
      ${filmBlockHtml("First", filmA)}
      <div class="pair-gap-divider">${gapMinutes} min gap</div>
      ${filmBlockHtml("Then", filmB)}
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
          <div class="pair-film-details">${escapeHtml(s.cinema)} · ${formatDateShort(s.date)} · ${formatTime12h(s.time)}</div>
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

  const sameCap = crossCinemaPairs.length === 0 ? MAX_SUGGESTIONS * 2 : MAX_SUGGESTIONS;
  const crossCap = sameCinemaPairs.length === 0 ? MAX_SUGGESTIONS * 2 : MAX_SUGGESTIONS;

  els.results.innerHTML = `
    <h2 class="day-heading">${dateLabel}</h2>
    <div class="surprise-columns">
      ${surpriseColumnHtml("Same Cinema", sameCinemaPairs, sameCap, "same")}
      ${surpriseColumnHtml("Different Cinemas", crossCinemaPairs, crossCap, "cross")}
    </div>
  `;
}

function surpriseColumnHtml(title, pairs, cap, expandKey) {
  const expanded = state.expanded[expandKey];
  const shown = expanded ? pairs : pairs.slice(0, cap);
  const remaining = pairs.length - shown.length;
  return `
    <section class="surprise-column">
      <h3 class="surprise-column-heading">${escapeHtml(title)}</h3>
      ${
        pairs.length
          ? shown.map(pairCardHtml).join("")
          : `<p class="status status--compact">None available for this date.</p>`
      }
      ${
        remaining > 0
          ? `<button type="button" class="show-more-btn" data-expand="${expandKey}">Show ${remaining} more</button>`
          : ""
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
      state.expanded = { same: false, cross: false };
      render();
    }
  });
}

// Event delegation for "Show more" — the results list is rewritten
// wholesale on every render, so a listener attached directly to the
// button would be lost each time; one listener on the container survives.
function initShowMore() {
  els.results.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-expand]");
    if (!btn) return;
    state.expanded[btn.dataset.expand] = true;
    render();
  });
}

// Bidirectional: either box can be filled first. Editing one box always
// refines the *other* box's suggestion list — findPairs with only filmA
// set returns every valid "what could follow this" pairing, and with
// only filmB set returns every valid "what could precede this" pairing,
// so the same primitive drives both directions; only which side of the
// pair we pull titles from differs.
function updateOtherFilmOptions(editedRole) {
  const isA = editedRole === "A";
  const sourceValue = isA ? state.filmA : state.filmB;
  const otherInput = isA ? els.filmBInput : els.filmAInput;
  const otherOptions = isA ? els.filmOptionsB : els.filmOptionsA;
  const otherHint = isA ? els.filmBHint : els.filmAHint;
  const otherStateKey = isA ? "filmB" : "filmA";
  const relationWord = isA ? "after" : "before";

  if (!isKnownFilm(sourceValue)) {
    // Nothing chosen on this side (yet) — don't constrain the other box,
    // just offer every film so either box can be filled first.
    otherOptions.innerHTML = optionsHtml(state.allFilmTitles);
    otherInput.disabled = false;
    otherInput.placeholder = "Type a film title…";
    otherHint.textContent = "";
    return;
  }

  const candidatePairs = findPairs(
    state.showings,
    minGapMinutes,
    isA ? { filmA: sourceValue } : { filmB: sourceValue }
  );
  const validTitles = uniqueFilmTitles(candidatePairs.map((p) => (isA ? p.filmB : p.filmA)));

  if (validTitles.length === 0) {
    otherOptions.innerHTML = "";
    otherInput.disabled = true;
    otherInput.placeholder = "No films pair with this one";
    otherHint.textContent = `No film currently pairs with "${sourceValue}" ${relationWord} it on any day in your cinema list — try a different film.`;
    if (state[otherStateKey]) {
      state[otherStateKey] = null;
      otherInput.value = "";
    }
    return;
  }

  otherInput.disabled = false;
  otherInput.placeholder = "Type a film title…";
  otherOptions.innerHTML = optionsHtml(validTitles);
  otherHint.textContent = `${validTitles.length} film${
    validTitles.length === 1 ? "" : "s"
  } could go ${relationWord} "${sourceValue}".`;

  // If the previously chosen film on the other side is no longer valid
  // for this one, clear it rather than silently keep an invalid selection.
  const stillValid =
    state[otherStateKey] &&
    validTitles.some(
      (t) => normalizeTitleForGrouping(t) === normalizeTitleForGrouping(state[otherStateKey])
    );
  if (state[otherStateKey] && !stillValid) {
    state[otherStateKey] = null;
    otherInput.value = "";
  }
}

function optionsHtml(titles) {
  return titles.map((title) => `<option value="${escapeHtml(title)}"></option>`).join("");
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
    updateOtherFilmOptions("A");
    render();
  });
  els.filmBInput.addEventListener("input", () => {
    state.filmB = els.filmBInput.value || null;
    updateOtherFilmOptions("B");
    render();
  });
}

export async function initPlanner() {
  initModeTabs();
  initDateInput();
  initPickForm();
  initShowMore();

  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Failed to load showtimes (${res.status})`);
    const data = await res.json();
    state.showings = data.showings;

    const filmTitles = uniqueFilmTitles(state.showings);
    state.knownFilmKeys = new Set(filmTitles.map(normalizeTitleForGrouping));
    state.allFilmTitles = filmTitles;
    els.filmOptionsA.innerHTML = optionsHtml(filmTitles);
    els.filmOptionsB.innerHTML = optionsHtml(filmTitles);

    render();
  } catch (err) {
    els.results.innerHTML = `<p class="status">Couldn't load showtimes: ${escapeHtml(err.message)}</p>`;
  }
}

import { findPairs, findTriples } from "./pairing.mjs";
import { lffMinGap } from "./lff-zones.mjs";
import { normalizeTitleForGrouping } from "./title-utils.mjs";

const DATA_URL = "/data/lff-combined.json";
const MAX_SUGGESTIONS = 4;

const state = {
  showings: [],
  loaded: false,
  knownFilmKeys: new Set(),
  double: { subMode: "date", date: null, filmA: null, filmB: null },
  triple: { subMode: "date", date: null, filmA: null, filmB: null, filmC: null },
};

function isKnownFilm(title) {
  return !!title && state.knownFilmKeys.has(normalizeTitleForGrouping(title));
}

function todayFallbackDate() {
  // "Today" (whenever this runs) is very unlikely to fall within the
  // festival's own dates, so default the date picker to the first day
  // the data actually covers rather than a date with nothing on it.
  if (state.showings.length === 0) return new Date().toISOString().slice(0, 10);
  return state.showings.reduce((min, s) => (s.date < min ? s.date : min), state.showings[0].date);
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
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function uniqueFilmTitles(showings) {
  const byKey = new Map();
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
      <div class="pair-film-details">
        ${escapeHtml(s.cinema)} · ${formatTime12h(s.time)}
        ${s.runtimeMinutes ? ` · ${s.runtimeMinutes} min` : ""}
      </div>
      <a class="book-btn" href="${s.bookingUrl}" target="_blank" rel="noopener noreferrer">Info</a>
    </div>
  `;
}

function doublePairCardHtml({ filmA, filmB, gapMinutes, sameCinema }) {
  const note = sameCinema ? "Same cinema" : "Different cinemas — allow travel time";
  return `
    <article class="pair-card">
      <div class="pair-note">${note} · ${gapMinutes} min gap</div>
      ${filmBlockHtml("Watch First", filmA)}
      ${filmBlockHtml("Watch Then", filmB)}
    </article>
  `;
}

function triplePairCardHtml({ filmA, filmB, filmC, gapAB, gapBC, allSameCinema }) {
  const note = allSameCinema
    ? "Same cinema throughout"
    : "Different cinemas — allow travel time";
  return `
    <article class="pair-card">
      <div class="pair-note">${note} · ${gapAB} + ${gapBC} min gaps</div>
      ${filmBlockHtml("Watch First", filmA)}
      ${filmBlockHtml("Watch Second", filmB)}
      ${filmBlockHtml("Watch Last", filmC)}
    </article>
  `;
}

function singleFilmFallbackHtml(dayShowings, dateLabel) {
  return `
    <p class="status">
      Only one film is showing on ${dateLabel} — not enough for a multi-film plan. Here's what's showing:
    </p>
    <article class="pair-card">
      ${dayShowings
        .map(
          (s) => `
        <div class="pair-film">
          <div class="pair-film-title">${escapeHtml(s.film)}</div>
          <div class="pair-film-details">${escapeHtml(s.cinema)} · ${formatTime12h(s.time)}</div>
          <a class="book-btn" href="${s.bookingUrl}" target="_blank" rel="noopener noreferrer">Info</a>
        </div>
      `
        )
        .join("")}
    </article>
  `;
}

function columnHtml(title, cards) {
  return `
    <section class="surprise-column">
      <h3 class="surprise-column-heading">${escapeHtml(title)}</h3>
      ${cards.length ? cards.join("") : `<p class="status status--compact">None available for this date.</p>`}
    </section>
  `;
}

// ---------- Double bill ----------

function renderDoubleByDate(resultsEl) {
  const { date } = state.double;
  const dateLabel = formatDateLabel(date);
  const dayShowings = state.showings.filter((s) => s.date === date);
  const distinctFilms = new Set(dayShowings.map((s) => normalizeTitleForGrouping(s.film)));

  if (distinctFilms.size === 0) {
    resultsEl.innerHTML = `<p class="status">No showings found for ${dateLabel}.</p>`;
    return;
  }
  if (distinctFilms.size === 1) {
    resultsEl.innerHTML = singleFilmFallbackHtml(dayShowings, dateLabel);
    return;
  }

  const allPairs = findPairs(dayShowings, lffMinGap);
  if (allPairs.length === 0) {
    resultsEl.innerHTML = `<p class="status">No workable double-bill pairing found for ${dateLabel}. Try a different date.</p>`;
    return;
  }

  const sameCinema = allPairs.filter((p) => p.sameCinema);
  const crossCinema = allPairs.filter((p) => !p.sameCinema);
  let sameShown, crossShown;
  if (sameCinema.length === 0) {
    sameShown = [];
    crossShown = crossCinema.slice(0, MAX_SUGGESTIONS * 2);
  } else if (crossCinema.length === 0) {
    sameShown = sameCinema.slice(0, MAX_SUGGESTIONS * 2);
    crossShown = [];
  } else {
    sameShown = sameCinema.slice(0, MAX_SUGGESTIONS);
    crossShown = crossCinema.slice(0, MAX_SUGGESTIONS);
  }

  resultsEl.innerHTML = `
    <h2 class="day-heading">${dateLabel}</h2>
    <div class="surprise-columns">
      ${columnHtml("Same Cinema", sameShown.map(doublePairCardHtml))}
      ${columnHtml("Different Cinemas", crossShown.map(doublePairCardHtml))}
    </div>
  `;
}

function renderDoubleByFilms(resultsEl) {
  const { filmA, filmB } = state.double;
  if (!isKnownFilm(filmA) || !isKnownFilm(filmB)) {
    resultsEl.innerHTML = `<p class="status">Pick two films above to see how you could watch them back-to-back.</p>`;
    return;
  }
  const pairs = findPairs(state.showings, lffMinGap, { filmA, filmB });
  if (pairs.length === 0) {
    resultsEl.innerHTML = `<p class="status">"${escapeHtml(filmA)}" and "${escapeHtml(
      filmB
    )}" don't currently overlap on any festival day — no valid back-to-back pairing found.</p>`;
    return;
  }
  resultsEl.innerHTML = pairs.slice(0, MAX_SUGGESTIONS).map(doublePairCardHtml).join("");
}

function renderDouble() {
  const resultsEl = document.getElementById("lff-double-results");
  if (state.double.subMode === "date") renderDoubleByDate(resultsEl);
  else renderDoubleByFilms(resultsEl);
}

// ---------- Triple bill ----------

function renderTripleByDate(resultsEl) {
  const { date } = state.triple;
  const dateLabel = formatDateLabel(date);
  const dayShowings = state.showings.filter((s) => s.date === date);
  const distinctFilms = new Set(dayShowings.map((s) => normalizeTitleForGrouping(s.film)));

  if (distinctFilms.size === 0) {
    resultsEl.innerHTML = `<p class="status">No showings found for ${dateLabel}.</p>`;
    return;
  }
  if (distinctFilms.size < 3) {
    resultsEl.innerHTML = singleFilmFallbackHtml(dayShowings, dateLabel);
    return;
  }

  const allTriples = findTriples(dayShowings, lffMinGap);
  if (allTriples.length === 0) {
    resultsEl.innerHTML = `<p class="status">No workable triple-bill plan found for ${dateLabel}. Try a different date.</p>`;
    return;
  }

  const sameCinema = allTriples.filter((t) => t.allSameCinema);
  const crossCinema = allTriples.filter((t) => !t.allSameCinema);
  let sameShown, crossShown;
  if (sameCinema.length === 0) {
    sameShown = [];
    crossShown = crossCinema.slice(0, MAX_SUGGESTIONS * 2);
  } else if (crossCinema.length === 0) {
    sameShown = sameCinema.slice(0, MAX_SUGGESTIONS * 2);
    crossShown = [];
  } else {
    sameShown = sameCinema.slice(0, MAX_SUGGESTIONS);
    crossShown = crossCinema.slice(0, MAX_SUGGESTIONS);
  }

  resultsEl.innerHTML = `
    <h2 class="day-heading">${dateLabel}</h2>
    <div class="surprise-columns">
      ${columnHtml("Same Cinema", sameShown.map(triplePairCardHtml))}
      ${columnHtml("Different Cinemas", crossShown.map(triplePairCardHtml))}
    </div>
  `;
}

function renderTripleByFilms(resultsEl) {
  const { filmA, filmB, filmC } = state.triple;
  if (!isKnownFilm(filmA) || !isKnownFilm(filmB) || !isKnownFilm(filmC)) {
    resultsEl.innerHTML = `<p class="status">Pick three films above to see how you could watch them in one day.</p>`;
    return;
  }
  const triples = findTriples(state.showings, lffMinGap, { filmA, filmB, filmC });
  if (triples.length === 0) {
    resultsEl.innerHTML = `<p class="status">"${escapeHtml(filmA)}", "${escapeHtml(filmB)}" and "${escapeHtml(
      filmC
    )}" don't currently line up on any festival day in that order — no valid plan found.</p>`;
    return;
  }
  resultsEl.innerHTML = triples.slice(0, MAX_SUGGESTIONS).map(triplePairCardHtml).join("");
}

function renderTriple() {
  const resultsEl = document.getElementById("lff-triple-results");
  if (state.triple.subMode === "date") renderTripleByDate(resultsEl);
  else renderTripleByFilms(resultsEl);
}

// ---------- Wiring ----------

function updateSecondFilmOptions({
  billKey,
  fieldKey,
  optionsEl,
  inputEl,
  hintEl,
  computeValidTitles,
}) {
  const validTitles = computeValidTitles();
  if (validTitles === null) {
    optionsEl.innerHTML = "";
    inputEl.disabled = true;
    inputEl.placeholder = state[billKey][fieldKey] ? "Finish typing or pick from the list above" : "Pick the film(s) above first";
    hintEl.textContent = "";
    return;
  }
  if (validTitles.length === 0) {
    optionsEl.innerHTML = "";
    inputEl.disabled = true;
    inputEl.placeholder = "No films pair with this";
    hintEl.textContent = `No film currently pairs with your selection on any festival day.`;
    if (state[billKey][fieldKey]) {
      state[billKey][fieldKey] = null;
      inputEl.value = "";
    }
    return;
  }
  inputEl.disabled = false;
  inputEl.placeholder = "Type a film title…";
  optionsEl.innerHTML = validTitles
    .map((title) => `<option value="${escapeHtml(title)}"></option>`)
    .join("");
  hintEl.textContent = `${validTitles.length} film${validTitles.length === 1 ? "" : "s"} work here.`;
  const stillValid =
    state[billKey][fieldKey] &&
    validTitles.some(
      (t) => normalizeTitleForGrouping(t) === normalizeTitleForGrouping(state[billKey][fieldKey])
    );
  if (state[billKey][fieldKey] && !stillValid) {
    state[billKey][fieldKey] = null;
    inputEl.value = "";
  }
}

function initDouble() {
  const modeTabs = document.querySelectorAll(".lff-double-mode-tab");
  const dateRow = document.querySelector(".lff-double-date-row");
  const pickForm = document.getElementById("lff-double-pick-form");
  const dateInput = document.getElementById("lff-double-date");
  const filmAInput = document.getElementById("lff-double-film-a");
  const filmBInput = document.getElementById("lff-double-film-b");
  const filmBOptions = document.getElementById("lff-double-film-b-options");
  const filmBHint = document.getElementById("lff-double-film-b-hint");

  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      modeTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.double.subMode = tab.dataset.mode;
      dateRow.hidden = state.double.subMode !== "date";
      pickForm.hidden = state.double.subMode !== "films";
      renderDouble();
    });
  });

  dateInput.addEventListener("change", () => {
    if (dateInput.value) {
      state.double.date = dateInput.value;
      renderDouble();
    }
  });

  pickForm.addEventListener("submit", (e) => e.preventDefault());

  filmAInput.addEventListener("input", () => {
    state.double.filmA = filmAInput.value || null;
    updateSecondFilmOptions({
      billKey: "double",
      fieldKey: "filmB",
      optionsEl: filmBOptions,
      inputEl: filmBInput,
      hintEl: filmBHint,
      computeValidTitles: () => {
        if (!isKnownFilm(state.double.filmA)) return null;
        const pairs = findPairs(state.showings, lffMinGap, { filmA: state.double.filmA });
        return uniqueFilmTitles(pairs.map((p) => p.filmB));
      },
    });
    renderDouble();
  });
  filmBInput.addEventListener("input", () => {
    state.double.filmB = filmBInput.value || null;
    renderDouble();
  });
}

function initTriple() {
  const modeTabs = document.querySelectorAll(".lff-triple-mode-tab");
  const dateRow = document.querySelector(".lff-triple-date-row");
  const pickForm = document.getElementById("lff-triple-pick-form");
  const dateInput = document.getElementById("lff-triple-date");
  const filmAInput = document.getElementById("lff-triple-film-a");
  const filmBInput = document.getElementById("lff-triple-film-b");
  const filmCInput = document.getElementById("lff-triple-film-c");
  const filmBOptions = document.getElementById("lff-triple-film-b-options");
  const filmCOptions = document.getElementById("lff-triple-film-c-options");
  const filmBHint = document.getElementById("lff-triple-film-b-hint");
  const filmCHint = document.getElementById("lff-triple-film-c-hint");

  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      modeTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.triple.subMode = tab.dataset.mode;
      dateRow.hidden = state.triple.subMode !== "date";
      pickForm.hidden = state.triple.subMode !== "films";
      renderTriple();
    });
  });

  dateInput.addEventListener("change", () => {
    if (dateInput.value) {
      state.triple.date = dateInput.value;
      renderTriple();
    }
  });

  pickForm.addEventListener("submit", (e) => e.preventDefault());

  function refreshFilmBOptions() {
    updateSecondFilmOptions({
      billKey: "triple",
      fieldKey: "filmB",
      optionsEl: filmBOptions,
      inputEl: filmBInput,
      hintEl: filmBHint,
      computeValidTitles: () => {
        if (!isKnownFilm(state.triple.filmA)) return null;
        const pairs = findPairs(state.showings, lffMinGap, { filmA: state.triple.filmA });
        return uniqueFilmTitles(pairs.map((p) => p.filmB));
      },
    });
  }
  function refreshFilmCOptions() {
    updateSecondFilmOptions({
      billKey: "triple",
      fieldKey: "filmC",
      optionsEl: filmCOptions,
      inputEl: filmCInput,
      hintEl: filmCHint,
      computeValidTitles: () => {
        if (!isKnownFilm(state.triple.filmA) || !isKnownFilm(state.triple.filmB)) return null;
        const triples = findTriples(state.showings, lffMinGap, {
          filmA: state.triple.filmA,
          filmB: state.triple.filmB,
        });
        return uniqueFilmTitles(triples.map((t) => t.filmC));
      },
    });
  }

  filmAInput.addEventListener("input", () => {
    state.triple.filmA = filmAInput.value || null;
    state.triple.filmB = null;
    filmBInput.value = "";
    refreshFilmBOptions();
    refreshFilmCOptions();
    renderTriple();
  });
  filmBInput.addEventListener("input", () => {
    state.triple.filmB = filmBInput.value || null;
    refreshFilmCOptions();
    renderTriple();
  });
  filmCInput.addEventListener("input", () => {
    state.triple.filmC = filmCInput.value || null;
    renderTriple();
  });

  refreshFilmBOptions();
  refreshFilmCOptions();
}

export async function initLffPlanner() {
  initDouble();
  initTriple();

  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Failed to load LFF showtimes (${res.status})`);
    const data = await res.json();
    state.showings = data.showings;
    state.loaded = true;

    const titles = uniqueFilmTitles(state.showings);
    state.knownFilmKeys = new Set(titles.map(normalizeTitleForGrouping));

    const optionsA1 = document.getElementById("lff-double-film-a-options");
    const optionsA2 = document.getElementById("lff-triple-film-a-options");
    const optionsHtml = titles.map((t) => `<option value="${escapeHtml(t)}"></option>`).join("");
    if (optionsA1) optionsA1.innerHTML = optionsHtml;
    if (optionsA2) optionsA2.innerHTML = optionsHtml;

    const defaultDate = todayFallbackDate();
    state.double.date = defaultDate;
    state.triple.date = defaultDate;
    document.getElementById("lff-double-date").value = defaultDate;
    document.getElementById("lff-triple-date").value = defaultDate;
    document.getElementById("lff-double-date").min = defaultDate;
    document.getElementById("lff-triple-date").min = defaultDate;

    renderDouble();
    renderTriple();
  } catch (err) {
    const msg = `<p class="status">Couldn't load festival showtimes: ${escapeHtml(err.message)}</p>`;
    document.getElementById("lff-double-results").innerHTML = msg;
    document.getElementById("lff-triple-results").innerHTML = msg;
  }
}

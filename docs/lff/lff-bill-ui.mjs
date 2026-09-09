// LFF-specific "My Lists" menu. Forked from ../bill-ui.mjs (which the main
// site still uses as-is) so festival-only behaviour — expandable showings
// on the watchlist, clash detection across saved bills — doesn't touch the
// regular site.

import { normalizeTitleForGrouping } from "../title-utils.mjs";
import { addBillButtonHtml, wireResultsBillButtons } from "../bill-ui.mjs";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function comboFilms(combo) {
  return [combo.filmA, combo.filmB, combo.filmC].filter(Boolean);
}

// s.dateTime is a naive local (London) timestamp with no timezone suffix
// ("2026-10-07T17:30:00") — comparing against Date#toISOString() (UTC,
// with a trailing "Z") would be off by the BST offset, so this builds a
// same-shaped string from the local clock instead.
function nowLocalIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function buildExportText(entries) {
  if (entries.length === 0) return "";
  const lines = ["My Bill — LFF 2026", ""];
  entries.forEach((entry, i) => {
    lines.push(`${i + 1}.`);
    for (const f of comboFilms(entry.combo)) {
      lines.push(`   ${f.film} — ${f.cinema}, ${f.date} ${f.time}`);
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}

function isStale(combo, currentShowings) {
  return comboFilms(combo).some((f) => {
    const match = currentShowings.find((s) => s.bookingUrl === f.bookingUrl);
    return !match || match.dateTime !== f.dateTime || match.cinema !== f.cinema;
  });
}

// A showing "occupies" its start time through start+runtime — when the
// runtime isn't known, a conservative default stands in so two screenings
// close together still register as a clash rather than silently passing.
const DEFAULT_RUNTIME_MINUTES = 60;

function occupiedWindow(s) {
  const start = new Date(s.dateTime).getTime();
  const end = start + (s.runtimeMinutes || DEFAULT_RUNTIME_MINUTES) * 60000;
  return [start, end];
}

// Clashes across *different* saved bills — a saved combo's own films are
// already vetted for a workable gap by the planner, so only cross-entry
// overlaps need checking here (e.g. one saved double bill's second film
// overlapping a separately-saved bill's screening on the same day).
function findClashes(entries) {
  const flat = [];
  for (const entry of entries) {
    for (const film of comboFilms(entry.combo)) {
      flat.push({ entryId: entry.id, film });
    }
  }
  const clashesByEntry = new Map();
  const record = (entryId, clash) => {
    if (!clashesByEntry.has(entryId)) clashesByEntry.set(entryId, []);
    clashesByEntry.get(entryId).push(clash);
  };
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i];
      const b = flat[j];
      if (a.entryId === b.entryId) continue;
      const [aStart, aEnd] = occupiedWindow(a.film);
      const [bStart, bEnd] = occupiedWindow(b.film);
      if (aStart < bEnd && bStart < aEnd) {
        record(a.entryId, { film: b.film });
        record(b.entryId, { film: a.film });
      }
    }
  }
  return clashesByEntry;
}

export function initListsMenu({ billStore, getShowings, formatDateShort, formatTime12h }) {
  const menuBtn = document.getElementById("lists-menu-btn");
  const badge = document.getElementById("lists-menu-badge");
  const panel = document.getElementById("lists-panel");
  const closeBtn = document.getElementById("lists-panel-close");
  const tabs = document.querySelectorAll(".lists-panel-tab");
  const watchlistSection = document.getElementById("watchlist-panel");
  const billSection = document.getElementById("bill-panel");
  const watchlistInput = document.getElementById("watchlist-add-input");
  const watchlistOptions = document.getElementById("watchlist-film-options");
  const watchlistList = document.getElementById("watchlist-list");
  const billList = document.getElementById("bill-list");
  const exportBtn = document.getElementById("bill-export-btn");

  // Which watchlisted films currently have their showings list expanded —
  // keyed by normalized title, kept across re-renders within one session.
  const expandedWatchlist = new Set();

  function updateBadge() {
    const count = billStore.getBill().length;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  function showingRowHtml(s) {
    return `
      <div class="watchlist-showing-row">
        <div class="watchlist-showing-when">${formatDateShort(s.date)} · ${formatTime12h(s.time)}</div>
        <div class="watchlist-showing-where">${escapeHtml(s.cinema)}${
          s.runtimeMinutes ? ` · ${s.runtimeMinutes} min` : ""
        }</div>
        ${addBillButtonHtml({ filmA: s }, billStore)}
      </div>
    `;
  }

  function renderWatchlist() {
    const titles = billStore.getWatchlist();
    if (titles.length === 0) {
      watchlistList.innerHTML = `<p class="status status--compact">Nothing on your watchlist yet — type a film above to add one.</p>`;
      return;
    }
    const showings = getShowings();
    const now = nowLocalIso();
    watchlistList.innerHTML = titles
      .map((title) => {
        const key = normalizeTitleForGrouping(title);
        const upcoming = showings
          .filter((s) => normalizeTitleForGrouping(s.film) === key && s.dateTime >= now)
          .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
        const planned = billStore.isFilmPlanned(title);
        const expanded = expandedWatchlist.has(key);
        const summary = upcoming.length
          ? `${upcoming.length} showing${upcoming.length === 1 ? "" : "s"}`
          : "No upcoming showings found.";
        return `
          <div class="watchlist-item">
            <div class="watchlist-item-row">
              <button
                type="button"
                class="watchlist-item-toggle"
                data-toggle-watchlist="${escapeHtml(key)}"
                ${upcoming.length === 0 ? "disabled" : ""}
              >
                <div class="watchlist-item-main">
                  <span class="watchlist-item-title">${escapeHtml(title)}</span>
                  ${planned ? `<span class="planned-check">✓ Planned</span>` : ""}
                  <div class="watchlist-item-info">${escapeHtml(summary)}</div>
                </div>
                ${
                  upcoming.length
                    ? `<span class="toggle-icon">${expanded ? "−" : "+"}</span>`
                    : ""
                }
              </button>
              <button type="button" class="list-remove-btn" data-remove-watchlist="${escapeHtml(
                title
              )}" aria-label="Remove from watchlist">×</button>
            </div>
            ${
              expanded && upcoming.length
                ? `<div class="watchlist-item-showings">${upcoming.map(showingRowHtml).join("")}</div>`
                : ""
            }
          </div>
        `;
      })
      .join("");
  }

  function renderBill() {
    const entries = billStore.getBill();
    exportBtn.hidden = entries.length === 0;
    if (entries.length === 0) {
      billList.innerHTML = `<p class="status status--compact">Nothing saved yet — press + button on a planner result to save your bill.</p>`;
      return;
    }
    const showings = getShowings();
    const clashesByEntry = findClashes(entries);
    billList.innerHTML = entries
      .map((entry) => {
        const stale = isStale(entry.combo, showings);
        const clashes = clashesByEntry.get(entry.id) || [];
        return `
          <div class="bill-item">
            ${stale ? `<div class="bill-item-warning">⚠ This may have changed — please double-check.</div>` : ""}
            ${
              clashes.length
                ? `<div class="bill-item-warning bill-item-clash">⚠ Clashes with ${clashes
                    .map(
                      (c) =>
                        `"${escapeHtml(c.film.film)}" (${escapeHtml(c.film.cinema)}, ${formatDateShort(
                          c.film.date
                        )} · ${formatTime12h(c.film.time)})`
                    )
                    .join(", ")} in another saved bill.</div>`
                : ""
            }
            ${comboFilms(entry.combo)
              .map(
                (f) => `
              <div class="bill-item-film">
                <span class="bill-item-film-title">${escapeHtml(f.film)}</span>
                <span class="bill-item-film-details">${escapeHtml(f.cinema)} · ${formatDateShort(
                  f.date
                )} · ${formatTime12h(f.time)}</span>
              </div>
            `
              )
              .join("")}
            <button type="button" class="list-remove-btn list-remove-btn--wide" data-remove-bill="${
              entry.id
            }">Remove</button>
          </div>
        `;
      })
      .join("");
  }

  function refresh() {
    updateBadge();
    renderWatchlist();
    renderBill();
  }

  menuBtn.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) refresh();
  });
  closeBtn.addEventListener("click", () => {
    panel.hidden = true;
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.panel;
      watchlistSection.hidden = target !== "watchlist";
      billSection.hidden = target !== "bill";
    });
  });

  watchlistInput.addEventListener("change", () => {
    const value = watchlistInput.value.trim();
    const known = [...watchlistOptions.children].some((o) => o.value === value);
    if (value && known) {
      billStore.addToWatchlist(value);
      watchlistInput.value = "";
      refresh();
    }
  });

  watchlistList.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-watchlist]");
    if (removeBtn) {
      billStore.removeFromWatchlist(removeBtn.dataset.removeWatchlist);
      refresh();
      return;
    }
    const toggleBtn = e.target.closest("[data-toggle-watchlist]");
    if (toggleBtn) {
      const key = toggleBtn.dataset.toggleWatchlist;
      if (expandedWatchlist.has(key)) expandedWatchlist.delete(key);
      else expandedWatchlist.add(key);
      renderWatchlist();
    }
  });

  billList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-bill]");
    if (!btn) return;
    billStore.removeFromBill(btn.dataset.removeBill);
    refresh();
  });

  // Add-to-bill buttons on individual watchlist showings — same delegated
  // handler the planner cards use, so a single film saved this way and a
  // saved double/triple bill both live in the same My Bill list.
  wireResultsBillButtons(watchlistList, billStore, refresh);

  exportBtn.addEventListener("click", async () => {
    const text = buildExportText(billStore.getBill());
    const ok = await copyToClipboard(text);
    exportBtn.textContent = ok ? "Copied!" : "Couldn't copy";
    setTimeout(() => {
      exportBtn.textContent = "Copy as text";
    }, 1500);
  });

  updateBadge();

  return {
    refresh,
    setFilmOptions(titles) {
      watchlistOptions.innerHTML = titles.map((t) => `<option value="${escapeHtml(t)}"></option>`).join("");
    },
  };
}

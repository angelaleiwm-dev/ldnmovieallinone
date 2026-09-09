// The "My Lists" menu — one button, opens a panel with two sections
// (Watchlist / My Bill). Shared between the regular site and the LFF site
// via relative import, same pattern as pairing.mjs/title-utils.mjs —
// each site passes in its own billStore (see bill.mjs) so the two sites'
// saved lists stay fully separate while sharing this one implementation.

import { comboId } from "./bill.mjs";
import { normalizeTitleForGrouping } from "./title-utils.mjs";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Combos are plain data rebuilt fresh on every render — this registry is
// how the delegated click handler (which only ever sees a comboId string
// in a data-attribute) gets back the actual combo object to save.
const comboRegistry = new Map();

// Called by each site's card-render function (pairCardHtml,
// doublePairCardHtml, triplePairCardHtml) to get the "add to My Bill"
// button for that card, already reflecting whether it's saved.
export function addBillButtonHtml(combo, billStore) {
  const id = comboId(combo);
  comboRegistry.set(id, combo);
  const saved = billStore.isInBill(id);
  return `
    <button
      type="button"
      class="add-bill-btn${saved ? " add-bill-btn--saved" : ""}"
      data-add-bill="${id}"
      aria-label="${saved ? "Remove from My Bill" : "Add to My Bill"}"
      title="${saved ? "Saved to My Bill" : "Add to My Bill"}"
    >${saved ? "✓" : "+"}</button>
  `;
}

// One delegated listener on the results container catches every "add to
// bill" click, however many times results get re-rendered — call once
// per results container during init.
export function wireResultsBillButtons(resultsEl, billStore, onChange) {
  resultsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add-bill]");
    if (!btn) return;
    const id = btn.dataset.addBill;
    if (billStore.isInBill(id)) {
      billStore.removeFromBill(id);
    } else {
      const combo = comboRegistry.get(id);
      if (combo) billStore.addToBill(combo);
    }
    onChange();
  });
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

// navigator.clipboard is unavailable in some contexts (older browsers,
// insecure origins, permission denied) — fall back to the classic
// hidden-textarea + execCommand trick rather than leaving the button
// silently doing nothing.
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
  const lines = ["My Bill — LDN Screens", ""];
  entries.forEach((entry, i) => {
    lines.push(`${i + 1}.`);
    for (const f of comboFilms(entry.combo)) {
      lines.push(`   ${f.film} — ${f.cinema}, ${f.date} ${f.time}`);
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}

// A saved combo references a specific showing (booking URL + exact
// time/cinema) — the underlying data refreshes daily, so a saved entry
// can quietly go stale if a cinema changes a time. Flagged rather than
// silently trusted.
function isStale(combo, currentShowings) {
  return comboFilms(combo).some((f) => {
    const match = currentShowings.find((s) => s.bookingUrl === f.bookingUrl);
    return !match || match.dateTime !== f.dateTime || match.cinema !== f.cinema;
  });
}

/**
 * Wires up the whole "My Lists" menu: open/close, the Watchlist/My Bill
 * inner tabs, adding/removing on both, and export-as-text. Expects the
 * panel markup (see index.html) to already be in the DOM with these ids.
 *
 * @param billStore   from createBillStore() in bill.mjs
 * @param getShowings () => current showings array (for the "next
 *                    showing" info and the staleness check)
 * @param formatDateShort / formatTime12h — same formatters each site
 *                    already has, passed in rather than duplicated here
 */
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

  function updateBadge() {
    const count = billStore.getBill().length;
    badge.textContent = String(count);
    badge.hidden = count === 0;
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
        const infoText = upcoming.length
          ? `${upcoming.length} showing${upcoming.length === 1 ? "" : "s"} — next: ${formatDateShort(
              upcoming[0].date
            )} · ${formatTime12h(upcoming[0].time)}`
          : "No upcoming showings found.";
        return `
          <div class="watchlist-item">
            <div class="watchlist-item-main">
              <span class="watchlist-item-title">${escapeHtml(title)}</span>
              ${planned ? `<span class="planned-check">✓ Planned</span>` : ""}
              <div class="watchlist-item-info">${escapeHtml(infoText)}</div>
            </div>
            <button type="button" class="list-remove-btn" data-remove-watchlist="${escapeHtml(
              title
            )}" aria-label="Remove from watchlist">×</button>
          </div>
        `;
      })
      .join("");
  }

  function renderBill() {
    const entries = billStore.getBill();
    exportBtn.hidden = entries.length === 0;
    if (entries.length === 0) {
      billList.innerHTML = `<p class="status status--compact">Nothing saved yet — look for the + button on a planner result.</p>`;
      return;
    }
    const showings = getShowings();
    billList.innerHTML = entries
      .map((entry) => {
        const stale = isStale(entry.combo, showings);
        return `
          <div class="bill-item">
            ${stale ? `<div class="bill-item-warning">⚠ This may have changed — please double-check.</div>` : ""}
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

  // "change" (not "input") — only add once a real film title is chosen
  // from the datalist, not on every keystroke of a partial match.
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
    const btn = e.target.closest("[data-remove-watchlist]");
    if (!btn) return;
    billStore.removeFromWatchlist(btn.dataset.removeWatchlist);
    refresh();
  });

  billList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-bill]");
    if (!btn) return;
    billStore.removeFromBill(btn.dataset.removeBill);
    refresh();
  });

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

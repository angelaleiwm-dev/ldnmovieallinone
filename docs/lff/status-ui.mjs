// Per-showing ticket status: Ticketed / Standby. Independent of
// Watchlist and My Bill — a showing doesn't need to be saved anywhere to
// carry a status, since the point is to mark up *any* showing wherever it
// appears (Browse, planner results, Watchlist, My Bill) and have that one
// mark show up everywhere else that same showing is rendered.
//
// Mutually exclusive per showing (picking a second option replaces the
// first; picking the active one again clears it) — one localStorage map,
// keyed the same way a saved combo's films are keyed elsewhere.

const STORAGE_KEY = "ldnscreens:showingStatus:lff";

export function statusKey(s) {
  return `${s.bookingUrl}|${s.dateTime}`;
}

function comboFilms(combo) {
  return [combo.filmA, combo.filmB, combo.filmC].filter(Boolean);
}

// A showing already covered by an existing saved entry — whether that
// entry is itself a single-film save or one leg of a double/triple bill
// — shouldn't get a second, separate single-film entry just because a
// status was picked on it somewhere else.
function isAlreadyInBill(key, billStore) {
  return billStore.getBill().some((entry) => comboFilms(entry.combo).some((f) => statusKey(f) === key));
}

function readMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full/disabled — the mark just won't persist this session.
  }
}

// A stored value that's no longer a real status (e.g. the retired "1 Oct"
// option from an earlier version) reads as "no status" rather than
// leaving a showing stuck on something the UI can't display or clear.
export function getStatus(key) {
  const value = readMap()[key];
  return STATUS_ORDER.includes(value) ? value : null;
}

export function setStatus(key, value) {
  const map = readMap();
  if (value) map[key] = value;
  else delete map[key];
  writeMap(map);
}

const TICKET_ICON = `<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.7c0-.94.76-1.7 1.7-1.7h10.6c.94 0 1.7.76 1.7 1.7v.9a1.1 1.1 0 000 2.2v.9a1.7 1.7 0 01-1.7 1.7H3.7A1.7 1.7 0 012 10.7v-.9a1.1 1.1 0 000-2.2v-.9z"/><path d="M9 5v1.2M9 8.4v1.2M9 11.8v1.2" stroke-dasharray="1.4 1.6"/></svg>`;
const PERSON_ICON = `<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="4.6" r="2.2"/><path d="M4.5 15.5v-2.6a4.5 4.5 0 019 0v2.6"/></svg>`;

const STATUS_CONFIG = {
  ticketed: { label: "Ticketed", icon: TICKET_ICON },
  standby: { label: "Standby", icon: PERSON_ICON },
};
export const STATUS_ORDER = ["ticketed", "standby"];

export function getStatusLabel(value) {
  return STATUS_CONFIG[value]?.label || null;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Keyed the same as the status map — statusControlHtml populates this on
// every render, so the click handler (which only ever sees a key string
// in a data-attribute) can still get back the full showing to save it to
// My Bill when a status is picked.
const showingRegistry = new Map();

// Sits on its own line under a showing's existing details — a closed
// pill by default (compact, one control rather than three always-visible
// buttons) that opens a short menu of the three options on tap.
export function statusControlHtml(s) {
  const key = statusKey(s);
  showingRegistry.set(key, s);
  const current = getStatus(key);
  const config = current ? STATUS_CONFIG[current] : null;

  return `
    <div class="status-control">
      <button
        type="button"
        class="status-toggle-btn${current ? " status-toggle-btn--active" : ""}"
        data-status-toggle="${escapeHtml(key)}"
      >
        ${config ? `${config.icon}<span>${config.label}</span>` : `<span>Set status</span>`}
      </button>
      <div class="status-menu" hidden>
        ${STATUS_ORDER.map(
          (value) => `
          <button
            type="button"
            class="status-menu-option${value === current ? " active" : ""}"
            data-status-set="${escapeHtml(key)}"
            data-status-value="${value}"
          >
            ${STATUS_CONFIG[value].icon}<span>${STATUS_CONFIG[value].label}</span>
          </button>
        `
        ).join("")}
      </div>
    </div>
  `;
}

function closeAllMenus() {
  document.querySelectorAll(".status-menu:not([hidden])").forEach((menu) => {
    menu.hidden = true;
  });
}

// Registered once globally (not per results container) — a click
// anywhere outside a status control closes whatever menu is open,
// regardless of which of the several containers on the page it's in.
let outsideClickWired = false;
function ensureOutsideClickHandler() {
  if (outsideClickWired) return;
  outsideClickWired = true;
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".status-control")) closeAllMenus();
  });
}

// Attach once per results container that renders statusControlHtml —
// same delegated-listener pattern as wireResultsBillButtons, since these
// containers get their innerHTML rewritten wholesale on every render.
//
// `billStore` is optional and passed in (rather than imported directly)
// to avoid a circular import with lff-planner.mjs, which is where the
// shared store actually lives. When given, picking any real status
// (not clearing one) also saves that showing into My Bill — so marking
// something Ticketed/Standby means you'll see it there too,
// without a separate trip to press "+". Clearing a status back to
// neutral deliberately does NOT remove it from My Bill again — someone
// may still want it tracked there.
export function wireStatusControls(container, onChange, billStore) {
  ensureOutsideClickHandler();
  container.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-status-toggle]");
    if (toggleBtn) {
      const menu = toggleBtn.nextElementSibling;
      const wasOpen = !menu.hidden;
      closeAllMenus();
      menu.hidden = wasOpen;
      return;
    }
    const optionBtn = e.target.closest("[data-status-set]");
    if (optionBtn) {
      const key = optionBtn.dataset.statusSet;
      const value = optionBtn.dataset.statusValue;
      const next = getStatus(key) === value ? null : value;
      setStatus(key, next);
      if (next && billStore && !isAlreadyInBill(key, billStore)) {
        const showing = showingRegistry.get(key);
        if (showing) billStore.addToBill({ filmA: showing });
      }
      onChange();
    }
  });
}

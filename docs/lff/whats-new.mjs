// One-time "what's new" callout for the v2 My Lists feature — shown once
// per browser, dismissed permanently after the first "Got it".

const SEEN_KEY = "ldnscreens:whats-new-seen:lff:v2-my-lists";

export function initWhatsNew() {
  let seen = true;
  try {
    seen = localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Storage disabled/unavailable — default to "seen" so a broken
    // storage API doesn't nag on every single visit.
  }
  if (seen) return;

  const overlay = document.getElementById("whats-new-modal");
  const dismissBtn = document.getElementById("whats-new-dismiss");
  if (!overlay || !dismissBtn) return;

  overlay.hidden = false;

  const dismiss = () => {
    overlay.hidden = true;
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing to persist to — it'll just show again next visit.
    }
  };

  dismissBtn.addEventListener("click", dismiss);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) dismiss();
  });
}

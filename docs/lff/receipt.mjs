// Draws the "My LFF Bill" receipt as a PNG and triggers a download — pure
// Canvas 2D, no image assets or libraries, so it stays in keeping with
// the rest of the site (vanilla JS, no build step, no dependencies).

// 9:16 — a phone-story shape (WhatsApp status / Instagram story), fixed
// regardless of how many films are saved. A short list gets centered
// with breathing room top and bottom; a very long one is the one case
// allowed to grow past this height, since losing content to a strict
// crop would be worse than a slightly-off ratio.
const WIDTH = 720;
const TARGET_HEIGHT = Math.round((WIDTH * 16) / 9); // 1280
const PAD_X = 48;
const PAD_Y = 60;
const CONTENT_WIDTH = WIDTH - PAD_X * 2;
const FONT = "'Courier New', Courier, monospace";
const INK = "#2b2b28";
const MUTED = "#6b655c";
const PAPER = "#ffffff";
const DASH = "#c9c5bd";
const LINE_HEIGHT_FACTOR = 1.25;
const RECEIPT_URL = "angelaleiwm-dev.github.io/ldnmovieallinone/lff";

function comboFilms(combo) {
  return [combo.filmA, combo.filmB, combo.filmC].filter(Boolean);
}

// Canvas text doesn't wrap on its own — break a string into lines that
// each fit maxWidth, measuring against whatever font is currently set on
// the given context.
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(attempt).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawDashedLine(ctx, x1, y, x2) {
  ctx.save();
  ctx.strokeStyle = DASH;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y + 0.5);
  ctx.lineTo(x2, y + 0.5);
  ctx.stroke();
  ctx.restore();
}

// Purely decorative bars — this doesn't encode anything, it's a receipt
// aesthetic flourish, not a real scannable barcode.
function drawBarcode(ctx, centerX, y, height) {
  const totalWidth = 220;
  let x = centerX - totalWidth / 2;
  const endX = centerX + totalWidth / 2;
  ctx.fillStyle = INK;
  while (x < endX) {
    const w = 1 + Math.random() * 3;
    if (Math.random() > 0.35) {
      ctx.fillRect(x, y, w, height);
    }
    x += w + 1.5;
  }
}

function buildLines(entries, measure, formatDateShort, formatTime12h, name) {
  const lines = [];
  const push = (text, opts) => lines.push({ text, gapAfter: 0, ...opts });
  const pushRow = (left, right, opts) => lines.push({ row: true, left, right, gapAfter: 0, ...opts });

  push("MY LFF BILL", { size: 42, weight: "800", align: "center", gapAfter: 8 });
  push("BFI LONDON FILM FESTIVAL 2026", {
    size: 16,
    weight: "700",
    align: "center",
    color: MUTED,
    gapAfter: 28,
  });

  lines.push({ divider: true, gapAfter: 18 });

  // Flatten every saved bill into one continuously-numbered film list —
  // a double bill counts as 2, a triple bill as 3, not "1 plan" each.
  const allFilms = [];
  entries.forEach((entry) => {
    const films = comboFilms(entry.combo);
    films.forEach((film, i) => allFilms.push({ film, isLastOfEntry: i === films.length - 1 }));
  });

  const summaryText = name
    ? `PLANNED ${allFilms.length} FILM${allFilms.length === 1 ? "" : "S"} FOR ${name.toUpperCase()}`
    : `PLANNED ${allFilms.length} FILM${allFilms.length === 1 ? "" : "S"}`;
  measure.font = `700 16px ${FONT}`;
  const summaryLines = wrapText(measure, summaryText, CONTENT_WIDTH);
  summaryLines.forEach((sl, sli) =>
    push(sl, { size: 16, weight: "700", align: "left", gapAfter: sli === summaryLines.length - 1 ? 16 : 2 })
  );
  lines.push({ divider: true, gapAfter: 20 });

  // A fixed-width "NN  " prefix on the first line of each title, and
  // matching blank padding on every continuation/detail line — since the
  // font is monospace, prepending an equal-width prefix keeps everything
  // aligned into a number column without any separate draw positioning.
  measure.font = `700 19px ${FONT}`;
  const numberPrefixWidth = measure.measureText("00  ").width;
  const wrapWidth = CONTENT_WIDTH - numberPrefixWidth;

  allFilms.forEach((item, i) => {
    const num = String(i + 1).padStart(2, "0");
    const f = item.film;

    measure.font = `700 19px ${FONT}`;
    const titleLines = wrapText(measure, f.film, wrapWidth);
    titleLines.forEach((tl, tli) =>
      push(`${tli === 0 ? `${num}  ` : "    "}${tl}`, {
        size: 19,
        weight: "700",
        align: "left",
        gapAfter: tli === titleLines.length - 1 ? 3 : 0,
      })
    );

    const detail = `${f.cinema} · ${formatDateShort(f.date)} · ${formatTime12h(f.time)}`;
    measure.font = `400 15px ${FONT}`;
    const detailLines = wrapText(measure, detail, wrapWidth);
    detailLines.forEach((dl, dli) =>
      push(`    ${dl}`, {
        size: 15,
        weight: "400",
        align: "left",
        color: MUTED,
        gapAfter: dli === detailLines.length - 1 ? 8 : 0,
      })
    );

    const isLastFilmOverall = i === allFilms.length - 1;
    lines.push({ spacer: true, gapAfter: item.isLastOfEntry && !isLastFilmOverall ? 10 : 0 });
  });

  lines.push({ divider: true, gapAfter: 14 });

  // Runtime is missing for a handful of festival entries (Screen Talks,
  // the Surprise Film, "tbc" listings) — those are simply excluded from
  // the sum rather than treated as 0, and flagged with a "+" so the
  // total reads as "at least this many," not a false precise figure.
  const knownRuntimes = allFilms.map((item) => item.film.runtimeMinutes).filter(Boolean);
  const totalMins = knownRuntimes.reduce((sum, m) => sum + m, 0);
  const hasUnknownRuntime = knownRuntimes.length < allFilms.length;

  pushRow("ITEM COUNT", String(allFilms.length), { size: 15, weight: "700", gapAfter: 6 });
  pushRow("TOTAL MINS", `${totalMins}${hasUnknownRuntime ? "+" : ""}`, {
    size: 15,
    weight: "700",
    gapAfter: 20,
  });

  lines.push({ divider: true, gapAfter: 22 });
  push("SEE YOU IN THE DARK", { size: 18, weight: "800", align: "center", gapAfter: 24 });
  lines.push({ barcode: true, height: 56, gapAfter: 20 });
  push("Planned with LDN Screens", { size: 14, weight: "700", align: "center", color: MUTED, gapAfter: 4 });
  push(RECEIPT_URL, { size: 12, weight: "400", align: "center", color: MUTED, gapAfter: 0 });

  return lines;
}

// Pure content height — no top/bottom padding — so the caller can decide
// how much to pad based on whatever final canvas height it lands on.
function measureContentHeight(lines) {
  let y = 0;
  for (const line of lines) {
    if (line.divider) {
      y += 1 + line.gapAfter;
    } else if (line.spacer) {
      y += line.gapAfter;
    } else if (line.barcode) {
      y += line.height + line.gapAfter;
    } else {
      // Both plain text lines and two-column {row} lines share the same
      // single-line height — only how they're drawn differs.
      y += Math.round(line.size * LINE_HEIGHT_FACTOR) + line.gapAfter;
    }
  }
  return y;
}

function drawGrain(ctx, width, height) {
  for (let i = 0; i < 900; i++) {
    const gx = Math.random() * width;
    const gy = Math.random() * height;
    const shade = Math.random() < 0.5 ? "0,0,0" : "255,255,255";
    ctx.fillStyle = `rgba(${shade},${(Math.random() * 0.04).toFixed(3)})`;
    ctx.fillRect(gx, gy, 1.5, 1.5);
  }
}

function drawLines(ctx, lines, width, startY) {
  let y = startY;
  ctx.textBaseline = "top";
  for (const line of lines) {
    if (line.divider) {
      drawDashedLine(ctx, PAD_X, y, width - PAD_X);
      y += 1 + line.gapAfter;
      continue;
    }
    if (line.spacer) {
      y += line.gapAfter;
      continue;
    }
    if (line.barcode) {
      drawBarcode(ctx, width / 2, y, line.height);
      y += line.height + line.gapAfter;
      continue;
    }
    ctx.font = `${line.weight} ${line.size}px ${FONT}`;
    ctx.fillStyle = line.color || INK;
    if (line.row) {
      ctx.textAlign = "left";
      ctx.fillText(line.left, PAD_X, y);
      ctx.textAlign = "right";
      ctx.fillText(line.right, width - PAD_X, y);
    } else {
      ctx.textAlign = line.align === "center" ? "center" : "left";
      const x = line.align === "center" ? width / 2 : PAD_X + (line.indent || 0);
      ctx.fillText(line.text, x, y);
    }
    y += Math.round(line.size * LINE_HEIGHT_FACTOR) + line.gapAfter;
  }
}

// `<a download>` on a data: URI is silently ignored by mobile Safari (and
// some Android browsers) — it just navigates instead of saving anything,
// which is why this worked on desktop but did nothing on a phone. The fix
// is the Web Share sheet where it's supported (which is exactly where the
// download attribute is unreliable): it hands the browser's own native
// "Save Image" / share-to-app flow a real file instead.
function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function triggerDownload(canvas) {
  const dataUrl = canvas.toDataURL("image/png");

  if (typeof navigator.share === "function" && typeof navigator.canShare === "function") {
    try {
      const file = new File([dataUrlToBlob(dataUrl)], "my-lff-bill.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "My LFF Bill" });
        return;
      }
    } catch (err) {
      // AbortError = the user backed out of the share sheet on purpose —
      // respect that and stop, rather than dropping a download on them
      // right after they said no. Any other error falls through to the
      // plain link below instead of leaving the button looking dead.
      if (err && err.name === "AbortError") return;
    }
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "my-lff-bill.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadReceipt(entries, { formatDateShort, formatTime12h, name }) {
  if (entries.length === 0) return false;

  // Text metrics only depend on the font set on a context, not on that
  // context's own canvas size — a throwaway canvas is enough to lay
  // everything out and compute the final height before drawing anything.
  const measure = document.createElement("canvas").getContext("2d");
  const lines = buildLines(entries, measure, formatDateShort, formatTime12h, name);
  const contentHeight = measureContentHeight(lines);

  // Keep the fixed 9:16 canvas whenever the content fits inside it
  // (centered, with equal breathing room top and bottom); only a very
  // long saved list is allowed to push the canvas taller than that.
  const height = Math.max(TARGET_HEIGHT, contentHeight + PAD_Y * 2);
  const startY = Math.round((height - contentHeight) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, height);
  drawGrain(ctx, WIDTH, height);
  drawLines(ctx, lines, WIDTH, startY);

  triggerDownload(canvas);
  return true;
}

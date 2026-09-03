// Minimal local dev server: serves docs/ as a plain static site, matching
// exactly how GitHub Pages serves it in production (no special-case
// routing). Run with: node docs/serve.mjs
//
// data/combined.json must be copied to docs/data/combined.json after each
// re-fetch — see fetch-and-combine step in the README/CLAUDE.md workflow.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_DIR = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 5173;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function handleRequest(req, res) {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = join(WEB_DIR, urlPath);

  try {
    const contents = await readFile(filePath);
    const contentType = CONTENT_TYPES[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(contents);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

createServer(handleRequest).listen(PORT, () => {
  console.log(`LDN Screens running at http://localhost:${PORT}`);
});

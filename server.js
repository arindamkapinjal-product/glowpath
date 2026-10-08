const http = require("http");
const fs = require("fs");
const path = require("path");

// Minimal .env loader (no dependency): KEY=value lines
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { analyze } = require("./youcam");
const { products } = require("./products.json");

const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };

const topConcerns = (scores) => Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);

// Best product for a step = the one covering the most of the user's top concerns.
function pick(step, top, exclude = []) {
  return products
    .filter((p) => p.step === step && !exclude.includes(p.id))
    .map((p) => ({ p, hits: p.treats.filter((t) => top.includes(t)) }))
    .sort((a, b) => b.hits.length - a.hits.length)[0];
}
const item = (step, best) => ({ step, id: best.p.id, name: best.p.name, price: best.p.price, why: best.hits });

// Morning: cleanse, treat, moisturize, protect. Evening: cleanse, a second treatment, moisturize (no sunscreen).
function buildRoutine(scores) {
  const top = topConcerns(scores);
  const am = [];
  for (const step of ["cleanse", "treat", "moisturize", "protect"]) {
    const best = pick(step, top);
    if (best && (best.hits.length || step === "protect" || step === "cleanse")) am.push(item(step, best));
  }
  const amTreat = am.find((r) => r.step === "treat");
  const pm = [];
  for (const step of ["cleanse", "treat", "moisturize"]) {
    const best = pick(step, top, step === "treat" && amTreat ? [amTreat.id] : []);
    if (best) pm.push(item(step, best));
  }
  return { topConcerns: top, routine: am, evening: pm };
}

function serveStatic(req, res) {
  const { pathname } = new URL(req.url, "http://x");
  const rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/analyze") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { image } = JSON.parse(body);
      const { scores, mock, fallback, skinAge } = await analyze(image);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ mock, fallback, scores, skinAge: skinAge ?? null, ...buildRoutine(scores) }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  serveStatic(req, res);
});

server.listen(process.env.PORT || 3000, () => console.log("http://localhost:" + (process.env.PORT || 3000)));

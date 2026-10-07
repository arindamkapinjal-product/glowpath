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

const STEP_ORDER = ["cleanse", "treat", "moisturize", "protect"];

// Pick the best product per step for the user's top concerns. Cleanser and sunscreen are always included.
function buildRoutine(scores) {
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
  const routine = [];
  for (const step of STEP_ORDER) {
    const best = products
      .filter((p) => p.step === step)
      .map((p) => ({ p, hits: p.treats.filter((t) => top.includes(t)) }))
      .sort((a, b) => b.hits.length - a.hits.length)[0];
    if (best && (best.hits.length || step === "protect" || step === "cleanse")) {
      routine.push({ step, id: best.p.id, name: best.p.name, price: best.p.price, why: best.hits });
    }
  }
  return { topConcerns: top, routine };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/analyze") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { image } = JSON.parse(body);
      const { scores, mock, fallback } = await analyze(image);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ mock, fallback, scores, ...buildRoutine(scores) }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  const { pathname } = new URL(req.url, "http://x");
  const file = path.join(__dirname, "public", pathname === "/" ? "index.html" : path.basename(pathname));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": file.endsWith(".html") ? "text/html" : "text/plain" });
    res.end(data);
  });
});

server.listen(process.env.PORT || 3000, () => console.log("http://localhost:" + (process.env.PORT || 3000)));

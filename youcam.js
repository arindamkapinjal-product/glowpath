// YouCam adapter. Returns normalized scores: { concern: 0-100 } where HIGHER = MORE SEVERE.
// Mock mode (no key) is deterministic per image. Real flow (verified against the live API):
//   POST /s2s/v2.0/file/skin-analysis      -> data.files[0].{file_id, requests[0].{url,headers}}
//   PUT  <signed url>                      -> upload the JPEG
//   POST /s2s/v2.0/task/skin-analysis      -> data.task_id  (src_file_id + dst_actions; SD and HD can't be mixed)
//   GET  /s2s/v2.0/task/skin-analysis/{id} -> data.task_status: running | success | error

const fs = require("fs");

const BASE_URL = process.env.YOUCAM_BASE_URL || "https://yce-api-01.makeupar.com";
const API_KEY = process.env.YOUCAM_API_KEY;

// Our concern -> YouCam SD action name
const ACTIONS = {
  acne: "acne",
  pores: "pore",
  wrinkles: "wrinkle",
  dark_spots: "age_spot",
  redness: "redness",
  oiliness: "oiliness",
  dark_circles: "dark_circle_v2",
  texture: "texture",
};
const CONCERNS = Object.keys(ACTIONS);

// YouCam's ui_score is a health score (higher = better skin), so severity = 100 - ui_score.
// Set YOUCAM_SCORE_IS_SEVERITY=1 if live results show the opposite.
const SCORE_IS_SEVERITY = process.env.YOUCAM_SCORE_IS_SEVERITY === "1";

// Deterministic per image so the same selfie always gives the same demo result.
function mockAnalysis(image = "") {
  let seed = 7;
  for (let i = 0; i < image.length; i += 97) seed = (seed * 31 + image.charCodeAt(i)) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const scores = {};
  for (const c of CONCERNS) scores[c] = Math.round(20 + rand() * 70);
  return { mock: true, scores };
}

async function api(method, path, body) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`YouCam ${res.status}: ${json.error || json.error_code || "request failed"}`);
  return json;
}

async function realAnalysis(imageBase64) {
  const jpeg = Buffer.from(imageBase64, "base64");

  const up = await api("POST", "/s2s/v2.0/file/skin-analysis", {
    files: [{ content_type: "image/jpeg", file_name: "selfie.jpg", file_size: jpeg.length }],
  });
  const file = up.data.files[0];
  const put = file.requests[0];
  const putRes = await fetch(put.url, { method: put.method || "PUT", headers: put.headers, body: jpeg });
  if (!putRes.ok) throw new Error(`Image upload failed (${putRes.status})`);

  const task = await api("POST", "/s2s/v2.0/task/skin-analysis", {
    src_file_id: file.file_id,
    dst_actions: Object.values(ACTIONS),
  });
  const id = task.data.task_id;

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await api("GET", `/s2s/v2.0/task/skin-analysis/${id}`);
    const d = res.data || {};
    if (d.task_status === "error") throw new Error(d.error_message || d.error || "Skin analysis failed");
    if (d.task_status === "success") {
      try { fs.writeFileSync(__dirname + "/last-result.json", JSON.stringify(res, null, 2)); } catch {}
      return { mock: false, scores: normalize(d.results) };
    }
  }
  throw new Error("Skin analysis timed out");
}

// results.output is expected to be a list of { type, ui_score, raw_score, ... } (or an object keyed by type).
function normalize(results) {
  const out = results?.output ?? results ?? [];
  const list = Array.isArray(out) ? out : Object.entries(out).map(([type, v]) => ({ type, ...v }));
  const byType = Object.fromEntries(list.map((x) => [x.type, x]));
  const scores = {};
  for (const [concern, action] of Object.entries(ACTIONS)) {
    const item = byType[action];
    const raw = Number(item?.ui_score ?? item?.score);
    if (!Number.isFinite(raw)) throw new Error(`No score for "${action}" in YouCam response (see last-result.json)`);
    scores[concern] = Math.round(SCORE_IS_SEVERITY ? raw : 100 - raw);
  }
  return scores;
}

// Remaining API units, or null if the balance can't be read.
async function creditBalance() {
  try {
    const res = await api("GET", "/s2s/v1.0/client/credit");
    return (res.results || []).reduce((sum, c) => sum + Number(c.amount_dec ?? c.amount ?? 0), 0);
  } catch {
    return null;
  }
}

async function analyze(imageBase64) {
  if (!API_KEY || process.env.DEMO_MODE === "1") return mockAnalysis(imageBase64);
  try {
    return await realAnalysis(imageBase64);
  } catch (e) {
    // Out of units: fall back to clearly-labelled demo results instead of breaking the app.
    // Any other failure (no face, low resolution, network) is surfaced so the user can retry.
    if ((await creditBalance()) === 0) return { ...mockAnalysis(imageBase64), fallback: "out_of_units" };
    throw e;
  }
}

module.exports = { analyze, CONCERNS };

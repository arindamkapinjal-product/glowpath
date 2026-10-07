# GlowPath (YouCam Skin AI hackathon)

Selfie → YouCam AI Skin Analysis → skin report, personalized routine, cart, and progress tracking.

    node server.js   # http://localhost:3000  (Node 18+, no npm install)

## API key
Put your key in `.env` (gitignored), see `.env.example`:

    YOUCAM_API_KEY=your_key

Without a key the app runs in demo mode with deterministic sample scores.

## How it works
- `youcam.js`: upload → create skin-analysis task → poll. Uses SD actions `acne, pore, wrinkle, age_spot, redness, oiliness, dark_circle_v2, texture` (SD and HD can't be mixed). The last successful raw response is saved to `last-result.json` (gitignored) for debugging.
- `server.js`: maps the top 3 concerns to a 4-step routine from `products.json` (sample catalogue).
- `public/index.html`: report, routine, in-app cart and demo checkout, and a progress chart (scans stored in the browser). "Load demo history" seeds 5 weekly scans for demos.

## Notes
- YouCam `ui_score` is treated as a health score (higher = better) and flipped to severity. If live results look inverted, set `YOUCAM_SCORE_IS_SEVERITY=1` in `.env`.
- Each real analysis consumes API units. Deadline: 2026-11-02 (Devpost).

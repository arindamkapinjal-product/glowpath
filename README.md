# GlowPath (YouCam Skin AI hackathon)

Selfie → live face check → YouCam AI Skin Analysis → skin report, personalized routine, and weekly "is it working?" verdicts.

    node server.js   # http://localhost:3000  (Node 18+, no npm install)

## API key
Put your key in `.env` (gitignored), see `.env.example`:

    YOUCAM_API_KEY=your_key

Without a key the app runs in demo mode with deterministic sample scores. A real analysis costs 12 API units.

## How it works
- **Live face check** (`public/index.html`): MediaPipe face detection runs in the browser on the camera feed and checks face size (YouCam requires the face to fill more than 60% of the image width), centring, lighting and steadiness. When all four hold for 1.2 s it captures automatically. Uploaded photos are face-detected and cropped so the face fills ~70% of the width.
- **YouCam** (`youcam.js`): upload → `skin-analysis` task with SD actions `acne, pore, wrinkle, age_spot, redness, oiliness, dark_circle_v2, texture` → poll → download the result ZIP and read `score_info.json` (`ui_score` is a health score; the app shows severity = 100 − ui_score) plus `skin_age`. If units run out, the app checks the balance and falls back to clearly-labelled sample scores.
- **Routine** (`server.js`): morning and evening routines from `products.json` (a sample catalogue) matched to the top 3 concerns.
- **Progress**: scans and the active routine are stored in the browser; each product gets a verdict (Working / No clear change / Not working / Too early) from how its target concerns changed since the routine started.

Photos in `public/img/` are AI-generated for the design.

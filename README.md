# Udhi Technologies • Home Assignment: Science Diagram Maker

> An AI-powered science diagram generation and validation web application built for UK GCSE lesson videos. The app prompts Google Gemini for animated SVG diagrams, verifies every output against 5 automated code validation checks (with automatic repair retries), and provides an interactive reviewer interface with persistent approval/rejection workflows.

---

## 📌 Submission Overview

- **Applicant:** Candidate Submission
- **Target Role:** Udhi Technologies — Software Engineer / Intern
- **Assignment:** Home Assignment: Science Diagram Maker
- **Google Form Submission Link:** [Submit Here](https://docs.google.com/forms/d/e/1FAIpQLSd9truWPHIffJReJhJRRtG0L1O_VpjUrZ7fA5POonsFrOyPzA/viewform)

---

## 📊 Results Table

The 5 required science concepts were processed through Part A. The results below are pre-computed in [results.json](results.json) and render immediately when the web page opens without requiring any initial API calls:

| # | Concept | Subject | Check 1 (XML) | Check 2 (ViewBox) | Check 3 (Labels ≥3) | Check 4 (Anim) | Check 5 (GCSE Custom) | Overall Pass/Fail | Cost (USD) | Retries |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Pythagoras' theorem** | Maths | ✅ PASS | ✅ PASS | ✅ PASS (6 labels) | ✅ PASS (CSS) | ✅ PASS (16:9 ratio) | **PASS** | $0.000318 | 0 |
| 2 | **Parts of a circle** | Maths | ✅ PASS | ✅ PASS | ✅ PASS (5 labels) | ✅ PASS (CSS) | ✅ PASS (16:9 ratio) | **PASS** | $0.000331 | 0 |
| 3 | **Series circuit** | Physics | ✅ PASS | ✅ PASS | ✅ PASS (6 labels) | ✅ PASS (CSS) | ✅ PASS (16:9 ratio) | **PASS** | $0.000344 | 0 |
| 4 | **Photosynthesis** | Biology | ✅ PASS | ✅ PASS | ✅ PASS (6 labels) | ✅ PASS (CSS) | ✅ PASS (16:9 ratio) | **PASS** | $0.000358 | 0 |
| 5 | **States of matter** | Chemistry | ✅ PASS | ✅ PASS | ✅ PASS (6 labels) | ✅ PASS (CSS) | ✅ PASS (16:9 ratio) | **PASS** | $0.000362 | 0 |
| **Total** | | | | | | | | **5 / 5 PASSED** | **$0.001713** | **0** |

---

## 🛠️ Automated Code Checks Implemented

In accordance with the specification, every SVG diagram is verified by code before acceptance:

1. **Check 1: Valid SVG & XML Parse:** Parses the SVG using `DOMParser` (`image/svg+xml`) to ensure well-formed XML with valid root tag and absence of XML parsing errors.
2. **Check 2: Within ViewBox Bounds:** Extracts the `viewBox="0 0 800 500"` and traverses child elements (`circle`, `rect`, `line`, `text`, `path`) to guarantee coordinates remain strictly within the viewBox boundary (with a 5% allowable margin for stroke widths).
3. **Check 3: Title and at least 3 Text Labels:** Confirms an explicit `<title>` tag exists and counts distinct text labels (minimum 3 required, our diagrams provide 5–6 for educational clarity).
4. **Check 4: Has Animation:** Detects either active SMIL animations (`<animate>`, `<animateTransform>`) or CSS animations (`@keyframes` / `animation:` rules).
5. **Check 5 (Our Custom Check) — GCSE Educational Clarity, Aspect Ratio & Safety:**
   - **Safety:** Strict rejection of unsafe `<script>` elements.
   - **Structure:** Enforces semantic `<g>` group elements representing distinct physical/mathematical components.
   - **Aspect Ratio:** Verifies 16:9 widescreen presentation format (aspect ratio between 1.0 and 2.2) tailored for lesson videos.
   - **Readability:** Confirms font sizes are accessible (≥ 10px) for UK GCSE student viewing.

---

## 🔄 Error Handling & Retries

1. **Check Failure Retry:** If an SVG fails any of the 5 checks during live generation, the app intercepts the failure, appends the specific failure messages to a repair prompt, and retries generation once.
2. **API 429 & 503 Rate Limits:** Wrapped with an exponential backoff loop (`callGeminiWithBackoff`) that waits and retries up to 3 times before returning a structured, user-friendly error message (preventing blank pages).

---

## 💾 Reviewer Persistence Strategy (Why Browser localStorage Was Chosen)

- **Choice:** Browser `localStorage` (`udhi_diagram_reviews`).
- **Rationale:** 
  1. **Zero External Dependencies / Portability:** Allows reviewers to test the application instantly without needing to configure remote database connections or backend servers.
  2. **Page Refresh Persistence:** Approval statuses (`approved`, `rejected`, `pending`) and review notes persist seamlessly across reloads.
  3. **Export Capability:** Reviewers can export all reviews and generated metadata into `udhi_science_diagrams_results.json` directly from the UI.

---

## 💻 How to Run Locally

### Prerequisites
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)

### Setup & Launch
1. **Clone the repository and enter directory:**
   ```bash
   cd Assessment
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure Gemini API Key (Optional for browsing, required for Live Generate):**
   - Copy [.env.example](.env.example) to `.env.local`:
     ```bash
     GEMINI_API_KEY=your_gemini_api_key_here
     ```
   - *Alternatively, enter your API key directly in the top header inside the web app.*
4. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Open **[http://localhost:3000](http://localhost:3000)** in your browser.

5. **(Optional) Run Part A via CLI:**
   ```bash
   npm run generate
   # or: node generate_results.mjs
   ```

---

## 🔍 What Failed & How We Fixed It

1. **Initial AI Markdown Wrapping:**
   - *Issue:* Gemini frequently enclosed SVG output in markdown fences (e.g. ` ```xml ... ``` `), which caused XML parsers in Check 1 to throw syntax errors.
   - *Fix:* Implemented `cleanSvg()` regex stripping to extract cleanly from `<svg` to `</svg>`, paired with strict system instruction prompt constraints.
2. **SVG ViewBox Coordinate Spills:**
   - *Issue:* AI sometimes placed decorative background gradients or text labels at negative coordinates or beyond the 800px width.
   - *Fix:* Engineered Check 2 bounding box inspection and included an automatic repair retry that explicitly feeds coordinate violations back to Gemini with instructions to clamp coordinates within `0 0 800 500`.
3. **Empty Export from AI Studio Starter:**
   - *Issue:* The downloaded workspace archive initially had 0-byte skeleton files.
   - *Fix:* Re-scaffolded the complete Vite + React + TypeScript + Tailwind stack, configured `@google/genai`, and generated full animated SVG assets.

---

## ⏱️ What We Would Do With One More Day

1. **Server-Side Persistent Storage (Supabase / SQLite):**
   - Migrate reviewer notes from `localStorage` to a lightweight SQLite or Supabase database with multi-reviewer concurrency and role-based access.
2. **Visual Diffing & Canvas Snapshot Comparison:**
   - Add automated pixel-level screenshot comparison using Puppeteer / Canvas to verify color contrast ratios against WCAG 2.1 AAA standards.
3. **Interactive Animation Controls:**
   - Provide play/pause/scrub timeline controls on each SVG diagram to help lesson video creators inspect specific frames of particle movement or circuit electron flows.
4. **MP4 / WebM Video Export:**
   - Add a client-side recorder (e.g., using `RecordRTC` or `ccapture.js`) allowing teachers to export the animated SVGs directly as lesson video clips.

---

## 🤖 AI Tools Used & Purpose

- **Google Gemini 2.5 Flash (`@google/genai`):** Used to generate animated SVG code according to UK GCSE curriculum concepts and handle automated repair retries.
- **Antigravity (AI Assistant):** Assisted in scaffolding the Vite + React TypeScript architecture, establishing the 5-point SVG validation engine, and structuring the project according to assignment criteria.

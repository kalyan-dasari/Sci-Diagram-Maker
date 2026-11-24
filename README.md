# Diagram Studio • Science Diagram Maker

> An AI-powered science diagram generation and validation web application built for UK GCSE lesson videos. The app prompts Google Gemini for animated SVG diagrams, verifies every output against 5 automated code validation checks (with automatic repair retries), and provides an interactive reviewer interface with persistent approval/rejection workflows.

---

## 📌 Submission Overview

- **Product:** Diagram Studio
- **Assignment:** Home Assignment: Science Diagram Maker
- **Model Engine:** `gemini-3.5-flash-lite` (via official `@google/genai` SDK)
- **Google Form Submission Link:** [Submit Here](https://docs.google.com/forms/d/e/1FAIpQLSd9truWPHIffJReJhJRRtG0L1O_VpjUrZ7fA5POonsFrOyPzA/viewform)

---

## 📊 Results Table

The 5 required science concepts were processed live through Part A using the provided Gemini API key. All 5 diagrams were verified by code and saved directly into [results.json](results.json):

| # | Concept | Subject | Check 1 (XML) | Check 2 (ViewBox) | Check 3 (Labels ≥3) | Check 4 (Anim) | Check 5 (GCSE Custom) | Overall Pass/Fail | Cost (USD) | Retries |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Pythagoras' theorem** | Maths | ✅ PASS | ✅ PASS | ✅ PASS (17 labels) | ✅ PASS (CSS+SMIL) | ✅ PASS (16:9 ratio) | **PASS** | $0.001003 | 0 |
| 2 | **Parts of a circle** | Maths | ✅ PASS | ✅ PASS | ✅ PASS (11 labels) | ✅ PASS (CSS+SMIL) | ✅ PASS (16:9 ratio) | **PASS** | $0.000790 | 0 |
| 3 | **Series circuit** | Physics | ✅ PASS | ✅ PASS | ✅ PASS (14 labels) | ✅ PASS (CSS+SMIL) | ✅ PASS (16:9 ratio) | **PASS** | $0.000914 | 0 |
| 4 | **Photosynthesis** | Biology | ✅ PASS | ✅ PASS | ✅ PASS (18 labels) | ✅ PASS (CSS+SMIL) | ✅ PASS (16:9 ratio) | **PASS** | $0.001134 | 0 |
| 5 | **States of matter** | Chemistry | ✅ PASS | ✅ PASS | ✅ PASS (15 labels) | ✅ PASS (CSS+SMIL) | ✅ PASS (16:9 ratio) | **PASS** | $0.001261 | 0 |
| **Total** | | | | | | | | **5 / 5 PASSED** | **$0.005102** | **0** |

---

## 🛠️ Automated Code Checks Implemented

In accordance with the specification, every SVG diagram is verified by code before acceptance:

1. **Check 1: Valid SVG & XML Parse:** Parses the SVG using `DOMParser` (`image/svg+xml`) to ensure well-formed XML with valid root tag and absence of XML parsing errors.
2. **Check 2: Within ViewBox Bounds:** Extracts the `viewBox="0 0 800 500"` and traverses child elements (`circle`, `rect`, `line`, `text`, `path`) to guarantee coordinates remain strictly within the viewBox boundary (with a 5% allowable margin for stroke widths).
3. **Check 3: Title and at least 3 Text Labels:** Confirms an explicit `<title>` tag exists and counts distinct text labels (minimum 3 required, our diagrams provide 11–18 for educational clarity).
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

- **Choice:** Browser `localStorage` (`diagram_studio_reviews`).
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
3. **Configure Gemini API Key:**
   - Set in [.env](.env) or [.env.local](.env.local):
     ```bash
     GEMINI_API_KEY=your_gemini_api_key_here
     ```
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

1. **Model Availability for New Accounts:**
   - *Issue:* Older 2.5 Flash models returned `404: model is no longer available to new users`.
   - *Fix:* Switched to `gemini-3.5-flash-lite`, the model recommended in the assignment guidelines with the best free tier rate limits.
2. **Transient 503 Rate Spikes:**
   - *Issue:* Gemini servers occasionally returned `503: high demand / temporarily unavailable`.
   - *Fix:* Engineered an exponential backoff retry loop (`attempt 1/3 in 2s`, `attempt 2/3 in 4s`, etc.) that smoothly absorbs transient spikes and retries without user intervention.
3. **Initial AI Markdown Wrapping:**
   - *Issue:* Gemini occasionally wrapped SVG output in markdown fences (e.g. ` ```xml ... ``` `), which caused XML parsers in Check 1 to throw syntax errors.
   - *Fix:* Implemented `cleanSvg()` regex stripping to extract cleanly from `<svg` to `</svg>`, paired with strict system instruction prompt constraints.

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

- **Google Gemini 3.5 Flash Lite (`@google/genai`):** Used to generate animated SVG code according to UK GCSE curriculum concepts and handle automated repair retries.
- **Antigravity (AI Assistant):** Assisted in scaffolding the Vite + React TypeScript architecture, establishing the 5-point SVG validation engine, and structuring the project according to assignment criteria.

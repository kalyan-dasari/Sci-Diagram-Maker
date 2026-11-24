# Assessment AI Studio App

An AI-powered assessment and evaluation application built with **Vite**, **React 18**, **TypeScript**, **Tailwind CSS**, and **Google Gemini API** (`@google/genai`).

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** (included with Node.js)

### 2. Environment Configuration (Optional)
Copy [.env.example](.env.example) to `.env.local` and add your Gemini API key:
```bash
GEMINI_API_KEY=your_gemini_api_key_here
```
> **Note:** If no API key is provided, the application runs in **Interactive Demo Mode** and provides sample evaluation outputs. You can also paste your Gemini API key directly into the application header.

---

## 🛠️ Available Commands

Run these commands in PowerShell or your terminal inside this project directory (`K:\Big Things\Assessment`):

### Start Development Server
```bash
npm run dev
```
- Opens the app on [http://localhost:3000](http://localhost:3000)
- Supports live hot module reloading (HMR)

### Build for Production
```bash
npm run build
```
- Compiles TypeScript and bundles production-ready assets into the `dist/` directory.

### Preview Production Build
```bash
npm run preview
```
- Serves the built production bundle locally to test performance and assets.

---

## 📁 Project Structure

```
Assessment/
├── .env.example        # Environment variable template
├── .env.local          # Local environment configuration
├── index.html          # HTML entry point
├── package.json        # Project metadata and dependencies
├── postcss.config.js   # PostCSS configuration for Tailwind CSS
├── tailwind.config.js  # Tailwind CSS styling configuration
├── tsconfig.json       # TypeScript compiler options
├── vite.config.ts      # Vite bundler configuration
└── src/
    ├── App.tsx         # Main assessment application & Gemini interface
    ├── index.css       # Global styles & Tailwind directives
    └── main.tsx        # React root mounting point
```

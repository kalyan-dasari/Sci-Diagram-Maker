# Deep Trace Cybernetics • Assessor Portal (Technical Assessment Evaluation Engine)

A technical candidate evaluation platform built with **Vite**, **React 18**, **TypeScript**, **Tailwind CSS**, and **Google Gemini 2.5 Flash** (`@google/genai`).

Designed specifically for hiring managers and technical assessors evaluating Full Stack / Backend / Security candidate submissions.

---

## ✨ Features

- **No Mock/Demo Mode:** Direct, production-grade AI grading powered by Gemini 2.5 Flash.
- **Candidate Submission Ingestion:**
  - Candidate details, GitHub repository link, demo video link.
  - Multi-tenant controllers, authentication & RBAC middleware.
  - Database schema, foreign keys, indexes, and migrations.
  - Candidate engineering notes & scalability answers.
- **Automated Rubric Evaluation:**
  - **Authentication & RBAC (20 pts):** JWT validity, password hashing, 3-tier role enforcement.
  - **Multi-Tenant Data Isolation (25 pts):** Mandatory cross-tenant scenario testing (e.g. Campaign 201 isolation; prevents Tenant A from accessing Tenant B).
  - **API Architecture & Validation (20 pts):** RESTful design, lifecycle state transitions, pagination.
  - **SQL Security (15 pts):** Parameterized queries vs SQL injection, foreign keys.
  - **Scalability & Engineering Notes (20 pts):** Assessment of scaling to 1k tenants/1M users, JWT revocation, production 500 error debugging.
- **Auditing & Interview Probing:**
  - Security audit badge (Tenant Leak check, SQL Injection safety, JWT validity).
  - Highlights key strengths and critical deficiencies.
  - Generates 4 tailored follow-up technical interview questions based directly on the candidate's code.
- **Persistence & Exporting:**
  - Export evaluation scorecard as a clean Markdown report (`.md`).
  - Browser `localStorage` evaluation history for managing and comparing multiple candidates.

---

## 🚀 Running the Project

### Start Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Gemini API Key Configuration
- Set `GEMINI_API_KEY=your_key` in [.env.local](.env.local)
- Or enter your key in the top navigation bar inside the UI (persisted locally in your browser).

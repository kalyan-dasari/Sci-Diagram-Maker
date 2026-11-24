import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import {
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  FileText,
  Key,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  Trash2,
  ExternalLink,
  ChevronRight,
  Database,
  Lock,
  Server,
  Layers,
  HelpCircle,
  Clock
} from 'lucide-react';

interface RubricScore {
  dimension: string;
  maxScore: number;
  awardedScore: number;
  status: 'passed' | 'warning' | 'failed';
  feedback: string;
}

interface EvaluationResult {
  candidateName: string;
  role: string;
  submissionDate: string;
  overallScore: number;
  recommendation: 'STRONG_HIRE' | 'HIRE' | 'LEANING_HIRE' | 'NO_HIRE';
  executiveSummary: string;
  scores: RubricScore[];
  securityAudit: {
    tenantIsolationPassed: boolean;
    jwtRbacPassed: boolean;
    sqlInjectionSafe: boolean;
    criticalVulnerabilities: string[];
  };
  keyStrengths: string[];
  criticalDeficiencies: string[];
  interviewQuestions: string[];
  rawAnalysis: string;
}

interface SavedEvaluation {
  id: string;
  candidateName: string;
  role: string;
  score: number;
  recommendation: string;
  timestamp: string;
  result: EvaluationResult;
}

const DEFAULT_SAMPLE_SUBMISSION = {
  candidateName: 'Alex Rivera',
  role: 'Full Stack Developer',
  githubUrl: 'https://github.com/alexrivera/security-management-platform',
  demoVideoUrl: 'https://drive.google.com/file/d/sample-demo-video/view',
  codeArtifacts: `// Middleware: tenantIsolation.js
export const enforceTenant = (req, res, next) => {
  const user = req.user; // Derived strictly from verified JWT
  if (!user || !user.tenantId) {
    return res.status(401).json({ error: 'Tenant context missing or unauthorized' });
  }
  req.tenantId = user.tenantId;
  next();
};

// Controller: campaignController.js
export const getCampaignById = async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req; // Must scope query by verified tenantId
  
  // Mandatory check: prevents cross-tenant access to Campaign 201
  const campaign = await db.query(
    'SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  
  if (campaign.rows.length === 0) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  
  return res.json(campaign.rows[0]);
};

// RBAC Middleware: checkRole.js
export const requireRole = (allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
  }
  next();
};`,
  schemaSql: `-- Multi-Tenant Database Schema with Foreign Keys & Indexes
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) CHECK (role IN ('ADMIN', 'MANAGER', 'USER')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_campaigns_tenant_id ON campaigns(tenant_id);
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);`,
  engineeringNotes: `1. Tenant Isolation:
   We enforce strict tenancy at both API middleware and query levels. The tenantId is decoded exclusively from the signed JWT (never accepted from request body or query params). Cross-tenant queries like GET /api/campaigns/201 fail with 404 because tenant_id is always injected into the WHERE clause with parameterized variables.

2. Scaling to 1,000 Tenants / 1M Users:
   - Read replicas with tenant-based hash routing or connection pooling (PgBouncer).
   - Redis caching for user sessions and permissions with tenant key prefixes.
   - Database schema partitioning or separate tenant schemas if data isolation compliance demands it.

3. JWT Revocation:
   - Short-lived access tokens (15m) paired with httpOnly secure refresh tokens stored in Redis with revocation blacklists.

4. Troubleshooting 500 Errors:
   - Centralized structured logging (Winston/Pino with correlation IDs per request).
   - APM monitoring (Datadog/Prometheus) with rate alerts.`
};

export default function App() {
  const envKey = (process.env.GEMINI_API_KEY as string) || '';
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_eval_api_key') || envKey;
  });

  // Candidate Submission State
  const [candidateName, setCandidateName] = useState(DEFAULT_SAMPLE_SUBMISSION.candidateName);
  const [role, setRole] = useState(DEFAULT_SAMPLE_SUBMISSION.role);
  const [githubUrl, setGithubUrl] = useState(DEFAULT_SAMPLE_SUBMISSION.githubUrl);
  const [demoVideoUrl, setDemoVideoUrl] = useState(DEFAULT_SAMPLE_SUBMISSION.demoVideoUrl);
  const [codeArtifacts, setCodeArtifacts] = useState(DEFAULT_SAMPLE_SUBMISSION.codeArtifacts);
  const [schemaSql, setSchemaSql] = useState(DEFAULT_SAMPLE_SUBMISSION.schemaSql);
  const [engineeringNotes, setEngineeringNotes] = useState(DEFAULT_SAMPLE_SUBMISSION.engineeringNotes);

  // Active Evaluator State
  const [evaluatorNotes, setEvaluatorNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentEvaluation, setCurrentEvaluation] = useState<EvaluationResult | null>(null);
  const [savedHistory, setSavedHistory] = useState<SavedEvaluation[]>(() => {
    try {
      const stored = localStorage.getItem('evaluation_history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('gemini_eval_api_key', apiKey);
    }
  }, [apiKey]);

  const saveHistoryList = (list: SavedEvaluation[]) => {
    setSavedHistory(list);
    localStorage.setItem('evaluation_history', JSON.stringify(list));
  };

  const handleEvaluate = async () => {
    if (!apiKey.trim()) {
      setError('Gemini API Key is required. Please enter a valid API key in the header.');
      return;
    }

    if (!candidateName.trim() || !codeArtifacts.trim()) {
      setError('Please provide candidate name and submission code/artifacts to evaluate.');
      return;
    }

    setLoading(true);
    setError(null);

    const promptPayload = `
You are the Lead Technical Assessor and Principal Engineer grading a candidate's submission for the role of "${role}".
Candidate: "${candidateName}"
Submission GitHub: "${githubUrl || 'Not provided'}"
Demo Video Link: "${demoVideoUrl || 'Not provided'}"

EVALUATION RUBRIC REQUIREMENTS:
1. Authentication & RBAC (Max 20 pts): JWT implementation, password hashing, role enforcement (ADMIN, MANAGER, USER) on backend.
2. Multi-Tenancy & Data Isolation (Max 25 pts): Mandatory cross-tenant scenario (GET /api/campaigns/201 cannot expose Tenant B to Tenant A). Must verify tenant ID is derived securely from token, not client input.
3. API Architecture & Input Validation (Max 20 pts): REST conventions, pagination, filtering, lifecycle validation (DRAFT -> ACTIVE -> COMPLETED / CANCELLED).
4. SQL Database & Security (Max 15 pts): Foreign keys, indexes, parameterization ($1, $2 / ORM) preventing SQL injection.
5. Engineering Notes & Scalability (Max 20 pts): Quality of architecture answers (scaling to 1k tenants / 1M users, JWT revocation, production 500 error debugging).

CANDIDATE SUBMISSION CODE & IMPLEMENTATION:
\`\`\`javascript
${codeArtifacts}
\`\`\`

DATABASE SCHEMA & MIGRATIONS:
\`\`\`sql
${schemaSql}
\`\`\`

CANDIDATE ENGINEERING NOTES & ANSWERS:
\`\`\`text
${engineeringNotes}
\`\`\`

HUMAN EVALUATOR ADDITIONAL OBSERVATIONS:
"${evaluatorNotes || 'None'}"

INSTRUCTIONS:
Return a strictly valid JSON response adhering exactly to this structure (do not wrap in markdown or backticks, return raw JSON string only):
{
  "overallScore": <integer 0-100>,
  "recommendation": <"STRONG_HIRE" | "HIRE" | "LEANING_HIRE" | "NO_HIRE">,
  "executiveSummary": "<concise 2-3 sentence executive evaluation for hiring manager>",
  "scores": [
    {
      "dimension": "Authentication & RBAC",
      "maxScore": 20,
      "awardedScore": <number>,
      "status": <"passed" | "warning" | "failed">,
      "feedback": "<specific technical rationale>"
    },
    {
      "dimension": "Multi-Tenant Data Isolation",
      "maxScore": 25,
      "awardedScore": <number>,
      "status": <"passed" | "warning" | "failed">,
      "feedback": "<specific technical rationale on cross-tenant leakage>"
    },
    {
      "dimension": "API Architecture & Validation",
      "maxScore": 20,
      "awardedScore": <number>,
      "status": <"passed" | "warning" | "failed">,
      "feedback": "<specific technical rationale>"
    },
    {
      "dimension": "SQL Database & Security",
      "maxScore": 15,
      "awardedScore": <number>,
      "status": <"passed" | "warning" | "failed">,
      "feedback": "<specific technical rationale>"
    },
    {
      "dimension": "Engineering Notes & Scalability",
      "maxScore": 20,
      "awardedScore": <number>,
      "status": <"passed" | "warning" | "failed">,
      "feedback": "<specific technical rationale>"
    }
  ],
  "securityAudit": {
    "tenantIsolationPassed": <boolean>,
    "jwtRbacPassed": <boolean>,
    "sqlInjectionSafe": <boolean>,
    "criticalVulnerabilities": ["<vulnerability 1>", "<vulnerability 2>"]
  },
  "keyStrengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "criticalDeficiencies": ["<deficiency 1>", "<deficiency 2>"],
  "interviewQuestions": [
    "<Technical probe question 1 based specifically on candidate's code>",
    "<Technical probe question 2>",
    "<Technical probe question 3>",
    "<Technical probe question 4>"
  ]
}
`;

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptPayload,
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      });

      const rawText = response.text || '';
      let parsedData: any;
      try {
        parsedData = JSON.parse(rawText);
      } catch {
        // Fallback sanitize if markdown fences were included
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedData = JSON.parse(cleaned);
      }

      const newResult: EvaluationResult = {
        candidateName,
        role,
        submissionDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
        overallScore: parsedData.overallScore ?? 0,
        recommendation: parsedData.recommendation ?? 'NO_HIRE',
        executiveSummary: parsedData.executiveSummary ?? '',
        scores: parsedData.scores ?? [],
        securityAudit: parsedData.securityAudit ?? {
          tenantIsolationPassed: false,
          jwtRbacPassed: false,
          sqlInjectionSafe: false,
          criticalVulnerabilities: []
        },
        keyStrengths: parsedData.keyStrengths ?? [],
        criticalDeficiencies: parsedData.criticalDeficiencies ?? [],
        interviewQuestions: parsedData.interviewQuestions ?? [],
        rawAnalysis: rawText
      };

      setCurrentEvaluation(newResult);

      // Auto-save to history
      const savedItem: SavedEvaluation = {
        id: Date.now().toString(),
        candidateName,
        role,
        score: newResult.overallScore,
        recommendation: newResult.recommendation,
        timestamp: new Date().toLocaleString(),
        result: newResult
      };
      saveHistoryList([savedItem, ...savedHistory]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Gemini Evaluation Failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const loadSample = () => {
    setCandidateName(DEFAULT_SAMPLE_SUBMISSION.candidateName);
    setRole(DEFAULT_SAMPLE_SUBMISSION.role);
    setGithubUrl(DEFAULT_SAMPLE_SUBMISSION.githubUrl);
    setDemoVideoUrl(DEFAULT_SAMPLE_SUBMISSION.demoVideoUrl);
    setCodeArtifacts(DEFAULT_SAMPLE_SUBMISSION.codeArtifacts);
    setSchemaSql(DEFAULT_SAMPLE_SUBMISSION.schemaSql);
    setEngineeringNotes(DEFAULT_SAMPLE_SUBMISSION.engineeringNotes);
    setError(null);
  };

  const clearForm = () => {
    setCandidateName('');
    setRole('Full Stack Developer');
    setGithubUrl('');
    setDemoVideoUrl('');
    setCodeArtifacts('');
    setSchemaSql('');
    setEngineeringNotes('');
    setEvaluatorNotes('');
    setCurrentEvaluation(null);
    setError(null);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveHistoryList(savedHistory.filter((item) => item.id !== id));
  };

  const exportMarkdown = () => {
    if (!currentEvaluation) return;
    const md = `# TECHNICAL ASSESSMENT EVALUATION REPORT
**Candidate:** ${currentEvaluation.candidateName}
**Position:** ${currentEvaluation.role}
**Evaluation Date:** ${currentEvaluation.submissionDate}
**Overall Score:** ${currentEvaluation.overallScore} / 100
**Hiring Recommendation:** ${currentEvaluation.recommendation.replace('_', ' ')}

---

## 📌 Executive Summary
${currentEvaluation.executiveSummary}

---

## 🛡️ Security & Multi-Tenancy Audit
- **Tenant Data Isolation:** ${currentEvaluation.securityAudit.tenantIsolationPassed ? 'PASSED (Protected against cross-tenant leaks)' : 'FAILED (Risk of cross-tenant exposure)'}
- **JWT & RBAC Authorization:** ${currentEvaluation.securityAudit.jwtRbacPassed ? 'PASSED' : 'FAILED'}
- **SQL Injection Prevention:** ${currentEvaluation.securityAudit.sqlInjectionSafe ? 'PASSED (Parameterized queries enforced)' : 'FAILED'}

${currentEvaluation.securityAudit.criticalVulnerabilities.length > 0 ? `### Critical Security Vulnerabilities:\n${currentEvaluation.securityAudit.criticalVulnerabilities.map(v => `- ${v}`).join('\n')}` : 'No critical vulnerabilities flagged.'}

---

## 📊 Detailed Rubric Scoring
${currentEvaluation.scores.map(s => `### ${s.dimension}: ${s.awardedScore} / ${s.maxScore} (${s.status.toUpperCase()})
${s.feedback}
`).join('\n')}

---

## 💡 Key Strengths
${currentEvaluation.keyStrengths.map(s => `- ${s}`).join('\n')}

## ⚠️ Critical Deficiencies & Code Smells
${currentEvaluation.criticalDeficiencies.map(d => `- ${d}`).join('\n')}

---

## 🎯 Recommended Technical Interview Questions
${currentEvaluation.interviewQuestions.map((q, idx) => `${idx + 1}. ${q}`).join('\n')}
`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Evaluation_${currentEvaluation.candidateName.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getRecommendationBadge = (rec: string) => {
    switch (rec) {
      case 'STRONG_HIRE':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'HIRE':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'LEANING_HIRE':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'NO_HIRE':
      default:
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-white tracking-tight">
                Deep Trace Cybernetics • Assessor Portal
              </h1>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                Evaluation Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Technical Candidate Scoring, Security Audit & Rubric Evaluation
            </p>
          </div>
        </div>

        {/* Gemini API Key Configuration */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 shadow-inner">
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <input
              type="password"
              placeholder="Paste Gemini API Key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-slate-200 placeholder-slate-500 w-52 font-mono"
            />
            {apiKey ? (
              <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Ready
              </span>
            ) : (
              <span className="text-[11px] font-medium text-rose-400 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Key Missing
              </span>
            )}
          </div>

          <button
            onClick={loadSample}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
            title="Load Deep Trace Full Stack sample submission"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Sample Submission
          </button>
        </div>
      </header>

      {/* API Key Missing Notice */}
      {!apiKey && (
        <div className="bg-amber-950/40 border-b border-amber-800/50 px-6 py-2.5 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Evaluator Mode Active:</strong> Live Gemini evaluation requires a valid Gemini API Key. Paste your key in the header bar above or set <code>GEMINI_API_KEY</code> in <code>.env.local</code>.
            </span>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column: Candidate Submission & Rubrics Input */}
        <div className="xl:col-span-6 flex flex-col gap-5">
          {/* Candidate Profile Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-cyan-400" /> Candidate & Submission Overview
              </h2>
              <button
                onClick={clearForm}
                className="text-[11px] text-slate-400 hover:text-rose-400 transition cursor-pointer"
              >
                Clear Form
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Candidate Name *
                </label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Position / Assessment Role
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Full Stack Developer"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  GitHub Repository Link
                </label>
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <input
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/..."
                    className="w-full bg-transparent border-none outline-none text-xs text-slate-100"
                  />
                  {githubUrl && (
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-400 hover:text-cyan-400"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Demo Video Link (Google Drive / Loom)
                </label>
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <input
                    type="url"
                    value={demoVideoUrl}
                    onChange={(e) => setDemoVideoUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full bg-transparent border-none outline-none text-xs text-slate-100"
                  />
                  {demoVideoUrl && (
                    <a
                      href={demoVideoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-400 hover:text-cyan-400"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Submission Code Artifacts */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Lock className="w-4 h-4 text-cyan-400" />
                Backend Controllers, Auth & Tenant Isolation Code
              </label>
              <span className="text-[11px] text-slate-400">JavaScript / TypeScript</span>
            </div>
            <textarea
              rows={8}
              value={codeArtifacts}
              onChange={(e) => setCodeArtifacts(e.target.value)}
              placeholder="Paste candidate auth middleware, campaign controller, and RBAC implementation..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 resize-y leading-relaxed"
            />
          </div>

          {/* SQL Schema & Migration */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                SQL Schema, Foreign Keys & Table Definitions
              </label>
              <span className="text-[11px] text-slate-400">PostgreSQL / MySQL</span>
            </div>
            <textarea
              rows={6}
              value={schemaSql}
              onChange={(e) => setSchemaSql(e.target.value)}
              placeholder="Paste database schema, foreign keys, constraints, and indexes..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 resize-y leading-relaxed"
            />
          </div>

          {/* Candidate Engineering Notes & Scaling Answers */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-400" />
                Engineering Notes & Architectural Answers
              </label>
              <span className="text-[11px] text-slate-400">Scale to 1k tenants, JWT revocation, 500 debugging</span>
            </div>
            <textarea
              rows={5}
              value={engineeringNotes}
              onChange={(e) => setEngineeringNotes(e.target.value)}
              placeholder="Paste answers to mandatory scaling and operational questions from candidate's README..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-purple-500 resize-y leading-relaxed"
            />
          </div>

          {/* Evaluator Notes & Action Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-400" /> Evaluator Pre-Assessment Notes (Optional)
              </label>
              <input
                type="text"
                value={evaluatorNotes}
                onChange={(e) => setEvaluatorNotes(e.target.value)}
                placeholder="e.g. Check specifically if campaign assignment API verifies user belongs to same tenant."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleEvaluate}
              disabled={loading || !apiKey.trim()}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Running AI Evaluation Engine (Gemini 2.5 Flash)...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" /> Run Technical Assessment Evaluation
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Evaluation Scorecard & Saved Reviews */}
        <div className="xl:col-span-6 flex flex-col gap-5">
          {/* Main Assessment Scorecard */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col flex-1">
            <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-400" /> Technical Evaluation Scorecard
                </h2>
                <p className="text-xs text-slate-400">
                  {currentEvaluation
                    ? `Graded for ${currentEvaluation.candidateName} • ${currentEvaluation.submissionDate}`
                    : 'Awaiting submission evaluation'}
                </p>
              </div>

              {currentEvaluation && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportMarkdown}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                    title="Export Markdown Report"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Report
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(currentEvaluation.executiveSummary);
                      alert('Executive summary copied to clipboard!');
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center gap-1 transition cursor-pointer"
                    title="Copy Summary"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {currentEvaluation ? (
              <div className="mt-5 space-y-6 overflow-y-auto">
                {/* Score & Verdict Banner */}
                <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-cyan-300">
                        {currentEvaluation.overallScore}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">/100</span>
                    </div>
                    <div>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getRecommendationBadge(
                          currentEvaluation.recommendation
                        )}`}
                      >
                        {currentEvaluation.recommendation.replace('_', ' ')}
                      </span>
                      <p className="text-xs text-slate-300 font-medium mt-1.5">
                        {currentEvaluation.candidateName} ({currentEvaluation.role})
                      </p>
                    </div>
                  </div>

                  {/* Security Highlights */}
                  <div className="flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      {currentEvaluation.securityAudit.tenantIsolationPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="text-slate-300">
                        Tenant Data Isolation:{' '}
                        <strong>
                          {currentEvaluation.securityAudit.tenantIsolationPassed ? 'PASSED' : 'LEAK DETECTED'}
                        </strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {currentEvaluation.securityAudit.sqlInjectionSafe ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="text-slate-300">
                        SQL Injection Guard:{' '}
                        <strong>
                          {currentEvaluation.securityAudit.sqlInjectionSafe ? 'SECURE' : 'VULNERABLE'}
                        </strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {currentEvaluation.securityAudit.jwtRbacPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="text-slate-300">
                        JWT & RBAC Check:{' '}
                        <strong>
                          {currentEvaluation.securityAudit.jwtRbacPassed ? 'VALIDATED' : 'ISSUES'}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" /> Executive Evaluation Summary
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {currentEvaluation.executiveSummary}
                  </p>
                </div>

                {/* Rubric Dimension Scores */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" /> Detailed Rubric Breakdown
                  </h3>
                  <div className="grid grid-cols-1 gap-2.5">
                    {currentEvaluation.scores.map((score, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-200">
                            {score.dimension}
                          </span>
                          <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded">
                            {score.awardedScore} / {score.maxScore} pts
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{score.feedback}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strengths & Deficiencies Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/40">
                    <h4 className="text-xs font-semibold text-emerald-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Key Strengths
                    </h4>
                    <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                      {currentEvaluation.keyStrengths.map((str, idx) => (
                        <li key={idx} className="leading-snug">
                          {str}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/40">
                    <h4 className="text-xs font-semibold text-rose-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Deficiencies & Risks
                    </h4>
                    <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                      {currentEvaluation.criticalDeficiencies.map((def, idx) => (
                        <li key={idx} className="leading-snug">
                          {def}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Follow-up Interview Questions */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-purple-400" /> Tailored Follow-up Technical Questions
                  </h4>
                  <div className="space-y-2">
                    {currentEvaluation.interviewQuestions.map((q, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-slate-300 bg-slate-900/60 border border-slate-800 p-2.5 rounded-lg flex items-start gap-2"
                      >
                        <span className="font-mono text-purple-400 font-semibold shrink-0">
                          Q{idx + 1}:
                        </span>
                        <span>{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 text-slate-500">
                <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-8 h-8 text-slate-700" />
                </div>
                <h3 className="text-sm font-semibold text-slate-300">No Assessment Graded Yet</h3>
                <p className="text-xs text-slate-500 max-w-md mt-1 mb-4 leading-relaxed">
                  Enter candidate submission details or click "Sample Submission" on the top right, verify your Gemini API Key, and click "Run Technical Assessment Evaluation".
                </p>
                <button
                  onClick={loadSample}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Load Sample Deep Trace Submission
                </button>
              </div>
            )}
          </div>

          {/* Past Evaluated Candidates History */}
          {savedHistory.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" /> Candidate Evaluation History ({savedHistory.length})
                </h3>
                <button
                  onClick={() => saveHistoryList([])}
                  className="text-[11px] text-slate-500 hover:text-rose-400 transition cursor-pointer"
                >
                  Clear History
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {savedHistory.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setCurrentEvaluation(item.result)}
                    className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-cyan-500/50 transition flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-950/50 border border-cyan-800/40 flex items-center justify-center font-mono font-bold text-xs text-cyan-300">
                        {item.score}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition">
                          {item.candidateName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {item.role} • {item.timestamp}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getRecommendationBadge(
                          item.recommendation
                        )}`}
                      >
                        {item.recommendation.replace('_', ' ')}
                      </span>
                      <button
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        className="text-slate-600 hover:text-rose-400 p-1 transition"
                        title="Delete candidate review"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

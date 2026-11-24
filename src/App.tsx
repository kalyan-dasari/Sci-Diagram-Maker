import { useState, useEffect } from 'react';
import initialResults from './data/results.json';
import { generateDiagramForConcept } from './utils/geminiGenerator';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Play,
  Key,
  Maximize2,
  Code2,
  AlertTriangle,
  Download,
  ChevronDown,
  X
} from 'lucide-react';

interface ReviewState {
  status: 'approved' | 'rejected' | 'pending';
  notes: string;
}

interface ConceptItem {
  id: number;
  concept: string;
  subject: string;
  promptText: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  retries: number;
  checks: {
    check_1: { name: string; passed: boolean; message: string };
    check_2: { name: string; passed: boolean; message: string };
    check_3: { name: string; passed: boolean; message: string };
    check_4: { name: string; passed: boolean; message: string };
    check_5: { name: string; passed: boolean; message: string };
  };
  svg: string;
}

export default function App() {
  const envKey = (process.env.GEMINI_API_KEY as string) || '';
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('udhi_gemini_api_key') || envKey;
  });

  // Table rows: Loaded directly from results.json on initial load (0 API calls needed)
  const [concepts, setConcepts] = useState<ConceptItem[]>(initialResults as ConceptItem[]);

    // Persistent Reviews (Approve/Reject + Notes) stored in Browser localStorage
    const [reviews, setReviews] = useState<Record<number, ReviewState>>(() => {
      try {
        const stored = localStorage.getItem('evaluation_history');
        return stored ? JSON.parse(stored) : [];
        const stored = localStorage.getItem('udhi_diagram_reviews');
        if (stored) return JSON.parse(stored);
      } catch {
        return [];
        // fallback
      }
      return {
        1: { status: 'pending', notes: '' },
        2: { status: 'pending', notes: '' },
        3: { status: 'pending', notes: '' },
        4: { status: 'pending', notes: '' },
        5: { status: 'pending', notes: '' }
      };
    });

    // Live Generator State
    const [selectedConceptId, setSelectedConceptId] = useState<number>(1);
    const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [progressStatus, setProgressStatus] = useState<string>('');
    const [genError, setGenError] = useState<string | null>(null);

    // Modal inspection state
    const [expandedItem, setExpandedItem] = useState<ConceptItem | null>(null);
    const [showSourceCode, setShowSourceCode] = useState<boolean>(false);
    const [activeCheckTooltip, setActiveCheckTooltip] = useState<{ name: string; message: string; passed: boolean } | null>(null);

    // Sync API Key to localStorage
    useEffect(() => {
      if (apiKey) {
        localStorage.setItem('gemini_eval_api_key', apiKey);
        localStorage.setItem('udhi_gemini_api_key', apiKey);
      }
    }, [apiKey]);

    const saveHistoryList = (list: SavedEvaluation[]) => {
      setSavedHistory(list);
      localStorage.setItem('evaluation_history', JSON.stringify(list));
      // Sync Reviews to localStorage
      const updateReview = (id: number, status: 'approved' | 'rejected' | 'pending', notes?: string) => {
        setReviews((prev) => {
          const updated = {
            ...prev,
            [id]: {
              status,
              notes: notes !== undefined ? notes : prev[id]?.notes || ''
            }
          };
          localStorage.setItem('udhi_diagram_reviews', JSON.stringify(updated));
          return updated;
        });
      };

      const handleEvaluate = async () => {
        const updateReviewNotes = (id: number, notes: string) => {
          setReviews((prev) => {
            const updated = {
              ...prev,
              [id]: {
                status: prev[id]?.status || 'pending',
                notes
              }
            };
            localStorage.setItem('udhi_diagram_reviews', JSON.stringify(updated));
            return updated;
          });
        };

        // Run Part A Live for a specific concept
        const handleLiveGenerate = async () => {
          if (!apiKey.trim()) {
            setError('Gemini API Key is required. Please enter a valid API key in the header.');
            setGenError('Please provide a valid Gemini API Key in the top header to run live generation.');
            return;
          }

          if (!candidateName.trim() || !codeArtifacts.trim()) {
            setError('Please provide candidate name and submission code/artifacts to evaluate.');
            return;
          }
          const targetConcept = concepts.find((c) => c.id === selectedConceptId);
          if (!targetConcept) return;

          setLoading(true);
          setError(null);
          setIsGenerating(true);
          setGenError(null);
          setProgressStatus(`Initiating live generation for "${targetConcept.concept}"...`);

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
            const result = await generateDiagramForConcept(
              apiKey.trim(),
              targetConcept.concept,
              targetConcept.promptText,
              selectedModel,
              (status) => setProgressStatus(status)
            );

            const rawText = response.text || '';
            let parsedData: any;
            try {
              parsedData = JSON.parse(rawText);
            } catch {
              // Fallback sanitize if markdown fences were included
              const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
              parsedData = JSON.parse(cleaned);
            }
            // Update state in table
            setConcepts((prev) =>
              prev.map((item) => {
                if (item.id === targetConcept.id) {
                  return {
                    ...item,
                    modelName: result.modelName,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    estimatedCostUsd: result.estimatedCostUsd,
                    retries: result.retries,
                    checks: {
                      check_1: result.validation.checks.validXml,
                      check_2: result.validation.checks.viewBoxBounds,
                      check_3: result.validation.checks.labelsAndTitle,
                      check_4: result.validation.checks.animation,
                      check_5: result.validation.checks.educationalClarity
                    },
                    svg: result.svg
                  };
                }
                return item;
              })
            );

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
            setProgressStatus('Live generation completed and validated!');
            setTimeout(() => setProgressStatus(''), 4000);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(`Gemini Evaluation Failed: ${msg}`);
            setGenError(`Live Generation Error: ${msg}`);
            setProgressStatus('');
          } finally {
            setLoading(false);
            setIsGenerating(false);
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
        // Export current results and reviews
        const exportSubmissionJson = () => {
          const combined = concepts.map((c) => ({
            ...c,
            reviewerStatus: reviews[c.id]?.status || 'pending',
            reviewerNotes: reviews[c.id]?.notes || ''
          }));

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
            const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Evaluation_${currentEvaluation.candidateName.replace(/\s+/g, '_')}.md`;
            a.download = 'udhi_science_diagrams_results.json';
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
          const totalCost = concepts.reduce((sum, item) => sum + item.estimatedCostUsd, 0);
          const approvedCount = Object.values(reviews).filter((r) => r.status === 'approved').length;
          const rejectedCount = Object.values(reviews).filter((r) => r.status === 'rejected').length;

          return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
              {/* Top Navigation Bar */}
              <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
                {/* Top Banner / Header */}
                <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                      <ShieldCheck className="w-5 h-5 text-white" />
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h1 className="font-bold text-base text-white tracking-tight">
                            Deep Trace Cybernetics • Assessor Portal
                            UDHI TECHNOLOGIES • Science Diagram Maker
                          </h1>
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                            Evaluation Engine
                            UK GCSE Video Lessons
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Technical Candidate Scoring, Security Audit & Rubric Evaluation
                          Automated AI SVG generation, 5-point code validation, and reviewer approval workflow
                        </p>
                      </div>
                    </div>

                    {/* Gemini API Key Configuration */}
                    <div className="flex items-center gap-3">
                      {/* Global Stats & API Key Control */}
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Quick Metrics */}
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                            Total Cost: <strong className="text-cyan-400">${totalCost.toFixed(6)}</strong>
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-300">
                            Approved: {approvedCount}/5
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300">
                            Rejected: {rejectedCount}/5
                          </span>
                        </div>

                        {/* Gemini API Key Bar */}
                        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 shadow-inner">
                          <Key className="w-3.5 h-3.5 text-amber-400" />
                          <input
                            type="password"
                            placeholder="Paste Gemini API Key..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="bg-transparent border-none outline-none text-xs text-slate-200 placeholder-slate-500 w-52 font-mono"
                            className="bg-transparent border-none outline-none text-xs text-slate-200 placeholder-slate-500 w-48 font-mono"
                          />
                          {apiKey ? (
                            <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          ) : (
              <span className="text-[11px] font-medium text-rose-400 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Key Missing
              <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1" title="Saved results already load without key. Key only needed for live test generation.">
                Saved Results Mode
              </span>
            )}
          </div>

          <button
            onClick={loadSample}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
            title="Load Deep Trace Full Stack sample submission"
            onClick={exportSubmissionJson}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            title="Export results.json with reviewer decisions"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Sample Submission
            <Download className="w-3.5 h-3.5" /> Export JSON
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
                                {/* Live Testing Control Panel (Part B: Live Generate for one concept) */}
                                <section className="bg-slate-900/60 border-b border-slate-800/80 px-6 py-4">
                                  <div className="max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                      <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                        <Play className="w-4 h-4 fill-cyan-400" />
                                      </div>
                                      <div>
                                        <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                                          Live Test Generator (Part A Live Evaluation)
                                        </h2>
                                        <button
                                          onClick={clearForm}
                                          className="text-[11px] text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                        >
                                          Clear Form
                                        </button>
                                        <p className="text-[11px] text-slate-400">
                                          Execute live prompt generation, 5-point code checks, and automatic single repair retry.
                                        </p>
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
                                        <div className="flex flex-wrap items-center gap-3">
                                          {/* Concept Selector */}
                                          <div className="relative">
                                            <select
                                              value={selectedConceptId}
                                              onChange={(e) => setSelectedConceptId(Number(e.target.value))}
                                              disabled={isGenerating}
                                              className="appearance-none bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 pr-8 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer disabled:opacity-50"
                                            >
                                              {concepts.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                  Concept {c.id}: {c.concept} ({c.subject})
                                                </option>
                                              ))}
                                            </select>
                                            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
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
                                            {/* Model Selector */}
                                            <div className="relative">
                                              <select
                                                value={selectedModel}
                                                onChange={(e) => setSelectedModel(e.target.value)}
                                                disabled={isGenerating}
                                                className="appearance-none bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 pr-8 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer disabled:opacity-50 font-mono"
                                              >
                                                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                                                <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (Free Tier)</option>
                                                <option value="gemini-1.5-flash">gemini-1.5-flash (Fallback)</option>
                                              </select>
                                              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
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

                                            {/* Trigger Button */}
                                            <button
                                              onClick={handleEvaluate}
                                              disabled={loading || !apiKey.trim()}
                                              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                              onClick={handleLiveGenerate}
                                              disabled={isGenerating || !apiKey.trim()}
                                              className="py-1.5 px-4 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-md shadow-cyan-500/20 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                            >
                                              {loading ? (
                                                {
                                                  isGenerating?(
                <>
                                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Running AI Evaluation Engine (Gemini 2.5 Flash)...
                                              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                              Generating & Validating...
                                            </>
                                            ) : (
                                            <>
                                              <Play className="w-4 h-4 fill-white" /> Run Technical Assessment Evaluation
                                              <Play className="w-3.5 h-3.5 fill-white" /> Generate Live Diagram
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
                                            {/* Live Feedback Toast */}
                                            {progressStatus && (
                                              <div className="max-w-[1700px] mx-auto mt-3 p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/40 text-cyan-200 text-xs flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                                                <span>{progressStatus}</span>
                                              </div>
                                            )}

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
                                            {/* Error Toast */}
                                            {genError && (
                                              <div className="max-w-[1700px] mx-auto mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                                                  <span>{genError}</span>
                                                </div>
                                                <button
                                                  onClick={() => setGenError(null)}
                                                  className="text-rose-400 hover:text-white"
                                                >
                                                  <X className="w-4 h-4" />
                                                </button>
                                              </div>
                                            )}
                                          </section>

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
                                                {/* Main Content Area: 5-Row Concept Table */}
                                                <main className="flex-1 max-w-[1700px] w-full mx-auto p-6 flex flex-col gap-6">
                                                  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                                                    <div className="overflow-x-auto">
                                                      <table className="w-full text-left border-collapse">
                                                        <thead>
                                                          <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[11px] uppercase tracking-wider">
                                                            <th className="py-3.5 px-4 font-semibold w-12 text-center">#</th>
                                                            <th className="py-3.5 px-4 font-semibold w-64">Concept & Subject</th>
                                                            <th className="py-3.5 px-4 font-semibold w-72">Animated SVG Diagram</th>
                                                            <th className="py-3.5 px-4 font-semibold min-w-[280px]">Automated Code Checks (5 Criteria)</th>
                                                            <th className="py-3.5 px-4 font-semibold w-48">Cost & Retries</th>
                                                            <th className="py-3.5 px-4 font-semibold min-w-[320px]">Reviewer Decision (Persisted)</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-800/70 text-xs">
                                                          {concepts.map((item) => {
                                                            const review = reviews[item.id] || { status: 'pending', notes: '' };
                                                            const isApproved = review.status === 'approved';
                                                            const isRejected = review.status === 'rejected';

                                                            {/* Security Highlights */ }
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
                                                              return (
                                                              <tr
                                                                key={item.id}
                                                                className={`hover:bg-slate-900/50 transition-colors ${isApproved
                                                                    ? 'bg-emerald-950/10'
                                                                    : isRejected
                                                                      ? 'bg-rose-950/10'
                                                                      : ''
                                                                  }`}
                                                              >
                                                                {/* Column 1: Index */}
                                                                <td className="py-4 px-4 font-mono text-center font-bold text-slate-500">
                                                                  {item.id}
                                                                </td>

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
                                                                {/* Column 2: Concept & Subject */}
                                                                <td className="py-4 px-4">
                                                                  <div className="flex flex-col gap-1">
                                                                    <div className="flex items-center gap-2">
                                                                      <span className="font-bold text-slate-100 text-sm">
                                                                        {item.concept}
                                                                      </span>
                                                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                                                                        {item.subject}
                                                                      </span>
                                                                    </div>
                                                                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                                                                      {item.promptText}
                                                                    </p>
                                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                                      Model: {item.modelName}
                                                                    </span>
                                                                  </div>
                                                                </td>

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
                                                        {/* Column 3: Animated SVG Diagram */}
                                                        <td className="py-4 px-4">
                                                          <div className="relative group w-64 h-40 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-inner flex items-center justify-center p-1">
                                                            <div
                                                              className="w-full h-full flex items-center justify-center pointer-events-none"
                                                              dangerouslySetInnerHTML={{ __html: item.svg }}
                                                            />
                                                            <button
                                                              onClick={() => {
                                                                setExpandedItem(item);
                                                                setShowSourceCode(false);
                                                              }}
                                                              className="absolute bottom-2 right-2 p-1.5 bg-slate-900/90 text-slate-300 hover:text-white rounded-lg border border-slate-700 opacity-0 group-hover:opacity-100 transition shadow-lg flex items-center gap-1 text-[10px] cursor-pointer"
                                                              title="Expand full screen animated preview"
                                                            >
                                                              <Maximize2 className="w-3.5 h-3.5" /> View
                                                            </button>
                                                          </div>
                                                        </td>

                                                        {/* Executive Summary */}
                                                        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                                                          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                            <FileText className="w-3.5 h-3.5 text-cyan-400" /> Executive Evaluation Summary
                                                          </h3>
                                                          <p className="text-xs text-slate-300 leading-relaxed">
                                                            {currentEvaluation.executiveSummary}
                                                          </p>
                                                        </div>
                                                        {/* Column 4: 5 Automated Code Checks */}
                                                        <td className="py-4 px-4">
                                                          <div className="flex flex-col gap-1.5">
                                                            {Object.entries(item.checks).map(([key, check]) => (
                                                              <div
                                                                key={key}
                                                                onClick={() => setActiveCheckTooltip({ name: check.name, message: check.message, passed: check.passed })}
                                                                className={`flex items-center justify-between px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer transition ${check.passed
                                                                    ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-300 hover:border-emerald-600'
                                                                    : 'bg-rose-950/30 border-rose-900/40 text-rose-300 hover:border-rose-600'
                                                                  }`}
                                                                title={check.message}
                                                              >
                                                                <span className="flex items-center gap-1.5 font-medium">
                                                                  {check.passed ? (
                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                                                  ) : (
                                                                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                                                  )}
                                                                  {check.name}
                                                                </span>
                                                                <span className="text-[10px] font-mono font-bold uppercase ml-2 opacity-80">
                                                                  {check.passed ? 'PASS' : 'FAIL'}
                                                                </span>
                                                              </div>
                                                            ))}
                                                          </div>
                                                        </td>

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
                                                                  {/* Column 5: Cost & Retries */}
                                                                  <td className="py-4 px-4 font-mono">
                                                                    <div className="flex flex-col gap-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-[11px]">
                                                                      <div className="flex justify-between items-center text-slate-300">
                                                                        <span>Cost:</span>
                                                                        <strong className="text-cyan-400">
                                                                          ${item.estimatedCostUsd.toFixed(6)}
                                                                        </strong>
                                                                      </div>
                                                                      <div className="flex justify-between items-center text-slate-400">
                                                                        <span>Retries:</span>
                                                                        <span className={item.retries > 0 ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                                                                          {item.retries}
                                                                        </span>
                                                                      </div>
                                                                      <div className="flex justify-between items-center text-slate-500 text-[10px] border-t border-slate-800 pt-1 mt-1">
                                                                        <span>Tokens:</span>
                                                                        <span>{item.inputTokens}in / {item.outputTokens}out</span>
                                                                      </div>
                                                                    </div>
                                                                    <p className="text-xs text-slate-400 leading-relaxed">{score.feedback}</p>
                                                                </div>
                    ))}
                                                              </div>
                </div>
                                                        </td>

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
                                                          {/* Column 6: Reviewer Decision (Approve/Reject + Persistent Note Box) */}
                                                          <td className="py-4 px-4">
                                                            <div className="flex flex-col gap-2.5">
                                                              {/* Approve / Reject Buttons */}
                                                              <div className="flex items-center gap-2">
                                                                <button
                                                                  onClick={() =>
                                                                    updateReview(item.id, isApproved ? 'pending' : 'approved')
                                                                  }
                                                                  className={`flex-1 py-1.5 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition border cursor-pointer ${isApproved
                                                                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30 font-bold'
                                                                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-800'
                                                                    }`}
                                                                >
                                                                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                                                                </button>

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
                                                              <button
                                                                onClick={() =>
                                                                  updateReview(item.id, isRejected ? 'pending' : 'rejected')
                                                                }
                                                                className={`flex-1 py-1.5 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition border cursor-pointer ${isRejected
                                                                    ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30 font-bold'
                                                                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-800'
                                                                  }`}
                                                              >
                                                                <XCircle className="w-3.5 h-3.5" /> Reject
                                                              </button>
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
                                                            {/* Persistent Reviewer Note Box */}
                                                            <div className="relative">
                                                              <input
                                                                type="text"
                                                                value={review.notes}
                                                                onChange={(e) => updateReviewNotes(item.id, e.target.value)}
                                                                placeholder="Reviewer notes (persisted in browser)..."
                                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
                                                              />
                                                              {review.status !== 'pending' && (
                                                                <span className="absolute right-2 top-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                                                  Saved
                                                                </span>
                                                              )}
                                                            </div>
                                                        </div>
                                                      </td>
                                                    </tr>
                                                    );
                })}
                                                  </tbody>
                                                </table>
                                              </div>
                                            </div>
      </main>

                                        {/* Check Detail Tooltip / Modal */}
                                        {activeCheckTooltip && (
                                          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
                                              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                                                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                                                  {activeCheckTooltip.passed ? (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                  ) : (
                                                    <XCircle className="w-4 h-4 text-rose-400" />
                                                  )}
                                                  {activeCheckTooltip.name}
                                                </h3>
                                                <button
                                                  onClick={() => setActiveCheckTooltip(null)}
                                                  className="text-slate-400 hover:text-white"
                                                >
                                                  <X className="w-4 h-4" />
                                                </button>
                                              </div>
                                              <p className="mt-3 text-xs text-slate-300 leading-relaxed font-mono bg-slate-950 p-3 rounded-xl border border-slate-800">
                                                {activeCheckTooltip.message}
                                              </p>
                                              <button
                                                onClick={() => setActiveCheckTooltip(null)}
                                                className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition"
                                              >
                                                Close
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* Expanded Animated SVG Modal */}
                                        {expandedItem && (
                                          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
                                            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
                                              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                                                <div>
                                                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                                                    Concept {expandedItem.id}: {expandedItem.concept}
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                                                      {expandedItem.subject}
                                                    </span>
                                                  </h3>
                                                  <p className="text-xs text-slate-400 mt-0.5">{expandedItem.promptText}</p>
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

                                                  <div className="flex items-center gap-2">
                                                    <button
                                                      onClick={loadSample}
                                                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
                                                      onClick={() => setShowSourceCode(!showSourceCode)}
                                                      className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
                                                    >
                                                      <RotateCcw className="w-3 h-3" /> Load Sample Deep Trace Submission
                                                      <Code2 className="w-3.5 h-3.5" />
                                                      {showSourceCode ? 'Show Render' : 'View SVG Code'}
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
                  onClick={() => setExpandedItem(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  Clear History
                  <X className="w-5 h-5" />
                </button>
              </div>
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
            <div className="flex-1 p-6 overflow-auto bg-slate-950 flex items-center justify-center">
              {showSourceCode ? (
                <pre className="w-full text-xs font-mono text-cyan-300 bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {expandedItem.svg}
                </pre>
              ) : (
                <div
                  className="w-full max-w-3xl aspect-[16/10] bg-slate-950 rounded-xl overflow-hidden shadow-2xl flex items-center justify-center border border-slate-800"
                  dangerouslySetInnerHTML={{ __html: expandedItem.svg }}
                />
              )}
            </div>
                                                )}
                                              </div>
                                            </div>
                                          </main>
                                        )}
                                      </div>
                                      );
}

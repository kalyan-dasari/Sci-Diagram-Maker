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

type ReviewsMap = Record<number, ReviewState>;

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
  const [reviews, setReviews] = useState<ReviewsMap>(() => {
    try {
      const stored = localStorage.getItem('udhi_diagram_reviews');
      if (stored) return JSON.parse(stored);
    } catch {
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
      localStorage.setItem('udhi_gemini_api_key', apiKey);
    }
  }, [apiKey]);

  // Sync Reviews to localStorage
  const updateReview = (id: number, status: 'approved' | 'rejected' | 'pending') => {
    setReviews((prev) => {
      const updated: ReviewsMap = {
        ...prev,
        [id]: {
          status,
          notes: prev[id]?.notes || ''
        }
      };
      localStorage.setItem('udhi_diagram_reviews', JSON.stringify(updated));
      return updated;
    });
  };

  const updateReviewNotes = (id: number, notes: string) => {
    setReviews((prev) => {
      const updated: ReviewsMap = {
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
      setGenError('Please provide a valid Gemini API Key in the top header to run live generation.');
      return;
    }

    const targetConcept = concepts.find((c) => c.id === selectedConceptId);
    if (!targetConcept) return;

    setIsGenerating(true);
    setGenError(null);
    setProgressStatus(`Initiating live generation for "${targetConcept.concept}"...`);

    try {
      const result = await generateDiagramForConcept(
        apiKey.trim(),
        targetConcept.concept,
        targetConcept.promptText,
        selectedModel,
        (status) => setProgressStatus(status)
      );

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

      setProgressStatus('Live generation completed and validated!');
      setTimeout(() => setProgressStatus(''), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGenError(`Live Generation Error: ${msg}`);
      setProgressStatus('');
    } finally {
      setIsGenerating(false);
    }
  };

  // Export current results and reviews
  const exportSubmissionJson = () => {
    const combined = concepts.map((c) => ({
      ...c,
      reviewerStatus: reviews[c.id]?.status || 'pending',
      reviewerNotes: reviews[c.id]?.notes || ''
    }));

    const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'udhi_science_diagrams_results.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalCost = concepts.reduce((sum, item) => sum + item.estimatedCostUsd, 0);
  const approvedCount = Object.values(reviews).filter((r) => r.status === 'approved').length;
  const rejectedCount = Object.values(reviews).filter((r) => r.status === 'rejected').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Banner / Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-white tracking-tight">
                UDHI TECHNOLOGIES • Science Diagram Maker
              </h1>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                UK GCSE Video Lessons
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Automated AI SVG generation, 5-point code validation, and reviewer approval workflow
            </p>
          </div>
        </div>

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
              className="bg-transparent border-none outline-none text-xs text-slate-200 placeholder-slate-500 w-48 font-mono"
            />
            {apiKey ? (
              <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Ready
              </span>
            ) : (
              <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1" title="Saved results already load without key. Key only needed for live test generation.">
                Saved Results Mode
              </span>
            )}
          </div>

          <button
            onClick={exportSubmissionJson}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            title="Export results.json with reviewer decisions"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
        </div>
      </header>

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
              <p className="text-[11px] text-slate-400">
                Execute live prompt generation, 5-point code checks, and automatic single repair retry.
              </p>
            </div>
          </div>

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

            {/* Trigger Button */}
            <button
              onClick={handleLiveGenerate}
              disabled={isGenerating || !apiKey.trim()}
              className="py-1.5 px-4 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-md shadow-cyan-500/20 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Generating & Validating...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white" /> Generate Live Diagram
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Feedback Toast */}
        {progressStatus && (
          <div className="max-w-[1700px] mx-auto mt-3 p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/40 text-cyan-200 text-xs flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>{progressStatus}</span>
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

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-900/50 transition-colors ${
                        isApproved
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

                      {/* Column 4: 5 Automated Code Checks */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1.5">
                          {Object.entries(item.checks).map(([key, check]) => (
                            <div
                              key={key}
                              onClick={() => setActiveCheckTooltip({ name: check.name, message: check.message, passed: check.passed })}
                              className={`flex items-center justify-between px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer transition ${
                                check.passed
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
                      </td>

                      {/* Column 6: Reviewer Decision (Approve/Reject + Persistent Note Box) */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-2.5">
                          {/* Approve / Reject Buttons */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                updateReview(item.id, isApproved ? 'pending' : 'approved')
                              }
                              className={`flex-1 py-1.5 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                                isApproved
                                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30 font-bold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-800'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>

                            <button
                              onClick={() =>
                                updateReview(item.id, isRejected ? 'pending' : 'rejected')
                              }
                              className={`flex-1 py-1.5 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                                isRejected
                                  ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30 font-bold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-800'
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
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

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSourceCode(!showSourceCode)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  {showSourceCode ? 'Show Render' : 'View SVG Code'}
                </button>
                <button
                  onClick={() => setExpandedItem(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
          </div>
        </div>
      )}
    </div>
  );
}

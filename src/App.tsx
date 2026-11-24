import { useState } from 'react';
import initialResults from './data/results.json';
import { generateDiagramForConcept } from './utils/geminiGenerator';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Play,
  Maximize2,
  Check,
  X,
  FileCheck2,
  Layers,
  Search,
  Code2,
  AlertTriangle,
  ShieldCheck,
  Zap
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
  // Read Gemini API Key from environment (backend/env variable only, not exposed in UI)
  const envApiKey = (process.env.GEMINI_API_KEY as string) || '';

  // 5 Concepts Preloaded directly from results.json (0 initial API calls needed)
  const [concepts, setConcepts] = useState<ConceptItem[]>(initialResults as ConceptItem[]);

  // Persistent Reviews (Approve/Reject + Reviewer Notes) in localStorage
  const [reviews, setReviews] = useState<ReviewsMap>(() => {
    try {
      const stored = localStorage.getItem('diagram_studio_reviews');
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

  // Navigation & Filter state
  const [activeTab, setActiveTab] = useState<'library' | 'reviews' | 'generate'>('library');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Detail Modal / Drawer state
  const [selectedDiagram, setSelectedDiagram] = useState<ConceptItem | null>(null);
  const [showSvgSource, setShowSvgSource] = useState<boolean>(false);

  // Generation Modal & execution state
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
  const [targetConceptId, setTargetConceptId] = useState<number>(1);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [genSuccessMsg, setGenSuccessMsg] = useState<string | null>(null);
  const [genErrorMsg, setGenErrorMsg] = useState<string | null>(null);

    // Sync Reviewer Decisions to localStorage on change
    const setReviewStatus = (id: number, status: 'approved' | 'rejected' | 'pending') => {
      setReviews((prev) => {
        const current = prev[id] || { status: 'pending', notes: '' };
        // Toggle to pending if clicking same status again
        const newStatus = current.status === status ? 'pending' : status;
        const updated: ReviewsMap = {
          ...prev,
          [id]: {
            status,
            notes: prev[id]?.notes || ''
          ...current,
            status: newStatus
          }
        };
        localStorage.setItem('udhi_diagram_reviews', JSON.stringify(updated));
        localStorage.setItem('diagram_studio_reviews', JSON.stringify(updated));
        return updated;
      });
    };

    const updateReviewNotes = (id: number, notes: string) => {
      const setReviewNotes = (id: number, notes: string) => {
        setReviews((prev) => {
          const current = prev[id] || { status: 'pending', notes: '' };
          const updated: ReviewsMap = {
            ...prev,
            [id]: {
              status: prev[id]?.status || 'pending',
              ...current,
              notes
            }
          };
          localStorage.setItem('udhi_diagram_reviews', JSON.stringify(updated));
          localStorage.setItem('diagram_studio_reviews', JSON.stringify(updated));
          return updated;
        });
      };

      // Run Part A Live for a specific concept
      const handleLiveGenerate = async () => {
        if (!apiKey.trim()) {
          setGenError('Please provide a valid Gemini API Key in the top header to run live generation.');
          // Live generation execution
          const executeGeneration = async () => {
            if (!envApiKey.trim()) {
              setGenErrorMsg(
                'GEMINI_API_KEY is not configured in the environment (.env.local). Please set your API key in the server environment.'
              );
              return;
            }

            const targetConcept = concepts.find((c) => c.id === selectedConceptId);
            if (!targetConcept) return;
            const target = concepts.find((c) => c.id === targetConceptId);
            if (!target) return;

            setIsGenerating(true);
            setGenError(null);
            setProgressStatus(`Initiating live generation for "${targetConcept.concept}"...`);
            setGenErrorMsg(null);
            setGenSuccessMsg(null);
            setProgressMessage(`Initiating generation for "${target.concept}"...`);

            try {
              const result = await generateDiagramForConcept(
                apiKey.trim(),
                targetConcept.concept,
                targetConcept.promptText,
                envApiKey.trim(),
                target.concept,
                target.promptText,
                selectedModel,
                (status) => setProgressStatus(status)
                  (status) => setProgressMessage(status)
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
  // Update state in concepts list
  const updatedItem: ConceptItem = {
    ...target,
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

  setProgressStatus('Live generation completed and validated!');
  setTimeout(() => setProgressStatus(''), 4000);
  setConcepts((prev) => prev.map((item) => (item.id === target.id ? updatedItem : item)));

  if (selectedDiagram && selectedDiagram.id === target.id) {
    setSelectedDiagram(updatedItem);
  }

  setGenSuccessMsg(`Diagram for "${target.concept}" generated and verified!`);
  setProgressMessage('');
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  setGenError(`Live Generation Error: ${msg}`);
  setProgressStatus('');
  setGenErrorMsg(`Generation error: ${msg}`);
  setProgressMessage('');
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
  // Filtered concepts
  const filteredConcepts = concepts.filter((c) => {
    const review = reviews[c.id] || { status: 'pending', notes: '' };
    const matchesStatus =
      statusFilter === 'all'
        ? activeTab === 'reviews'
          ? review.status === 'pending'
          : true
        : review.status === statusFilter;
    const matchesSubject = subjectFilter === 'all' || c.subject.toLowerCase() === subjectFilter.toLowerCase();
    const matchesSearch =
      searchQuery.trim() === '' ||
      c.concept.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.promptText.toLowerCase().includes(searchQuery.toLowerCase());

    const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'udhi_science_diagrams_results.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  return matchesStatus && matchesSubject && matchesSearch;
});

const totalCost = concepts.reduce((sum, item) => sum + item.estimatedCostUsd, 0);
// Overview Counts
const totalCount = concepts.length;
const approvedCount = Object.values(reviews).filter((r) => r.status === 'approved').length;
const pendingCount = Object.values(reviews).filter((r) => r.status === 'pending').length;
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
            <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
              {/* 3. Header: Compact, modern SaaS Header */}
              <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-7xl w-full mx-auto px-6 h-16 flex items-center justify-between gap-6">
                  {/* Logo & Product Name */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                      <Layers className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-slate-400">
                      Automated AI SVG generation, 5-point code validation, and reviewer approval workflow
                    </p>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base tracking-tight text-slate-900">Diagram Studio</span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                          GCSE Education
                        </span>
                      </div>
                    </div>
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
                  {/* Clean Navigation Links */}
                  <nav className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
                    <button
                      onClick={() => {
                        setActiveTab('library');
                        setStatusFilter('all');
                      }}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${activeTab === 'library'
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                          : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      Diagram Library
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('reviews');
                        setStatusFilter('pending');
                      }}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'reviews'
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                          : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      Review Queue
                      {pendingCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center">
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  </nav>

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
                    {/* Action Button */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowGenerateModal(true)}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generate Diagram</span>
                      </button>
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
                    {/* Main Container */}
                    <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
                      {/* 4. Dashboard: Simple, elegant overview metrics */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                          <div>
                            <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                              Live Test Generator (Part A Live Evaluation)
                            </h2>
                            <p className="text-[11px] text-slate-400">
                              Execute live prompt generation, 5-point code checks, and automatic single repair retry.
                            </p>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Diagrams</p>
                            <h2 className="text-2xl font-bold text-slate-900 mt-1">{totalCount}</h2>
                            <p className="text-xs text-slate-500 mt-0.5">5 core UK curriculum concepts</p>
                          </div>
                          <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-600">
                            <FileCheck2 className="w-5 h-5" />
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
                            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                              <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Approved</p>
                                <h2 className="text-2xl font-bold text-emerald-600 mt-1">{approvedCount}</h2>
                                <p className="text-xs text-slate-500 mt-0.5">Ready for video production</p>
                              </div>
                              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                                <CheckCircle2 className="w-5 h-5" />
                              </div>
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
                              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                                <div>
                                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending Review</p>
                                  <h2 className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</h2>
                                  <p className="text-xs text-slate-500 mt-0.5">Awaiting editorial sign-off</p>
                                </div>
                                <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                                  <Clock className="w-5 h-5" />
                                </div>
                              </div>
                            </div>

                            {/* Trigger Button */}
                            {/* Filters and Search Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={handleLiveGenerate}
                                  disabled={isGenerating || !apiKey.trim()}
                                  className="py-1.5 px-4 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-md shadow-cyan-500/20 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                  onClick={() => setStatusFilter('all')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${statusFilter === 'all'
                                      ? 'bg-slate-900 text-white shadow-sm'
                                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                    }`}
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
                                  All Concepts ({totalCount})
                                </button>
                                <button
                                  onClick={() => setStatusFilter('pending')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${statusFilter === 'pending'
                                      ? 'bg-slate-900 text-white shadow-sm'
                                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                  Pending ({pendingCount})
                                </button>
                                <button
                                  onClick={() => setStatusFilter('approved')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${statusFilter === 'approved'
                                      ? 'bg-slate-900 text-white shadow-sm'
                                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                  Approved ({approvedCount})
                                </button>
                                <button
                                  onClick={() => setStatusFilter('rejected')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${statusFilter === 'rejected'
                                      ? 'bg-slate-900 text-white shadow-sm'
                                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                  Rejected ({rejectedCount})
                                </button>
                              </div>
                            </div>

                            {/* Live Feedback Toast */}
                            {progressStatus && (
                              <div className="max-w-[1700px] mx-auto mt-3 p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/40 text-cyan-200 text-xs flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                                <span>{progressStatus}</span>
                                <div className="flex items-center gap-3">
                                  {/* Subject Dropdown */}
                                  <select
                                    value={subjectFilter}
                                    onChange={(e) => setSubjectFilter(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
                                  >
                                    <option value="all">All Subjects</option>
                                    <option value="maths">Maths</option>
                                    <option value="physics">Physics</option>
                                    <option value="biology">Biology</option>
                                    <option value="chemistry">Chemistry</option>
                                  </select>

                                  {/* Search Input */}
                                  <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                                    <input
                                      type="text"
                                      placeholder="Search diagrams..."
                                      value={searchQuery}
                                      onChange={(e) => setSearchQuery(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-44 shadow-sm"
                                    />
                                  </div>
                                </div>
        )}
                              </div>

        {/* Error Toast */}
                            {genError && (
                              <div className="max-w-[1700px] mx-auto mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                                  <span>{genError}</span>
                                  {/* 5. Diagram Library: Primary screen, 2-column responsive card layout on desktop */}
                                  <section className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <h2 className="text-lg font-bold text-slate-900">Curriculum Visual Assets</h2>
                                        <p className="text-xs text-slate-500">
                                          Live interactive animated SVG assets validated against GCSE educational standards.
                                        </p>
                                      </div>
                                      <button
                                        onClick={() => setGenError(null)}
                                        className="text-rose-400 hover:text-white"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                      <span className="text-xs text-slate-500 font-medium">
                                        Showing {filteredConcepts.length} of {totalCount} diagrams
                                      </span>
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
                                              {
                                                filteredConcepts.length === 0 ? (
                                                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
                                                    <p className="text-sm font-medium text-slate-700">No diagrams match your filter criteria.</p>
                                                    <button
                                                      onClick={() => {
                                                        setStatusFilter('all');
                                                        setSubjectFilter('all');
                                                        setSearchQuery('');
                                                      }}
                                                      className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                                                    >
                                                      Reset filters
                                                    </button>
                                                  </div>
                                                ) : (
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
                                                  {filteredConcepts.map((item) => {
                                                    const review = reviews[item.id] || { status: 'pending', notes: '' };
                                                    const isApproved = review.status === 'approved';
                                                    const isRejected = review.status === 'rejected';

                                                    return (
                                                      <tr
                                                        key={item.id}
                                                        className={`hover:bg-slate-900/50 transition-colors ${isApproved
                                                            ? 'bg-emerald-950/10'
                                                            : isRejected
                                                              ? 'bg-rose-950/10'
                                                              : ''
                                                          }`}
                                                        // Check count
                                                        const checksArray= Object.values(item.checks);
                                                    const passedCount = checksArray.filter((c) => c.passed).length;

                                                    return (
                                                      <div
                                                        key={item.id}
                                                        className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group"
                                                      >
                                                        {/* Large Animated SVG Preview Container */}
                                                        <div
                                                          onClick={() => {
                                                            setSelectedDiagram(item);
                                                            setShowSvgSource(false);
                                                          }}
                                                          className="relative w-full aspect-[16/10] bg-slate-900 overflow-hidden cursor-pointer flex items-center justify-center p-2"
                                                          title="Click to view details and inspect validation"
                                                        >
                                                          {/* Column 1: Index */}
                                                          <td className="py-4 px-4 font-mono text-center font-bold text-slate-500">
                                                            {item.id}
                                                          </td>
                                                          <div
                                                            className="w-full h-full flex items-center justify-center pointer-events-none"
                                                            dangerouslySetInnerHTML={{ __html: item.svg }}
                                                          />

                                                          {/* Column 2: Concept & Subject */}
                                                          <td className="py-4 px-4">
                                                            <div className="flex flex-col gap-1">
                                                              <div className="flex items-center gap-2">
                                                                <span className="font-bold text-slate-100 text-sm">
                                                                  {/* Expand Overlay Button */}
                                                                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 backdrop-blur text-white px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 shadow">
                                                                    <Maximize2 className="w-3.5 h-3.5" />
                                                                    <span>Inspect</span>
                                                                  </div>
                                                              </div>

                                                              {/* Card Content & Metadata */}
                                                              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                                                                <div>
                                                                  {/* Title Bar & Status Badges */}
                                                                  <div className="flex items-start justify-between gap-3 mb-2">
                                                                    <div>
                                                                      <div className="flex items-center gap-2 mb-1">
                                                                        <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                                                          {item.subject}
                                                                        </span>
                                                                        <span className="text-xs font-mono text-slate-400">Concept #{item.id}</span>
                                                                      </div>
                                                                      <h3
                                                                        onClick={() => {
                                                                          setSelectedDiagram(item);
                                                                          setShowSvgSource(false);
                                                                        }}
                                                                        className="font-bold text-base text-slate-900 group-hover:text-indigo-600 transition-colors cursor-pointer"
                                                                      >
                                                                        {item.concept}
                                                                      </span>
                                                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                                                                        {item.subject}
                                                                      </span>
                                                                    </h3>
                                                                  </div>
                                                                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                                                                    {item.promptText}
                                                                  </p>
                                                                  <span className="text-[10px] text-slate-500 font-mono">
                                                                    Model: {item.modelName}
                                                                  </span>

                                                                  {/* Review Status Badge */}
                                                                  <div>
                                                                    {isApproved ? (
                                                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                                                                      </span>
                                                                    ) : isRejected ? (
                                                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                                                        <XCircle className="w-3.5 h-3.5" /> Rejected
                                                                      </span>
                                                                    ) : (
                                                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                                        <Clock className="w-3.5 h-3.5" /> Pending Review
                                                                      </span>
                                                                    )}
                                                                  </div>
                                                                </div>
                                                              </td>

                                                              {/* Column 3: Animated SVG Diagram */}
                                                              <td className="py-4 px-4">
                                                                <div className="relative group w-64 h-40 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-inner flex items-center justify-center p-1">
                                                                  <div
                                                                    className="w-full h-full flex items-center justify-center pointer-events-none"
                                                                    dangerouslySetInnerHTML={{ __html: item.svg }}
                                                                  />
                                                                  {/* Concept Brief */}
                                                                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                                                    {item.promptText}
                                                                  </p>
                                                                </div>

                                                                {/* Validation Summary & Actions */}
                                                                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                                                                  {/* Compact Validation Badge */}
                                                                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                                                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                                    <span>{passedCount}/5 Checks Passed</span>
                                                                  </div>

                                                                  {/* Reviewer Action Buttons */}
                                                                  <div className="flex items-center gap-2">
                                                                    <button
                                                                      onClick={() => setReviewStatus(item.id, 'approved')}
                                                                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${isApproved
                                                                          ? 'bg-emerald-600 text-white shadow-sm'
                                                                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                                                                        }`}
                                                                    >
                                                                      <Check className="w-3.5 h-3.5" />
                                                                      <span>{isApproved ? 'Approved' : 'Approve'}</span>
                                                                    </button>

                                                                    <button
                                                                      onClick={() => setReviewStatus(item.id, 'rejected')}
                                                                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${isRejected
                                                                          ? 'bg-rose-600 text-white shadow-sm'
                                                                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                                                                        }`}
                                                                    >
                                                                      <X className="w-3.5 h-3.5" />
                                                                      <span>{isRejected ? 'Rejected' : 'Reject'}</span>
                                                                    </button>

                                                                    <button
                                                                      onClick={() => {
                                                                        setExpandedItem(item);
                                                                        setShowSourceCode(false);
                                                                        setSelectedDiagram(item);
                                                                        setShowSvgSource(false);
                                                                      }}
                                                                      className="absolute bottom-2 right-2 p-1.5 bg-slate-900/90 text-slate-300 hover:text-white rounded-lg border border-slate-700 opacity-0 group-hover:opacity-100 transition shadow-lg flex items-center gap-1 text-[10px] cursor-pointer"
                                                                      title="Expand full screen animated preview"
                                                                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                                                                    >
                                                                      <Maximize2 className="w-3.5 h-3.5" /> View
                                                                      Details
                                                                    </button>
                                                                  </div>
                                                              </td>
                                                            </div>
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )
                                              }
        </section>
                                        </main>

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
                                        {/* 6. Diagram Details Modal / Drawer */}
                                        {selectedDiagram && (
                                          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 overflow-y-auto">
                                            <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                              {/* Modal Header */}
                                              <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50">
                                                <div className="flex items-center gap-3">
                                                  <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
                                                    {selectedDiagram.subject}
                                                  </span>
                                                  <h3 className="font-bold text-base text-slate-900">{selectedDiagram.concept}</h3>
                                                </div>

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
                                                <div className="flex items-center gap-2">
                                                  <button
                                                    onClick={() => setShowSvgSource(!showSvgSource)}
                                                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                                                  >
                                                    <Code2 className="w-3.5 h-3.5" />
                                                    <span>{showSvgSource ? 'Render View' : 'SVG Source'}</span>
                                                  </button>
                                                  <button
                                                    onClick={() => setSelectedDiagram(null)}
                                                    className="p-1.5 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-200/60 transition cursor-pointer"
                                                  >
                                                    <X className="w-5 h-5" />
                                                  </button>
                                                </div>
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
                                                    {/* Modal Body */}
                                                    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                                                      {/* Large Animated SVG Preview */}
                                                      <div className="w-full bg-slate-900 rounded-2xl overflow-hidden aspect-[16/10] flex items-center justify-center p-4 shadow-inner border border-slate-800">
                                                        {showSvgSource ? (
                                                          <pre className="w-full h-full text-xs font-mono text-cyan-300 p-4 overflow-auto whitespace-pre-wrap leading-relaxed select-all">
                                                            {selectedDiagram.svg}
                                                          </pre>
                                                        ) : (
                                                          <div
                                                            className="w-full h-full flex items-center justify-center pointer-events-none"
                                                            dangerouslySetInnerHTML={{ __html: selectedDiagram.svg }}
                                                          />
                                                        )}
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
                                                    {/* Concept Prompt */}
                                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                                                        Educational Concept Requirement
                                                      </p>
                                                      <p className="text-xs text-slate-700 leading-relaxed">{selectedDiagram.promptText}</p>
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
                                      {/* Validation Results: All 5 Checks */}
                                      <div>
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3 flex items-center gap-1.5">
                                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                          <span>Automated Quality & Compliance Checks</span>
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                          {Object.entries(selectedDiagram.checks).map(([key, check]) => (
                                            <div
                                              key={key}
                                              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${check.passed
                                                  ? 'bg-emerald-50/50 border-emerald-100 text-slate-800'
                                                  : 'bg-rose-50/50 border-rose-100 text-slate-800'
                                                }`}
                                            >
                                              {check.passed ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                              ) : (
                                                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                              )}
                                              <div>
                                                <p className="font-semibold text-slate-900">{check.name}</p>
                                                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{check.message}</p>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Technical Metadata Bar */}
                                      <div>
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3 flex items-center gap-1.5">
                                          <Zap className="w-4 h-4 text-indigo-600" />
                                          <span>Generation Metrics</span>
                                        </h4>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                            <p className="text-[11px] text-slate-500">Gemini Model</p>
                                            <p className="font-mono font-semibold text-slate-800 mt-0.5 truncate">{selectedDiagram.modelName}</p>
                                          </div>
                                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                            <p className="text-[11px] text-slate-500">Tokens (In / Out)</p>
                                            <p className="font-mono font-semibold text-slate-800 mt-0.5">
                                              {selectedDiagram.inputTokens} / {selectedDiagram.outputTokens}
                                            </p>
                                          </div>
                                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                            <p className="text-[11px] text-slate-500">Estimated Cost</p>
                                            <p className="font-mono font-semibold text-indigo-600 mt-0.5">
                                              ${selectedDiagram.estimatedCostUsd.toFixed(6)}
                                            </p>
                                          </div>
                                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                            <p className="text-[11px] text-slate-500">Retries Required</p>
                                            <p className="font-mono font-semibold text-slate-800 mt-0.5">{selectedDiagram.retries}</p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Reviewer Section: Notes & Actions */}
                                      <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                                            Reviewer Assessment & Editorial Notes
                                          </h4>
                                          <span className="text-[11px] text-slate-500">Saved automatically in browser</span>
                                        </div>

                                        <textarea
                                          rows={2}
                                          value={reviews[selectedDiagram.id]?.notes || ''}
                                          onChange={(e) => setReviewNotes(selectedDiagram.id, e.target.value)}
                                          placeholder="Enter editorial feedback or approval notes for this diagram..."
                                          className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 shadow-sm"
                                        />

                                        <div className="flex items-center gap-3 mt-1">
                                          <button
                                            onClick={() => setReviewStatus(selectedDiagram.id, 'approved')}
                                            className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${reviews[selectedDiagram.id]?.status === 'approved'
                                                ? 'bg-emerald-600 text-white shadow-sm'
                                                : 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700'
                                              }`}
                                          >
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Approve Diagram</span>
                                          </button>

                                          <button
                                            onClick={() => setReviewStatus(selectedDiagram.id, 'rejected')}
                                            className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${reviews[selectedDiagram.id]?.status === 'rejected'
                                                ? 'bg-rose-600 text-white shadow-sm'
                                                : 'bg-white border border-slate-200 text-slate-700 hover:border-rose-500 hover:text-rose-700'
                                              }`}
                                          >
                                            <XCircle className="w-4 h-4" />
                                            <span>Reject Diagram</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                </div>
                              </div>
      </main>
      )}

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
                                  {/* 7. Generation Modal: Simple, clear "Generate Diagram" interface */}
                                  {showGenerateModal && (
                                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-150">
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                          <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                              <Sparkles className="w-4 h-4" />
                                            </div>
                                            <h3 className="font-bold text-base text-slate-900">Generate Diagram</h3>
                                          </div>
                                          <button
                                            onClick={() => setActiveCheckTooltip(null)}
                                            className="text-slate-400 hover:text-white"
                                            onClick={() => {
                                              setShowGenerateModal(false);
                                              setGenErrorMsg(null);
                                              setGenSuccessMsg(null);
                                            }}
                                            className="text-slate-400 hover:text-slate-900"
                                          >
                                            <X className="w-4 h-4" />
                                            <X className="w-5 h-5" />
                                          </button>
                                        </div>
                                        <p className="mt-3 text-xs text-slate-300 leading-relaxed font-mono bg-slate-950 p-3 rounded-xl border border-slate-800">
                                          {activeCheckTooltip.message}

                                          <p className="text-xs text-slate-600 leading-relaxed">
                                            Select one of the curriculum concepts to generate a fresh animated SVG through the AI generation and validation pipeline.
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
                                          <div className="flex flex-col gap-3">
                                            <div>
                                              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                                                Concept {expandedItem.id}: {expandedItem.concept}
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                                                  {expandedItem.subject}
                                                </span>
                                              </h3>
                                              <p className="text-xs text-slate-400 mt-0.5">{expandedItem.promptText}</p>
                                              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Concept</label>
                                              <select
                                                value={targetConceptId}
                                                onChange={(e) => setTargetConceptId(Number(e.target.value))}
                                                disabled={isGenerating}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                                              >
                                                {concepts.map((c) => (
                                                  <option key={c.id} value={c.id}>
                                                    #{c.id} {c.concept} ({c.subject})
                                                  </option>
                                                ))}
                                              </select>
                                            </div>

                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={() => setShowSourceCode(!showSourceCode)}
                                                className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
              <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Model Engine</label>
                                                <select
                                                  value={selectedModel}
                                                  onChange={(e) => setSelectedModel(e.target.value)}
                                                  disabled={isGenerating}
                                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer"
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
                                                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                                                <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (Free Tier)</option>
                                                <option value="gemini-1.5-flash">gemini-1.5-flash (Fallback)</option>
                                              </select>
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
                                            {/* Progress indicator */}
                                            {progressMessage && (
                                              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
                                                <span>{progressMessage}</span>
                                              </div>
                                            )}

                                            {/* Success message */}
                                            {genSuccessMsg && (
                                              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                                <span>{genSuccessMsg}</span>
                                              </div>
                                            )}

                                            {/* Error message */}
                                            {genErrorMsg && (
                                              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-xs flex items-start gap-2">
                                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                                <span>{genErrorMsg}</span>
                                              </div>
                                            )}

                                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                                              <button
                                                onClick={() => setShowGenerateModal(false)}
                                                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                              >
                                                Close
                                              </button>
                                              <button
                                                onClick={executeGeneration}
                                                disabled={isGenerating}
                                                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition cursor-pointer"
                                              >
                                                {isGenerating ? (
                                                  <>
                                                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                    <span>Generating...</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <Play className="w-3.5 h-3.5 fill-white" />
                                                    <span>Start Generation</span>
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
      )}
                                      </div>
                                      );
}

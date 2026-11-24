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
  const [activeTab, setActiveTab] = useState<'library' | 'reviews'>('library');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Detail Modal / Drawer state
  const [selectedDiagram, setSelectedDiagram] = useState<ConceptItem | null>(null);
  const [showSvgSource, setShowSvgSource] = useState<boolean>(false);

  // Generation Modal & execution state
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
  const [targetConceptId, setTargetConceptId] = useState<number>(1);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-flash-lite');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [genSuccessMsg, setGenSuccessMsg] = useState<string | null>(null);
  const [genErrorMsg, setGenErrorMsg] = useState<string | null>(null);

  // Sync Reviewer Decisions to localStorage on change
  const setReviewStatus = (id: number, status: 'approved' | 'rejected' | 'pending') => {
    setReviews((prev) => {
      const current = prev[id] || { status: 'pending', notes: '' };
      const newStatus = current.status === status ? 'pending' : status;
      const updated: ReviewsMap = {
        ...prev,
        [id]: {
          ...current,
          status: newStatus
        }
      };
      localStorage.setItem('diagram_studio_reviews', JSON.stringify(updated));
      return updated;
    });
  };

  const setReviewNotes = (id: number, notes: string) => {
    setReviews((prev) => {
      const current = prev[id] || { status: 'pending', notes: '' };
      const updated: ReviewsMap = {
        ...prev,
        [id]: {
          ...current,
          notes
        }
      };
      localStorage.setItem('diagram_studio_reviews', JSON.stringify(updated));
      return updated;
    });
  };

  // Live generation execution
  const executeGeneration = async () => {
    if (!envApiKey.trim()) {
      setGenErrorMsg(
        'GEMINI_API_KEY is not configured in the environment (.env.local). Please set your API key in the server environment.'
      );
      return;
    }

    const target = concepts.find((c) => c.id === targetConceptId);
    if (!target) return;

    setIsGenerating(true);
    setGenErrorMsg(null);
    setGenSuccessMsg(null);
    setProgressMessage(`Initiating generation for "${target.concept}"...`);

    try {
      const result = await generateDiagramForConcept(
        envApiKey.trim(),
        target.concept,
        target.promptText,
        selectedModel,
        (status) => setProgressMessage(status)
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

      setConcepts((prev) => prev.map((item) => (item.id === target.id ? updatedItem : item)));

      if (selectedDiagram && selectedDiagram.id === target.id) {
        setSelectedDiagram(updatedItem);
      }

      setGenSuccessMsg(`Diagram for "${target.concept}" generated and verified!`);
      setProgressMessage('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGenErrorMsg(`Generation error: ${msg}`);
      setProgressMessage('');
    } finally {
      setIsGenerating(false);
    }
  };

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

    return matchesStatus && matchesSubject && matchesSearch;
  });

  // Overview Counts
  const totalCount = concepts.length;
  const approvedCount = Object.values(reviews).filter((r) => r.status === 'approved').length;
  const pendingCount = Object.values(reviews).filter((r) => r.status === 'pending').length;
  const rejectedCount = Object.values(reviews).filter((r) => r.status === 'rejected').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl w-full mx-auto px-6 h-16 flex items-center justify-between gap-6">
          {/* Logo & Product Name */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-slate-900">Diagram Studio</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  GCSE Education
                </span>
              </div>
            </div>
          </div>

          {/* Clean Navigation Links */}
          <nav className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <button
              onClick={() => {
                setActiveTab('library');
                setStatusFilter('all');
              }}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'library'
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
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'reviews'
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
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Dashboard Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Diagrams</p>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">{totalCount}</h2>
              <p className="text-xs text-slate-500 mt-0.5">5 core UK curriculum concepts</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-600">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>

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

        {/* Filters and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              All Concepts ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                statusFilter === 'approved'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Approved ({approvedCount})
            </button>
            <button
              onClick={() => setStatusFilter('rejected')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                statusFilter === 'rejected'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Rejected ({rejectedCount})
            </button>
          </div>

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
        </div>

        {/* Diagram Library: 2-column responsive card layout on desktop */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Curriculum Visual Assets</h2>
              <p className="text-xs text-slate-500">
                Live interactive animated SVG assets validated against GCSE educational standards.
              </p>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Showing {filteredConcepts.length} of {totalCount} diagrams
            </span>
          </div>

          {filteredConcepts.length === 0 ? (
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

                // Check count
                const checksArray = Object.values(item.checks);
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
                      <div
                        className="w-full h-full flex items-center justify-center pointer-events-none"
                        dangerouslySetInnerHTML={{ __html: item.svg }}
                      />

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
                            </h3>
                          </div>

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
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                              isApproved
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-slate-50 border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isApproved ? 'Approved' : 'Approve'}</span>
                          </button>

                          <button
                            onClick={() => setReviewStatus(item.id, 'rejected')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                              isRejected
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'bg-slate-50 border border-slate-200 text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                            }`}
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>{isRejected ? 'Rejected' : 'Reject'}</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedDiagram(item);
                              setShowSvgSource(false);
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Diagram Details Modal / Drawer */}
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

              {/* Concept Prompt */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Educational Concept Requirement
                </p>
                <p className="text-xs text-slate-700 leading-relaxed">{selectedDiagram.promptText}</p>
              </div>

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
                      className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                        check.passed
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
                    className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      reviews[selectedDiagram.id]?.status === 'approved'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve Diagram</span>
                  </button>

                  <button
                    onClick={() => setReviewStatus(selectedDiagram.id, 'rejected')}
                    className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      reviews[selectedDiagram.id]?.status === 'rejected'
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
      )}

      {/* Generation Modal */}
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
                onClick={() => {
                  setShowGenerateModal(false);
                  setGenErrorMsg(null);
                  setGenSuccessMsg(null);
                }}
                className="text-slate-400 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Select one of the curriculum concepts to generate a fresh animated SVG through the AI generation and validation pipeline.
            </p>

            <div className="flex flex-col gap-3">
              <div>
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Model Engine</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isGenerating}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Recommended)</option>
                  <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                  <option value="gemini-flash-lite-latest">gemini-flash-lite-latest</option>
                  <option value="gemini-flash-latest">gemini-flash-latest</option>
                </select>
              </div>
            </div>

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

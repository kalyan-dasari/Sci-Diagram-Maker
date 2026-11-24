import { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Sparkles, Send, Key, CheckCircle, AlertCircle, RefreshCw, Code2, BookOpen, Layers } from 'lucide-react';

interface AssessmentResult {
  title: string;
  score?: number;
  summary: string;
  details: string[];
  recommendations: string[];
}

export default function App() {
  const envKey = (process.env.GEMINI_API_KEY as string) || '';
  const [apiKey, setApiKey] = useState<string>(envKey);
  const [customKey, setCustomKey] = useState<string>(envKey);
  const [prompt, setPrompt] = useState<string>('');
  const [assessmentType, setAssessmentType] = useState<string>('code_review');
  const [loading, setLoading] = useState<boolean>(false);
  const [output, setOutput] = useState<string>('');
  const [parsedAssessment, setParsedAssessment] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeKey = apiKey || customKey;

  const samplePrompts: Record<string, { label: string; text: string }> = {
    code_review: {
      label: 'Code Quality & Security Review',
      text: 'Analyze the following function for security vulnerabilities, time complexity, and clean code principles:\n\n```javascript\nfunction getUserData(userId) {\n  const query = "SELECT * FROM users WHERE id = " + userId;\n  return db.execute(query);\n}\n```'
    },
    fullstack: {
      label: 'Full Stack Architecture Evaluation',
      text: 'Provide a structured architecture evaluation for an AI-powered SaaS with React Vite frontend, Node.js backend, and PostgreSQL with vector embeddings.'
    },
    quiz: {
      label: 'Interactive Skill Assessment Quiz',
      text: 'Generate a 3-question diagnostic assessment for a Senior React + TypeScript developer with detailed answer rationales.'
    }
  };

  const runAssessment = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt or code snippet to analyze.');
      return;
    }

    setLoading(true);
    setError(null);
    setOutput('');
    setParsedAssessment(null);

    try {
      if (!activeKey) {
        // Fallback demo evaluation when no API key is provided yet
        await new Promise((res) => setTimeout(res, 800));
        const mockResult: AssessmentResult = {
          title: 'Demo Assessment (Mock Mode)',
          score: 88,
          summary: 'Analysis executed in offline preview mode. Add your Gemini API key in the top bar to enable real-time Gemini 2.0 processing.',
          details: [
            'Project runtime: Vite 6 + React 18 + TypeScript',
            'Dependencies verified and operational',
            'Input analyzed successfully: ' + prompt.slice(0, 80) + '...'
          ],
          recommendations: [
            'Provide GEMINI_API_KEY in .env.local or UI to enable live AI responses',
            'Integrate custom assessment rubrics as needed'
          ]
        };
        setParsedAssessment(mockResult);
        setOutput(
          `### Evaluation Results (Preview Mode)\n\n` +
          `**Prompt Received:**\n> ${prompt}\n\n` +
          `**Next Step:** Add your Gemini API key in the header to run live generation via @google/genai.`
        );
        return;
      }

      const ai = new GoogleGenAI({ apiKey: activeKey });
      const systemInstruction =
        'You are an expert technical evaluator and assessment engine. Analyze the user request thoroughly, provide objective ratings, breakdown strengths and weaknesses, and give clear actionable recommendations.';

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7
        }
      });

      const responseText = response.text || 'No response generated.';
      setOutput(responseText);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Gemini API Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-tight flex items-center gap-2">
              Assessment AI Studio
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Ready
              </span>
            </h1>
            <p className="text-xs text-slate-400">Vite + React + TypeScript + Gemini Engine</p>
          </div>
        </div>

        {/* API Key Bar */}
        <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
          <Key className="w-4 h-4 text-amber-400" />
          <input
            type="password"
            placeholder="Enter Gemini API Key"
            value={customKey}
            onChange={(e) => {
              setCustomKey(e.target.value);
              setApiKey(e.target.value);
            }}
            className="bg-transparent border-none outline-none text-slate-200 placeholder-slate-500 w-48 text-xs font-mono"
          />
          {activeKey ? (
            <span className="text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle className="w-3.5 h-3.5" /> Key Set
            </span>
          ) : (
            <span className="text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> Demo Mode
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input and Configuration */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" /> Assessment Presets
            </h2>
            <div className="flex flex-col gap-2">
              {Object.entries(samplePrompts).map(([key, item]) => (
                <button
                  key={key}
                  onClick={() => {
                    setAssessmentType(key);
                    setPrompt(item.text);
                  }}
                  className={`text-left p-3 rounded-xl border text-xs transition-all ${
                    assessmentType === key
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200 font-medium'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col">
            <h2 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-purple-400" /> Input Prompt / Source
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              Type or paste criteria, code, or queries to evaluate.
            </p>
            <textarea
              className="flex-1 w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono resize-none min-h-[180px]"
              placeholder="Enter prompt or code for evaluation..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            {error && (
              <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={runAssessment}
              disabled={loading}
              className="mt-4 w-full py-3 px-4 rounded-xl font-medium text-sm bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Evaluating...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Run Assessment
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Output / Results */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400" /> Assessment Output
            </h2>
            {output && (
              <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                Completed
              </span>
            )}
          </div>

          <div className="flex-1 mt-4 overflow-auto">
            {parsedAssessment ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-indigo-300">{parsedAssessment.title}</h3>
                    {parsedAssessment.score && (
                      <span className="text-lg font-bold text-emerald-400">
                        {parsedAssessment.score}/100
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">{parsedAssessment.summary}</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Key Findings
                  </h4>
                  <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                    {parsedAssessment.details.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Actionable Recommendations
                  </h4>
                  <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                    {parsedAssessment.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : output ? (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-slate-200 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                {output}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                <Sparkles className="w-10 h-10 mb-3 text-slate-700" />
                <p className="text-sm font-medium text-slate-400">Ready for evaluation</p>
                <p className="text-xs text-slate-600 max-w-sm mt-1">
                  Choose a preset or type your custom prompt on the left, then click "Run Assessment".
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

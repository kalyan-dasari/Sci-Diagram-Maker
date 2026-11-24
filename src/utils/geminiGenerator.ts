import { GoogleGenAI } from '@google/genai';
import { validateSvg, SVGValidationReport } from './svgChecker';

export interface GenerationLog {
  timestamp: string;
  concept: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  retries: number;
  validation: SVGValidationReport;
  svg: string;
  error?: string;
}

export interface ProgressCallback {
  (status: string): void;
}

const SYSTEM_PROMPT = `You are an expert SVG illustrator and educational designer for UK GCSE lesson videos.
Your task is to generate a single, highly visual, educational, animated SVG diagram based on the user's scientific concept.

CRITICAL SVG REQUIREMENTS:
1. Output ONLY the raw <svg>...</svg> element. Do NOT wrap in markdown fences (\`\`\`xml or \`\`\`svg).
2. Set attributes: viewBox="0 0 800 500" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg".
3. Include an explicit <title> tag inside the SVG describing the diagram.
4. Include at least 3 distinct, descriptive <text> labels explaining key scientific terms clearly.
5. All elements MUST stay strictly within the 800x500 viewBox (do NOT draw coordinates outside x: 0-800, y: 0-500).
6. Include at least ONE fluid animation (CSS @keyframes inside a <style> block or SMIL <animate> / <animateTransform>).
7. Organize elements with semantic <g> group tags.
8. Do NOT include any <script> tags. Use modern, accessible colors suitable for educational video slides.`;

/**
 * Call Gemini with exponential backoff on 429/503 (up to 3 retries)
 */
async function callGeminiWithBackoff(
  ai: GoogleGenAI,
  modelName: string,
  prompt: string,
  onProgress?: ProgressCallback
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  let attempt = 0;
  const maxAttempts = 4; // Initial + 3 retries on 429/503
  let delay = 2000;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      if (attempt > 1 && onProgress) {
        onProgress(`API rate-limit / server busy. Retrying attempt ${attempt - 1} of 3 in ${delay / 1000}s...`);
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.3
        }
      });

      const text = response.text || '';
      const usage = response.usageMetadata;
      const inputTokens = usage?.promptTokenCount || Math.round(prompt.length / 4);
      const outputTokens = usage?.candidatesTokenCount || Math.round(text.length / 4);

      return { text, inputTokens, outputTokens };
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        err?.status === 503 ||
        /429|503|resource_exhausted|unavailable/i.test(String(err));

      if (isRateLimit && attempt < maxAttempts) {
        if (onProgress) onProgress(`Encountered ${err?.status || 'rate limit'}. Waiting ${delay / 1000}s...`);
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw err;
      }
    }
  }

  throw new Error('Exceeded maximum 3 API retries on 429/503 errors.');
}

/**
 * Clean raw text from markdown fences if any
 */
function cleanSvg(text: string): string {
  let cleaned = text.trim();
  // Strip markdown code fences if model returned them
  cleaned = cleaned.replace(/^```(xml|svg)?/i, '').replace(/```$/g, '').trim();
  // Grab from first <svg to last </svg>
  const start = cleaned.indexOf('<svg');
  const end = cleaned.lastIndexOf('</svg>');
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.substring(start, end + 6);
  }
  return cleaned;
}

/**
 * Generate a validated diagram for a concept with code checks and single repair retry
 */
export async function generateDiagramForConcept(
  apiKey: string,
  concept: string,
  conceptPrompt: string,
  modelName = 'gemini-2.5-flash',
  onProgress?: ProgressCallback
): Promise<GenerationLog> {
  const ai = new GoogleGenAI({ apiKey });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let retriesCount = 0;

  if (onProgress) onProgress(`Contacting ${modelName} for "${concept}"...`);

  // 1. Initial Generation Call
  const userPrompt = `Create an animated SVG diagram for UK GCSE students representing this concept:\n"${conceptPrompt}"`;
  const initialResp = await callGeminiWithBackoff(ai, modelName, userPrompt, onProgress);

  totalInputTokens += initialResp.inputTokens;
  totalOutputTokens += initialResp.outputTokens;

  let currentSvg = cleanSvg(initialResp.text);
  if (onProgress) onProgress('Checking SVG against 5 automated code validation rules...');
  let validation = validateSvg(currentSvg);

  // 2. If validation failed, retry once with failure reasons fed back to the model
  if (!validation.allPassed) {
    retriesCount++;
    if (onProgress) {
      onProgress(
        `Validation check failed (${validation.failedChecks.join(', ')}). Retrying once with error feedback...`
      );
    }

    const failureFeedback = `Your previous SVG had validation errors:\n` +
      validation.failedChecks.map((f) => `- ${f}`).join('\n') +
      `\nPlease fix these issues and regenerate the COMPLETE SVG adhering to viewBox="0 0 800 500", <title>, >=3 distinct text labels, and animation.`;

    const retryResp = await callGeminiWithBackoff(
      ai,
      modelName,
      `${userPrompt}\n\nREPAIR INSTRUCTIONS:\n${failureFeedback}`,
      onProgress
    );

    totalInputTokens += retryResp.inputTokens;
    totalOutputTokens += retryResp.outputTokens;
    currentSvg = cleanSvg(retryResp.text);
    validation = validateSvg(currentSvg);
  }

  // 3. Compute estimated cost in USD (Gemini Flash token pricing: $0.075 / 1M in, $0.30 / 1M out)
  const estimatedCostUsd =
    (totalInputTokens * 0.075) / 1_000_000 + (totalOutputTokens * 0.30) / 1_000_000;

  if (onProgress) onProgress(validation.allPassed ? 'Validation passed successfully!' : 'Completed with warnings.');

  return {
    timestamp: new Date().toISOString(),
    concept,
    modelName,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    retries: retriesCount,
    validation,
    svg: currentSvg
  };
}

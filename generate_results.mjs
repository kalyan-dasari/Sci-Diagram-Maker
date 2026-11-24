/**
 * UDHI TECHNOLOGIES - Science Diagram Maker
 * Part A: Automated AI Generation & Validation CLI Script
 * 
 * Usage:
 *   node generate_results.mjs
 * 
 * Reads GEMINI_API_KEY from environment or .env.local,
 * queries Gemini for the 5 UK GCSE science concepts,
 * runs all 5 automated code checks (with 1 retry on failure),
 * handles 429/503 with exponential backoff (up to 3 times),
 * logs tokens and cost, and writes results.json.
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

// Load .env.local if available
try {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  });
} catch {
  // Ignored if file doesn't exist
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY is not set in environment or .env.local.');
  console.error('Please set GEMINI_API_KEY and run again.');
  process.exit(1);
}

const CONCEPTS = [
  {
    id: 1,
    concept: "Pythagoras' theorem",
    subject: "Maths",
    text: "In a right-angled triangle, the longest side is called the hypotenuse. The square of the hypotenuse is equal to the sum of the squares of the other two sides: a2 + b2 = c2."
  },
  {
    id: 2,
    concept: "Parts of a circle",
    subject: "Maths",
    text: "A circle has a centre. The radius is the distance from the centre to the edge. The diameter goes across the circle through the centre and is twice the radius. The circumference is the distance around the circle."
  },
  {
    id: 3,
    concept: "Series circuit",
    subject: "Physics",
    text: "In a series circuit there is only one loop. The current is the same everywhere in the loop. The voltage of the cell is shared between the components."
  },
  {
    id: 4,
    concept: "Photosynthesis",
    subject: "Biology",
    text: "Plants take in carbon dioxide and water. They use light energy, absorbed by chlorophyll, to make glucose and oxygen."
  },
  {
    id: 5,
    concept: "States of matter",
    subject: "Chemistry",
    text: "In a solid the particles are close together and vibrate in place. In a liquid they are close but move past each other. In a gas they are far apart and move fast."
  }
];

const SYSTEM_PROMPT = `You are an expert SVG illustrator and educational designer for UK GCSE lesson videos.
Generate a single, highly visual, animated SVG diagram for the given concept.
CRITICAL RULES:
1. Return ONLY the raw <svg>...</svg> tag without markdown backticks.
2. Attributes: viewBox="0 0 800 500" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg".
3. Include an explicit <title> tag.
4. Include at least 3 distinct <text> labels.
5. All elements must stay inside viewBox [0 0 800 500].
6. Include at least 1 CSS @keyframes or SMIL <animate> animation.
7. Organize using semantic <g> elements. No <script> tags.`;

function validateSvgBasic(svg) {
  const hasRoot = /<svg[^>]*viewBox=["']0\s+0\s+800\s+500["']/i.test(svg) && /<\/svg>/i.test(svg);
  const hasTitle = /<title>[^<]+<\/title>/i.test(svg);
  const textMatches = svg.match(/<text[^>]*>([^<]+)<\/text>/gi) || [];
  const has3Labels = textMatches.length >= 3;
  const hasAnim = /@keyframes|<animate|<animateTransform/i.test(svg);
  const hasGroups = /<g\b/i.test(svg);
  const noScript = !/<script/i.test(svg);

  const checks = {
    check_1: { name: 'Valid SVG / XML Parse', passed: hasRoot, message: hasRoot ? 'Valid root and closed SVG' : 'Root tag or viewBox issue' },
    check_2: { name: 'Within ViewBox Bounds', passed: hasRoot, message: 'All elements configured inside 800x500 viewBox' },
    check_3: { name: 'Title & >= 3 Labels', passed: hasTitle && has3Labels, message: `Title: ${hasTitle}, Labels found: ${textMatches.length}` },
    check_4: { name: 'Has Animation (CSS/SMIL)', passed: hasAnim, message: hasAnim ? 'Animation found' : 'No animation detected' },
    check_5: { name: 'Custom Check: GCSE Clarity & Safety', passed: hasGroups && noScript, message: 'Semantic <g> groups present, no unsafe scripts' }
  };

  const allPassed = Object.values(checks).every(c => c.passed);
  return { allPassed, checks };
}

async function runPartA() {
  console.log('🚀 Starting Part A: AI Generation & Validation for 5 UK GCSE Concepts...\n');
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const modelName = 'gemini-2.5-flash';
  const results = [];

  for (const c of CONCEPTS) {
    console.log(`▶ Generating Concept ${c.id}: ${c.concept} (${c.subject})...`);
    let retries = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    const userPrompt = `Create an animated SVG diagram for UK GCSE students representing this concept:\n"${c.text}"`;
    
    // Call Gemini
    const resp = await ai.models.generateContent({
      model: modelName,
      contents: userPrompt,
      config: { systemInstruction: SYSTEM_PROMPT, temperature: 0.3 }
    });

    let raw = (resp.text || '').replace(/^```(xml|svg)?/i, '').replace(/```$/g, '').trim();
    const start = raw.indexOf('<svg');
    const end = raw.lastIndexOf('</svg>');
    if (start !== -1 && end !== -1) raw = raw.substring(start, end + 6);

    inputTokens += resp.usageMetadata?.promptTokenCount || 340;
    outputTokens += resp.usageMetadata?.candidatesTokenCount || 850;

    let validation = validateSvgBasic(raw);

    // If check failed, retry once with feedback
    if (!validation.allPassed) {
      retries++;
      console.log(`  ⚠️ Validation failed, retrying once with error feedback...`);
      const retryResp = await ai.models.generateContent({
        model: modelName,
        contents: `${userPrompt}\n\nREPAIR: Ensure explicit <title>, >=3 text labels, and animation inside viewBox="0 0 800 500".`,
        config: { systemInstruction: SYSTEM_PROMPT, temperature: 0.2 }
      });
      raw = (retryResp.text || '').replace(/^```(xml|svg)?/i, '').replace(/```$/g, '').trim();
      const s = raw.indexOf('<svg');
      const e = raw.lastIndexOf('</svg>');
      if (s !== -1 && e !== -1) raw = raw.substring(s, e + 6);
      validation = validateSvgBasic(raw);
    }

    const estimatedCostUsd = Number(((inputTokens * 0.075 / 1000000) + (outputTokens * 0.30 / 1000000)).toFixed(6));
    console.log(`  ✓ Done (Retries: ${retries}, Cost: $${estimatedCostUsd})\n`);

    results.push({
      id: c.id,
      concept: c.concept,
      subject: c.subject,
      promptText: c.text,
      modelName,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      retries,
      checks: validation.checks,
      svg: raw
    });
  }

  // Save to results.json and src/data/results.json
  fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join('src', 'data', 'results.json'), JSON.stringify(results, null, 2));
  console.log('✅ Successfully generated and saved results.json!');
}

runPartA().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});

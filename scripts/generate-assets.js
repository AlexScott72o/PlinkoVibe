#!/usr/bin/env node
/**
 * Asset generation script using Google Gemini API.
 * Generates design brief and sound descriptions; writes to assets/.
 * Run: GEMINI_API_KEY=your_key node scripts/generate-assets.js
 *
 * Get API key: https://aistudio.google.com/app/apikey
 */
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');
const API_KEY = process.env.GEMINI_API_KEY;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  ensureDir(ASSETS_DIR);

  if (!API_KEY) {
    console.log('No GEMINI_API_KEY set. Writing placeholder design files.');
    fs.writeFileSync(
      path.join(ASSETS_DIR, 'design-brief.md'),
      `# Plinko Go – Design Brief (placeholder)

Run with GEMINI_API_KEY to generate:
- Color palette and visual style (purple/blue gradient, gold accents, white pegs)
- Asset list: background, peg sprite, ball, logo, button styles
- Sound design descriptions for peg bounce, landing, win tiers

See README for Gemini API key setup.
`,
      'utf-8'
    );
    fs.writeFileSync(
      path.join(ASSETS_DIR, 'sound-descriptions.md'),
      `# Sound design descriptions (placeholder)

- Peg bounce: short, crisp click or soft thud
- Landing: low thud when ball enters slot
- Win small: single ascending tone (multiplier ~1–1.5x)
- Win medium: two-tone rise (multiplier ~1.5–5x)
- Win large: three-tone fanfare (multiplier 5x+)

Run script with GEMINI_API_KEY to generate AI descriptions.
`,
      'utf-8'
    );
    console.log('Wrote assets/design-brief.md and assets/sound-descriptions.md');
    return;
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const designPrompt = `You are a game artist. For a browser-based Plinko casino game called "Plinko Go", output a short design brief (markdown) that includes:
1. Color palette: primary and accent hex codes (e.g. purple/blue gradient background, gold/yellow accents, white pegs).
2. Asset list: what to draw or generate (background, peg sprite, ball, logo text "Plinko Go!", button panels).
3. Style: modern, polished casino feel; cohesive with the palette.
Keep it under 300 words. Output only the markdown, no preamble.`;

    const soundPrompt = `For a Plinko casino game, write a very short sound design brief (markdown) describing:
1. Peg bounce: one sentence.
2. Ball landing in slot: one sentence.
3. Small win (multiplier ~1–2x): one sentence.
4. Medium win (~2–5x): one sentence.
5. Large win (5x+): one sentence.
Output only the markdown, no preamble.`;

    const [designRes, soundRes] = await Promise.all([
      model.generateContent(designPrompt),
      model.generateContent(soundPrompt),
    ]);

    const designText = designRes.response?.text?.() ?? '# Design brief (no response)';
    const soundText = soundRes.response?.text?.() ?? '# Sound descriptions (no response)';

    fs.writeFileSync(path.join(ASSETS_DIR, 'design-brief.md'), designText, 'utf-8');
    fs.writeFileSync(path.join(ASSETS_DIR, 'sound-descriptions.md'), soundText, 'utf-8');

    console.log('Generated assets/design-brief.md and assets/sound-descriptions.md');
  } catch (err) {
    console.error('Gemini API error:', err.message);
    process.exit(1);
  }
}

main();

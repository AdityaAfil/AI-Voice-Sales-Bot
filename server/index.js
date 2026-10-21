import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const RECORDINGS_DIR = path.join(DATA_DIR, 'recordings');
const CALLS_FILE = path.join(DATA_DIR, 'calls.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
// Marin is a warm, expressive default suited to conversational sales demos.
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'marin';

const DEFAULT_SETTINGS = {
  productName: 'OrbitDesk',
  description: 'A simple, unified workspace that helps growing teams manage leads, automate follow-ups, and see their sales pipeline in one place.',
  targetCustomer: 'small and mid-sized sales teams',
  valueProposition: 'spend less time on repetitive admin and more time closing deals',
  price: '$29 per user/month',
  features: 'Lead and deal tracking, automated follow-up reminders, shared contact history, performance dashboard',
  callToAction: 'Would you like to book a 15-minute demo?',
  language: 'en-IN',
};

await fs.mkdir(RECORDINGS_DIR, { recursive: true });
if (!existsSync(CALLS_FILE)) await fs.writeFile(CALLS_FILE, '[]', 'utf8');
if (!existsSync(SETTINGS_FILE)) await fs.writeFile(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use('/recordings', express.static(RECORDINGS_DIR, { fallthrough: false, maxAge: '1h' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RECORDINGS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowed = ['.webm', '.mp3', '.wav', '.mp4', '.ogg', '.m4a'];
      cb(null, `${Date.now()}-${crypto.randomUUID()}${allowed.includes(ext) ? ext : '.webm'}`);
    },
  }),
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const accepted = /^(audio\/|video\/webm)/i.test(file.mimetype || '');
    cb(accepted ? null : new Error('Unsupported recording type. Please record audio in a supported browser format.'), accepted);
  },
});

async function readCalls() {
  try { return JSON.parse(await fs.readFile(CALLS_FILE, 'utf8')); }
  catch { return []; }
}
async function writeCalls(calls) {
  const temp = `${CALLS_FILE}.tmp`;
  await fs.writeFile(temp, JSON.stringify(calls, null, 2), 'utf8');
  await fs.rename(temp, CALLS_FILE);
}
async function readSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8')) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
async function writeSettings(settings) {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}
function trimText(value, max = 6000) {
  return String(value ?? '').trim().slice(0, max);
}
function getTranscript(messages = []) {
  if (!Array.isArray(messages)) return '';
  return messages.slice(-100).map((message) => {
    const role = message.role === 'assistant' ? 'AI assistant' : 'Customer';
    return `${role}: ${trimText(message.text || message.content, 1200)}`;
  }).filter((line) => !line.endsWith(': ')).join('\n');
}
function heuristicStatus(transcript) {
  // Classify from customer statements only. The assistant's own demo question or sales pitch
  // must not accidentally mark the call as a demo request or an interested lead.
  const customerLines = String(transcript || '')
    .split('\n')
    .filter((line) => /^Customer:/i.test(line))
    .map((line) => line.replace(/^Customer:\s*/i, '').trim())
    .filter((line) => !/^(?:(?:yes|yeah|yep|sure|okay|ok|no|nope)(?:[\s,]+(?:you may record|you can record|please record)(?: this)?(?: conversation)?)?|i consent|i agree|you may record(?: this)?(?: conversation)?|you can record(?: this)?(?: conversation)?|please record(?: this)?(?: conversation)?)[.!?\s]*$/i.test(line));
  const text = customerLines.join(' ').toLowerCase();
  if (!text.trim()) return 'No Response';
  if (/not interested|do not call|don't call|no thanks|not a fit|stop calling|no need|don't need|do not need/.test(text)) return 'Not Interested';
  if (/book a demo|schedule a demo|demo requested|book me|set up a demo|show me a demo|please demo|want a demo|like a demo/.test(text)) return 'Demo Requested';
  if (/buy now|sign me up|let's subscribe|lets subscribe|ready to purchase|i'll purchase|i will purchase|converted|i want to subscribe|go ahead with the plan/.test(text)) return 'Converted';
  if (/follow up|call me later|next week|send me an email|send details|think about it|check with|discuss internally|contact me|reach out later|not right now/.test(text)) return 'Follow-up Required';
  if (/interested|sounds good|tell me more|more information|how much|pricing|price|features|maybe|possibly|could work|looking for|need help|want help|trying to|time management|better visibility|manage my time|save time|deal tracking|sales pipeline/.test(text)) return 'Interested';
  return 'Follow-up Required';
}
function fallbackReply(messages, settings) {
  const turns = Array.isArray(messages) ? messages : [];
  const latestMessage = [...turns].reverse().find((m) => m.role === 'user');
  const latestRaw = String(latestMessage?.content ?? latestMessage?.text ?? '').trim();
  const latest = latestRaw.toLowerCase();
  const previousAssistant = [...turns].reverse().find((m) => m.role === 'assistant')?.content?.toLowerCase() || '';
  const features = String(settings.features || 'lead tracking, follow-up reminders, and a sales dashboard').trim();
  const hasReminderFeature = /reminder|follow.?up|automation|task management/i.test(features);
  const hasDealFeature = /lead|deal|pipeline|dashboard|opportunit/i.test(features);
  const timeBenefit = hasReminderFeature
    ? 'follow-up reminders can reduce the effort of remembering every next action'
    : 'the configured details do not confirm a dedicated time-management feature';
  const dealBenefit = hasDealFeature
    ? 'deal tracking and the dashboard can make stages and next actions easier to review'
    : 'the configured details do not confirm a deal pipeline view';
  const hasTimeManagement = /time management|manage(?:ment)? (?:my |our |the )?time|save(?:s|d|ing)? time|time-consuming|too much time|waste time|productivity|manual admin|admin work|repetitive work|spend less time|time on follow.?ups/.test(latest);
  const hasDealVisibility = /visibility|see (?:our |my |the )?(?:deals|pipeline|opportunities)|deal (?:visibility|stage|status|tracking)|pipeline|stalled deals|track (?:our |my |the )?deals|where (?:each |our |my )?deals/.test(latest);

  if (!latest) return `Hello! I'm the AI sales assistant for ${settings.productName}. Is now a good time for a quick introduction?`;
  if (/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(latest) && latest.length < 55) {
    return `Hi there! I'm the AI sales assistant for ${settings.productName}. We help ${settings.targetCustomer} ${settings.valueProposition}. What would you most like to improve in your current workflow?`;
  }
  if (/\b(thanks|thank you|that's helpful|that helps|great,? thanks)\b/.test(latest)) {
    return `You're welcome. Based on what you've shared, I can focus on the parts of ${settings.productName} that are most relevant to your team rather than repeat the general overview.`;
  }
  if (/not interested|don't need|do not need|no thanks|stop calling|not a fit/.test(latest)) {
    return `Understood. I won't push further. I'll mark that you're not interested, and we can end the conversation here.`;
  }
  if (hasTimeManagement && hasDealVisibility) {
    return `That makes sense—you want to reduce manual sales admin and see where each deal stands. ${settings.productName} includes ${features}; ${timeBenefit}, while ${dealBenefit}. Would an example of mapping one deal from lead to follow-up be useful?`;
  }
  if (hasTimeManagement) {
    return `Got it—your priority is getting time back from repetitive sales work. ${settings.productName} includes ${features}; ${timeBenefit}. A practical test is to see how many steps it removes from one recurring task.`;
  }
  if (hasDealVisibility) {
    return `Clear deal visibility is the goal. ${settings.productName} includes ${features}; ${dealBenefit}. The most useful starting point is to see each deal's current stage and next action, if supported by your setup.`;
  }
  if (/price|pricing|cost|how much|expensive|budget/.test(latest)) {
    return `The listed price is ${settings.price}. That includes ${features}. Whether it is worthwhile depends on how much manual work it removes from your current process; I can help you compare the features with the workflow you described.`;
  }
  if (/feature|what does|how does|include|capabilit|what can|tell me about/.test(latest)) {
    return `${settings.productName} includes ${features}. It is designed for ${settings.targetCustomer} who want to ${settings.valueProposition}. Rather than list everything, I can explain how a specific feature would fit your use case.`;
  }
  if (/demo|show me|schedule|book/.test(latest)) {
    return `Absolutely. ${settings.callToAction} I can note your demo request so the team can follow up with a suitable time; no appointment has been booked automatically.`;
  }
  if (/integration|integrate|connect to|works with|compatible with|api/.test(latest)) {
    return `I don't have verified integration details in the product information, so I don't want to promise compatibility that may not exist. The configured features are ${features}. The team can confirm a specific integration during follow-up.`;
  }
  if (/how would|how can|how could|give me an example|example|walk me through|show how/.test(latest)) {
    return `For example, a team could keep a lead and its deal stage in ${settings.productName}, set the next follow-up reminder, and review the pipeline dashboard to see which opportunities need attention. That workflow uses the configured features: ${features}.`;
  }
  if (/busy|later|not now|no time/.test(latest)) {
    return `No problem. I can keep this brief. ${settings.productName} is intended to ${settings.valueProposition}. Would a follow-up at a more convenient time be better, or should I close this out?`;
  }
  if (/team|company|business|we use|currently use|crm|sales|lead|follow.?up|spreadsheet|workflow/.test(latest)) {
    return `Thanks, that gives me useful context. Based on what you've said, ${settings.productName} may help with ${features}. I'll focus on the part you mentioned instead of starting the qualification questions again.`;
  }

  // Do not loop back to the same canned qualifying question over and over.
  if (/what would matter most|which part of your current process|how do you currently manage|what takes the most time/.test(previousAssistant)) {
    return `Thanks for explaining. I can tailor the discussion to your situation. ${settings.productName} is configured around ${features}; the best next step is to connect one of those features to the challenge you just mentioned.`;
  }
  return `Thanks for sharing that. ${settings.productName} is designed to ${settings.valueProposition}, with ${features}. I’ll keep the discussion focused on your request and avoid repeating the introduction.`;
}

async function openAIChat(messages, settings, { jsonMode = false, maxTokens = 260 } = {}) {
  const system = `You are a helpful, ethical AI voice sales representative for the SaaS product below. Introduce yourself as an AI only in the opening; do not repeat the introduction later. Keep spoken replies concise (usually 1–3 sentences), natural, and directly responsive to the customer's latest message. Acknowledge the customer's actual words and answer the request first. If they name multiple needs, address them together. Do not fall back to a generic pitch or ask them to repeat/prioritize needs they already described. Ask at most one relevant follow-up question, and do not ask a question in every turn when a useful direct answer is possible. Track which questions were already asked and answered, never repeat the same question, and do not re-run a qualification script. Explain only verified details supplied here, never invent integrations or guarantees, respect a refusal immediately, and never pressure the customer. If asked about something not included in the supplied product details, clearly say that you do not have verified information. Avoid markdown because the reply will be spoken aloud.\n\nProduct name: ${settings.productName}\nDescription: ${settings.description}\nTarget customer: ${settings.targetCustomer}\nValue proposition: ${settings.valueProposition}\nPrice: ${settings.price}\nFeatures: ${settings.features}\nCTA: ${settings.callToAction}\n\nThe call may be recorded only after the customer explicitly agrees. Do not claim a purchase or demo is booked; you can note a request for follow-up. Use the language indicated by the current conversation; if unclear, use natural English.`;
  const body = {
    model: CHAT_MODEL,
    messages: [{ role: 'system', content: system }, ...messages.slice(-28).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: trimText(m.content ?? m.text, 1400),
    }))],
    temperature: 0.5,
    max_tokens: maxTokens,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error?.message || `AI provider returned HTTP ${response.status}`;
    throw new Error(message);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(OPENAI_API_KEY), ttsConfigured: Boolean(OPENAI_API_KEY), chatModel: CHAT_MODEL });
});

app.get('/api/settings', async (_req, res) => {
  const settings = await readSettings();
  res.json({ ...settings, aiConfigured: Boolean(OPENAI_API_KEY), ttsConfigured: Boolean(OPENAI_API_KEY) });
});

app.put('/api/settings', async (req, res) => {
  const current = await readSettings();
  const keys = ['productName', 'description', 'targetCustomer', 'valueProposition', 'price', 'features', 'callToAction', 'language'];
  const updated = { ...current };
  for (const key of keys) {
    if (req.body?.[key] !== undefined) updated[key] = trimText(req.body[key], key === 'description' || key === 'features' ? 1200 : 240);
  }
  if (!updated.productName) return res.status(400).json({ error: 'Product name is required.' });
  await writeSettings(updated);
  res.json({ ...updated, aiConfigured: Boolean(OPENAI_API_KEY), ttsConfigured: Boolean(OPENAI_API_KEY) });
});

app.post('/api/chat', async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const settings = await readSettings();
  if (OPENAI_API_KEY) {
    try {
      const reply = await openAIChat(messages, settings);
      return res.json({ reply, mode: 'ai' });
    } catch (error) {
      console.error('Chat provider error:', error.message);
      return res.status(502).json({ error: 'The AI provider could not answer this turn. Check your API key, account access, and model configuration.', detail: error.message });
    }
  }
  return res.json({ reply: fallbackReply(messages, settings), mode: 'demo' });
});

app.post('/api/tts', async (req, res) => {
  const text = trimText(req.body?.text, 4096);
  if (!text) return res.status(400).json({ error: 'Text is required.' });
  if (!OPENAI_API_KEY) return res.status(503).json({ error: 'Text-to-speech is not configured. Browser speech will be used instead.' });
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text, instructions: 'Use a warm, engaging, confident, friendly conversational delivery. Sound attentive and genuinely helpful, with natural variation in intonation, clear pronunciation, and a relaxed medium pace. Smile slightly in the voice; avoid sounding robotic, overly formal, pushy, or exaggerated. Pause briefly between ideas. This is an AI sales assistant, so be professional, transparent, and never pressure the customer.' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return res.status(502).json({ error: payload?.error?.message || `Speech provider returned HTTP ${response.status}` });
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    const audio = Buffer.from(await response.arrayBuffer());
    res.send(audio);
  } catch (error) {
    console.error('TTS provider error:', error.message);
    res.status(502).json({ error: 'Text-to-speech failed.' });
  }
});

app.post('/api/analyze', async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const transcript = getTranscript(messages);
  const settings = await readSettings();
  if (!transcript.trim()) {
    return res.json({ summary: 'No customer conversation was captured.', customerNeeds: [], objections: [], nextSteps: ['Try another call and invite the customer to respond.'], status: 'No Response', mode: OPENAI_API_KEY ? 'ai' : 'demo' });
  }
  if (OPENAI_API_KEY) {
    try {
      const raw = await openAIChat([
        { role: 'user', content: `Analyze this sales call for ${settings.productName}. Return JSON only with keys summary (string, max 45 words), customerNeeds (array of up to 3 concise strings), objections (array of up to 3 concise strings), nextSteps (array of 1–3 concise strings), status (one exact value from: Converted, Interested, Follow-up Required, Not Interested, Demo Requested, No Response). Base the status only on explicit evidence. A demo is requested only if the customer asks for one; Converted only when they clearly agree to buy/sign up. Do not infer a completed booking.\n\nTranscript:\n${transcript.slice(0, 12000)}` },
      ], settings, { jsonMode: true, maxTokens: 400 });
      const parsed = JSON.parse(raw);
      const statuses = ['Converted', 'Interested', 'Follow-up Required', 'Not Interested', 'Demo Requested', 'No Response'];
      return res.json({
        summary: trimText(parsed.summary, 600) || 'Call completed. Review transcript for details.',
        customerNeeds: Array.isArray(parsed.customerNeeds) ? parsed.customerNeeds.slice(0, 3).map((v) => trimText(v, 180)) : [],
        objections: Array.isArray(parsed.objections) ? parsed.objections.slice(0, 3).map((v) => trimText(v, 180)) : [],
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.slice(0, 3).map((v) => trimText(v, 180)) : ['Review the transcript and confirm a next step.'],
        status: statuses.includes(parsed.status) ? parsed.status : heuristicStatus(transcript),
        mode: 'ai',
      });
    } catch (error) {
      console.error('Analysis provider error:', error.message);
      return res.status(502).json({ error: 'AI summary generation failed. The call is still available in the current screen; try ending/saving again or check your API configuration.', detail: error.message });
    }
  }
  const customerLines = messages.filter((m) => m.role === 'user').map((m) => trimText(m.text || m.content, 500)).filter((line) => !/^(yes|yeah|yep|sure|okay|ok|no|nope|i consent|i agree|you can record(?: this)?(?: conversation)?|yes,? you may record(?: this conversation)?)[.!\s]*$/i.test(line));
  const lower = customerLines.join(' ').toLowerCase();
  const needs = [];
  if (/price|pricing|cost|expensive/.test(lower)) needs.push('Asked about pricing or cost');
  if (/feature|integration|include|how does|what does/.test(lower)) needs.push('Requested product or feature details');
  if (/team|company|crm|sales|workflow|lead|follow.?up|spreadsheet/.test(lower)) needs.push('Discussed current team or sales workflow');
  if (/time management|manage(?:ment)? (?:my |our )?time|save time|time-consuming|productivity|manual admin|repetitive work/.test(lower)) needs.push('Wants to reduce time spent on manual work');
  if (/visibility|deal visibility|pipeline|deal stage|track (?:our |my )?deals|stalled deals/.test(lower)) needs.push('Wants better visibility into deals and pipeline progress');
  const objections = [];
  if (/expensive|costly|budget|price/.test(lower)) objections.push('Pricing or budget may be a concern');
  if (/busy|later|not now|no time/.test(lower)) objections.push('Timing or availability concern');
  if (/not interested|no thanks|don't need|do not need/.test(lower)) objections.push('Customer expressed disinterest');
  const status = heuristicStatus(transcript);
  const nextSteps = status === 'Demo Requested' ? ['Contact the customer to confirm a suitable demo time.']
    : status === 'Interested' ? ['Send product details and confirm the most relevant use case.']
      : status === 'Follow-up Required' ? ['Follow up at a customer-approved time with relevant details.']
        : status === 'Not Interested' ? ['Respect the decision and do not continue sales outreach unless requested.']
          : status === 'Converted' ? ['Verify purchase/sign-up in the sales system; this demo does not process transactions.']
            : ['Review the transcript and consider one respectful follow-up if appropriate.'];
  res.json({
    summary: customerLines.length ? `Demo-mode review of ${customerLines.length} customer response${customerLines.length === 1 ? '' : 's'}. ${customerLines.slice(0, 2).join(' ').slice(0, 260)}` : 'No customer response was captured during this call.',
    customerNeeds: needs.length ? needs : (customerLines.length ? ['Customer participated; confirm specific needs during follow-up.'] : []),
    objections,
    nextSteps,
    status,
    mode: 'demo',
  });
});

app.get('/api/calls', async (_req, res) => {
  const calls = await readCalls();
  res.json(calls.slice().sort((a, b) => new Date(b.startedAt || b.createdAt || 0) - new Date(a.startedAt || a.createdAt || 0)));
});

app.get('/api/calls/:id', async (req, res) => {
  const calls = await readCalls();
  const call = calls.find((item) => item.id === req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found.' });
  res.json(call);
});

app.post('/api/calls', upload.single('recording'), async (req, res) => {
  let payload;
  try { payload = JSON.parse(req.body?.payload || '{}'); }
  catch { if (req.file) await fs.unlink(req.file.path).catch(() => {}); return res.status(400).json({ error: 'Call payload is invalid.' }); }
  // Enforce consent on the server too; never trust the browser alone for recordings.
  if (!payload.recordingConsent && req.file) {
    await fs.unlink(req.file.path).catch(() => {});
    req.file = undefined;
  }
  const messages = Array.isArray(payload.messages) ? payload.messages.slice(-100) : [];
  const transcript = getTranscript(messages);
  const call = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    startedAt: payload.startedAt || new Date().toISOString(),
    endedAt: payload.endedAt || new Date().toISOString(),
    durationSeconds: Math.min(24 * 60 * 60, Math.max(0, Number(payload.durationSeconds) || 0)),
    productName: trimText(payload.productName || (await readSettings()).productName, 120),
    customerName: trimText(payload.customerName || 'Website caller', 100),
    messages,
    transcript,
    summary: payload.summary || { summary: 'Summary not available.', customerNeeds: [], objections: [], nextSteps: [], status: 'No Response' },
    status: ['Converted', 'Interested', 'Follow-up Required', 'Not Interested', 'Demo Requested', 'No Response'].includes(payload.status) ? payload.status : (payload.summary?.status || 'No Response'),
    recordingUrl: req.file ? `/recordings/${path.basename(req.file.path)}` : null,
    recordingConsent: Boolean(payload.recordingConsent),
    recordingMimeType: req.file?.mimetype || null,
    mode: payload.mode || (OPENAI_API_KEY ? 'ai' : 'demo'),
  };
  const calls = await readCalls();
  calls.push(call);
  await writeCalls(calls.slice(-300));
  res.status(201).json(call);
});

app.delete('/api/calls/:id', async (req, res) => {
  const calls = await readCalls();
  const call = calls.find((item) => item.id === req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found.' });
  const remaining = calls.filter((item) => item.id !== req.params.id);
  await writeCalls(remaining);
  if (call.recordingUrl) await fs.unlink(path.join(RECORDINGS_DIR, path.basename(call.recordingUrl))).catch(() => {});
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error('Request error:', err.message);
  const code = err instanceof multer.MulterError ? 400 : 500;
  res.status(code).json({ error: err.message || 'Server error.' });
});

const distPath = path.resolve(__dirname, '../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`SalesPilot API ready on http://localhost:${PORT}`);
  console.log(OPENAI_API_KEY ? `AI mode enabled (${CHAT_MODEL}).` : 'Demo mode: set OPENAI_API_KEY in .env to enable AI answers and natural voice.');
});

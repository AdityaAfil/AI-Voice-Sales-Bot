# SalesPilot — AI Voice Sales Bot

A full-stack implementation of the Sankar Group **Build an AI Voice Sales Bot** assignment. It is built to be easy to run, customize, and deploy rather than being a static mockup.

## Included

- **Real voice session in a supported browser:** microphone input, speech recognition, spoken assistant replies, and a live text transcript.
- **Consent-first recording:** the assistant identifies itself as AI and asks permission to record. The audio recorder starts only after the customer explicitly says yes. A declined or missing consent means no audio file is saved.
- **End-call workflow:** creates a summary, extracts likely needs and objections, chooses one of the assignment's six sales statuses, and saves the conversation.
- **Call history:** searchable/filterable call table, recording playback when a recording exists, transcript export, summary, next steps, and delete controls.
- **Product setup:** edit SaaS name, description, customer profile, price, features, CTA, and speech-input language.
- **Server-side key handling:** API keys stay in `.env`, never in React source code.
- **Responsive dashboard:** overview metrics, call console, recent calls, pipeline status, setup and history views.

## Tech stack

- React + Vite + plain CSS
- Node.js + Express
- OpenAI Chat Completions for sales turns and structured call summaries (optional, requires an API key and billing/access on the OpenAI project)
- OpenAI Audio Speech API for natural AI voice (optional; defaults to the warm, expressive `marin` voice, configurable with `OPENAI_TTS_VOICE`)
- Browser `SpeechRecognition`/`webkitSpeechRecognition`, `SpeechSynthesis`, `MediaRecorder`, and Web Audio APIs
- JSON-file persistence for settings and call metadata; audio recordings stored on the server filesystem

## Run locally

Prerequisites: Node.js 20+ and npm. For voice calling, use desktop Chrome or another browser that supports the required microphone and speech APIs. Microphone permissions require `localhost` or HTTPS.

```bash
npm install
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. The React development server proxies `/api` and `/recordings` to the Express server on port `8787`.

### Enable real AI replies and natural AI voice

1. Create an API key from your OpenAI project and ensure that project has API access/billing enabled.
2. Put the key in the server-side `.env` file:

```dotenv
OPENAI_API_KEY=your_key_here
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=marin
PORT=8787
DATA_DIR=./server/data
```

3. Restart the server. The top-right indicator should change from **Demo mode** to **AI connected**.

Never commit `.env` or put a provider key into frontend JavaScript. `.gitignore` excludes `.env` and generated call data.

Without an API key, the project still runs in **demo mode** with rule-based conversational replies, browser-generated speech, local recording, summaries based on the transcript, and call history. The interface marks this mode so it is not misrepresented as a live LLM integration.

## Conversation and playback improvements

- AI-mode instructions explicitly prioritize the customer's latest request, handle multiple needs together, avoid repeated qualification questions, and do not claim unconfigured product features.
- Demo-mode replies recognize common intents such as time management, reducing repetitive sales admin, and better deal visibility. Demo mode remains keyword-based; flexible, open-ended interpretation requires an API key.
- API and speech requests have timeouts so the call interface is less likely to remain stuck indefinitely in a loading or speaking state.
- Call history includes a dedicated player with play/pause, seek/progress, 10-second rewind/forward, and playback speed controls (0.75x–2x).
- Demo-mode recording playback warns that browser-generated AI speech may not be present in the saved audio. With natural AI voice enabled, the app attempts to mix the AI audio into the consented recording when supported by the browser.

## Test a call

1. Open **Product setup** and edit the product name, price, features, and target customer to match the SaaS product you want to sell.
2. Return to **Overview**, optionally enter a call label, then click **Start call** and allow microphone access.
3. The assistant discloses that it is AI and asks for recording consent. Say or type **yes** to begin recording, or **no** to decline. Typing customer answers is supported if the browser lacks speech recognition.
4. Respond to the agent's qualifying questions, ask about features/pricing, or request a demo. The transcript updates during the conversation.
5. Click **End call**. The app generates the summary and status and saves the record to **Call history**.
6. In call history, inspect the transcript and summary, play/pause a saved recording, seek within it, change speed, skip 10 seconds forward/backward, export the transcript, or delete the call and audio file.

### Recording notes

- Audio is **not recorded before clear customer consent**. A call ended before consent can still be saved as a text transcript, without an audio recording.
- The browser records microphone audio and, where the browser supports capture of the AI audio element, mixes the AI voice into the same recording. If the app falls back to built-in browser speech, that synthesized output cannot reliably be captured; the audio file may contain microphone audio only. Test the actual browser recording before presenting the submission.
- Recording includes a spoken AI disclosure and consent check, but you are responsible for informing the customer and following all applicable consent, privacy, retention, and data-protection requirements.
- The app's sales status is a suggested classification, not a transaction. It does not take payments or actually book a demo with a calendar.

## Production / web deployment (single Node web service)

A single Node service serves both the built React website and the API:

```bash
npm install
npm run build
npm start
```

For a platform such as Render:

- Create a **Web Service** from the repository.
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Add environment variables `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, and `OPENAI_TTS_MODEL` in the host dashboard.
- Attach a persistent disk (if your hosting plan supports it), mount it at `/var/data`, and set `DATA_DIR=/var/data`.
- Use the HTTPS URL generated by your host. HTTPS is required by many browser microphone/speech features outside localhost.

The app writes `calls.json`, `settings.json`, and `recordings/` under `DATA_DIR`. If the hosting filesystem is ephemeral, call history and recordings can be lost on redeploy/restart; use a persistent disk or replace this storage layer with a managed database/object store for production. Keep the recordings private and restrict access before using real customers. This starter uses a public static recording URL and is suitable for a controlled assignment demo, not sensitive production customer audio as-is.

## Project layout

```text
ai-voice-sales-bot/
├── server/
│   ├── index.js           # Express API, AI/voice provider proxy, call persistence
│   └── data/              # Generated locally (settings, calls, recordings)
├── src/
│   ├── App.jsx             # Dashboard, call state machine, voice interaction, history
│   ├── main.jsx            # React entry point
│   └── styles.css          # Responsive interface
├── .env.example
├── index.html
├── package.json
└── vite.config.js
```

## Assignment checklist

- [x] Interactive voice conversation, with text fallback
- [x] AI identifies itself; clear recording-consent flow
- [x] Live chat transcript
- [x] Start/End Call controls, duration and status
- [x] Record and store audio after consent where supported
- [x] Call summary, needs, objections, next steps
- [x] All six required sales statuses
- [x] Call history with saved transcript, summary, status and recording playback
- [x] Product configuration
- [x] Responsive working website code

**Submission reminder:** deploy the project and record a short walkthrough video showing the live voice interaction, consent, recording playback, AI summary, sales status, and history. A public website URL cannot be created until you deploy it under your own hosting account and supply any API credentials.

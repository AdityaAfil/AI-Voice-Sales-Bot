import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, AudioLines, BarChart3,
  CalendarCheck2, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, FastForward, Pause, Rewind,
  Command, Database, Download, FileAudio, FileText, Headphones, LayoutDashboard,
  LoaderCircle, MessageSquare, Mic, MicOff, MoreHorizontal, Phone, PhoneCall,
  PhoneOff, Play, Plus, Search, Send, Settings2, ShieldCheck, Sparkles, Target,
  TrendingUp, Users, Volume2, X, Save, ExternalLink, CircleHelp, Menu,
} from 'lucide-react';

const STATUSES = ['Converted', 'Interested', 'Follow-up Required', 'Not Interested', 'Demo Requested', 'No Response'];
const LANGUAGES = [
  { label: 'English (India)', value: 'en-IN' },
  { label: 'Hindi', value: 'hi-IN' },
  { label: 'English (US)', value: 'en-US' },
  { label: 'Telugu', value: 'te-IN' },
];
const timeLabel = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const dateLabel = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
const durationLabel = (seconds = 0) => {
  const n = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
};
const audioTimeLabel = (seconds = 0) => {
  if (!Number.isFinite(Number(seconds))) return '00:00';
  return durationLabel(seconds);
};
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((v) => v[0]?.toUpperCase() || '').join('') || 'WC';
const statusClass = (status = '') => status.toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '');
const isYes = (text) => /\b(yes|yeah|yep|sure|okay|ok|go ahead|that's fine|that is fine|i consent|i agree|agree|you can|fine with me)\b/i.test(text);
const isNo = (text) => /\b(no|nope|don't|do not|not okay|not comfortable|i refuse|rather not|not agree)\b/i.test(text);

const NAV = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'calls', label: 'Call history', icon: Headphones },
  { id: 'settings', label: 'Product setup', icon: Settings2 },
];

function App() {
  const [page, setPage] = useState('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [health, setHealth] = useState({ aiConfigured: false, ttsConfigured: false });
  const [settings, setSettings] = useState({ productName: 'OrbitDesk', description: '', targetCustomer: '', valueProposition: '', price: '', features: '', callToAction: '', language: 'en-IN' });
  const [settingsDraft, setSettingsDraft] = useState(settings);
  const [saveState, setSaveState] = useState('idle');
  const [calls, setCalls] = useState([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState('All calls');
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [callStatus, setCallStatus] = useState('idle');
  const callStatusRef = useRef('idle');
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef([]);
  const [customerName, setCustomerName] = useState('Website caller');
  const [inputText, setInputText] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [thinking, setThinking] = useState(false);
  const thinkingRef = useRef(false);
  const [speaking, setSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recordingActiveRef = useRef(false);
  const [consentGranted, setConsentGranted] = useState(false);
  const [recordingAllowed, setRecordingAllowed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [toast, setToast] = useState('');
  const [savedCall, setSavedCall] = useState(null);
  const [selectedTranscriptTab, setSelectedTranscriptTab] = useState('transcript');
  const [playbackId, setPlaybackId] = useState(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [healthMessage, setHealthMessage] = useState('');

  const recognitionRef = useRef(null);
  const micStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingBlobRef = useRef(null);
  const stopRecordingResolveRef = useRef(null);
  const audioContextRef = useRef(null);
  const recordingDestinationRef = useRef(null);
  const currentAudioRef = useRef(null);
  const historyAudioRef = useRef(null);
  const historyAudioCallRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const currentAudioSourceRef = useRef(null);
  const currentCallStartedRef = useRef(null);
  const currentModeRef = useRef('demo');
  const endingCallRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const handleCustomerMessageRef = useRef(null);
  const timerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const endCallRef = useRef(null);

  const setStatus = (next) => {
    callStatusRef.current = next;
    setCallStatus(next);
  };
  const isLive = () => ['awaiting-consent', 'active', 'consent-declined'].includes(callStatusRef.current);
  const appendMessage = useCallback((role, text, extra = {}) => {
    const item = { id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, role, text, at: new Date().toISOString(), ...extra };
    const next = [...messagesRef.current, item];
    messagesRef.current = next;
    setMessages(next);
    return item;
  }, []);

  const showToast = (message) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2800);
  };

  const loadCalls = useCallback(async () => {
    try {
      const response = await fetch('/api/calls');
      if (!response.ok) throw new Error('Could not load call history.');
      setCalls(await response.json());
    } catch (error) {
      setHealthMessage(error.message || 'Server is not reachable. Start the app server, then refresh.');
    }
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      const [healthResponse, settingsResponse] = await Promise.all([fetch('/api/health'), fetch('/api/settings')]);
      const apiHealth = await healthResponse.json();
      const productSettings = await settingsResponse.json();
      setHealth(apiHealth);
      setSettings(productSettings);
      setSettingsDraft(productSettings);
      setHealthMessage('');
    } catch {
      setHealthMessage('The API server is unavailable. Run the project using the setup instructions in README.md.');
    }
    await loadCalls();
  }, [loadCalls]);

  useEffect(() => { loadInitial(); }, [loadInitial]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => {
    const transcript = transcriptContainerRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, thinking, speaking]);
  useEffect(() => {
    if (page !== 'calls' && historyAudioRef.current) {
      historyAudioRef.current.pause();
      setPlaybackPlaying(false);
    }
  }, [page]);
  useEffect(() => {
    if (!isLive()) return undefined;
    timerRef.current = setInterval(() => {
      if (currentCallStartedRef.current) setSeconds(Math.floor((Date.now() - currentCallStartedRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [callStatus]);
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    try { recognitionRef.current?.stop(); } catch { /* no-op */ }
    try { recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop(); } catch { /* no-op */ }
    try { micStreamRef.current?.getTracks().forEach((track) => track.stop()); } catch { /* no-op */ }
    try { audioContextRef.current?.close(); } catch { /* no-op */ }
    try {
      const historyAudio = historyAudioRef.current;
      if (historyAudio) {
        historyAudio.onplay = null; historyAudio.onpause = null; historyAudio.ontimeupdate = null;
        historyAudio.onloadedmetadata = null; historyAudio.onended = null; historyAudio.onerror = null;
        historyAudio.pause();
      }
    } catch { /* no-op */ }
    historyAudioRef.current = null;
    window.speechSynthesis?.cancel();
  }, []);

  const bootSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const recognition = new SpeechRecognition();
    recognition.lang = settings.language || 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      if (!isLive() || isSpeakingRef.current || endingCallRef.current) return;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          const transcript = result[0]?.transcript?.trim();
          if (transcript) handleCustomerMessageRef.current?.(transcript, 'voice');
        }
      }
    };
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted' && event.error !== 'audio-capture') {
        setErrorMessage(event.error === 'not-allowed' ? 'Microphone permission was denied. You can still use the text box during a call.' : `Speech recognition issue: ${event.error}. Type the customer reply instead.`);
      }
    };
    recognition.onend = () => {
      if (isLive() && !isSpeakingRef.current && !endingCallRef.current) {
        try { recognition.start(); } catch { /* already starting */ }
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* browser may already be starting */ }
    return recognition;
  };

  const startRecognition = () => {
    if (!isLive()) return;
    const rec = recognitionRef.current;
    if (!rec) { bootSpeechRecognition(); return; }
    try { rec.start(); } catch { /* already started */ }
  };

  const fallbackSpeak = (text, resumeListening) => new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) {
      setSpeaking(false); isSpeakingRef.current = false;
      if (resumeListening) startRecognition();
      resolve(); return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = settings.language || 'en-IN';
    // Browser speech is a fallback only. Prefer a natural-sounding voice in the
    // requested language when one is installed, rather than blindly taking the first.
    utterance.rate = 0.98;
    utterance.pitch = 1.08;
    const voices = window.speechSynthesis.getVoices();
    const prefix = (settings.language || 'en-IN').split('-')[0].toLowerCase();
    const languageVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith(prefix));
    const preferredNames = /natural|neural|aria|jenny|samantha|zira|ava|emma|sonia|google.*female|female/i;
    const voice = languageVoices.find((v) => v.lang?.toLowerCase() === settings.language?.toLowerCase() && preferredNames.test(v.name))
      || languageVoices.find((v) => preferredNames.test(v.name))
      || languageVoices.find((v) => v.lang?.toLowerCase() === settings.language?.toLowerCase())
      || languageVoices[0];
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      setSpeaking(false); isSpeakingRef.current = false;
      if (resumeListening && isLive()) startRecognition();
      resolve();
    };
    utterance.onerror = () => {
      setSpeaking(false); isSpeakingRef.current = false;
      if (resumeListening && isLive()) startRecognition();
      resolve();
    };
    window.speechSynthesis.speak(utterance);
  });

  const speakText = async (text, resumeListening = true) => {
    if (!text) { if (resumeListening) startRecognition(); return; }
    isSpeakingRef.current = true;
    setSpeaking(true);
    try { recognitionRef.current?.stop(); } catch { /* no-op */ }
    if (health.ttsConfigured) {
      try {
        const controller = new AbortController();
        const requestTimeout = setTimeout(() => controller.abort(), 20000);
        let response;
        try {
          response = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: controller.signal });
        } finally { clearTimeout(requestTimeout); }
        if (!response.ok) throw new Error('Voice endpoint unavailable');
        const blob = await response.blob();
        if (!blob.size) throw new Error('The voice service returned an empty audio file.');
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        if (recordingActiveRef.current && recordingDestinationRef.current && typeof audio.captureStream === 'function') {
          audio.addEventListener('play', () => {
            try {
              const captured = audio.captureStream();
              const source = audioContextRef.current?.createMediaStreamSource(captured);
              if (source && recordingDestinationRef.current) {
                source.connect(recordingDestinationRef.current);
                currentAudioSourceRef.current = source;
              }
            } catch (error) { console.warn('Unable to mix AI voice into recording:', error); }
          }, { once: true });
        }
        try {
          await new Promise((resolve, reject) => {
            let settled = false;
            const finish = () => { if (settled) return; settled = true; resolve(); };
            const fail = () => { if (settled) return; settled = true; reject(new Error('AI voice playback failed.')); };
            audio.onended = finish;
            audio.onerror = fail;
            audio.onpause = () => { if (endingCallRef.current) finish(); };
            audio.play().catch(fail);
          });
        } finally {
          currentAudioSourceRef.current?.disconnect?.();
          currentAudioSourceRef.current = null;
          if (currentAudioRef.current === audio) currentAudioRef.current = null;
          URL.revokeObjectURL(url);
        }
        setSpeaking(false); isSpeakingRef.current = false;
        if (resumeListening && isLive()) startRecognition();
        return;
      } catch (error) {
        console.warn('Natural voice unavailable; using browser speech.', error);
        if (endingCallRef.current) {
          setSpeaking(false); isSpeakingRef.current = false;
          return;
        }
      }
    }
    await fallbackSpeak(text, resumeListening);
  };

  const startRecordingAfterConsent = async () => {
    const stream = micStreamRef.current;
    if (!stream) throw new Error('Microphone stream is unavailable.');
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      const context = new AudioContextClass();
      await context.resume().catch(() => {});
      audioContextRef.current = context;
      const destination = context.createMediaStreamDestination();
      const microphoneSource = context.createMediaStreamSource(stream);
      microphoneSource.connect(destination);
      recordingDestinationRef.current = destination;
      const supportedTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mimeType = supportedTypes.find((type) => window.MediaRecorder?.isTypeSupported?.(type));
      const combinedStream = destination.stream;
      const recorder = mimeType ? new MediaRecorder(combinedStream, { mimeType }) : new MediaRecorder(combinedStream);
      recordingChunksRef.current = [];
      recordingBlobRef.current = null;
      recorder.ondataavailable = (event) => { if (event.data?.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        recordingBlobRef.current = new Blob(recordingChunksRef.current, { type });
        setIsRecording(false);
        recordingActiveRef.current = false;
        if (stopRecordingResolveRef.current) {
          stopRecordingResolveRef.current(recordingBlobRef.current);
          stopRecordingResolveRef.current = null;
        }
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      recordingActiveRef.current = true;
    } else {
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recordingBlobRef.current = null;
      recorder.ondataavailable = (event) => { if (event.data?.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        recordingBlobRef.current = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setIsRecording(false);
        recordingActiveRef.current = false;
        if (stopRecordingResolveRef.current) {
          stopRecordingResolveRef.current(recordingBlobRef.current);
          stopRecordingResolveRef.current = null;
        }
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      recordingActiveRef.current = true;
    }
    setConsentGranted(true);
    setStatus('active');
    appendMessage('assistant', 'Thank you for confirming. I’ll only record from this point. Let me ask one quick question: how are you currently managing leads and sales follow-ups?');
    await speakText('Thank you for confirming. I’ll only record from this point. Let me ask one quick question: how are you currently managing leads and sales follow-ups?', true);
  };

  const handleCustomerMessage = async (text, source = 'text') => {
    const clean = String(text || '').trim();
    if (!clean || !isLive() || endingCallRef.current) return;
    if (thinking || thinkingRef.current) return;
    appendMessage('user', clean, { source });
    setInputText('');
    setErrorMessage('');
    if (callStatusRef.current === 'awaiting-consent') {
      if (isNo(clean) && !isYes(clean)) {
        setStatus('consent-declined');
        appendMessage('assistant', 'No problem. I will not record this conversation. You can end the call now.');
        await speakText('No problem. I will not record this conversation. You can end the call now.', false);
        try { recognitionRef.current?.stop(); } catch { /* no-op */ }
        return;
      }
      if (isYes(clean)) {
        try { await startRecordingAfterConsent(); }
        catch (error) {
          setErrorMessage(`Recording could not start: ${error.message}. Check browser microphone permissions and try again.`);
          setStatus('active');
          appendMessage('assistant', 'Thanks. Recording is unavailable, but we can still continue by voice or text. How are you managing sales follow-ups today?');
          await speakText('Thanks. Recording is unavailable, but we can still continue by voice or text. How are you managing sales follow-ups today?', true);
        }
        return;
      }
      appendMessage('assistant', 'Before I continue, may I record this conversation? Please say “yes” to agree, or “no” to continue without recording.');
      await speakText('Before I continue, may I record this conversation? Please say yes to agree, or no to continue without recording.', true);
      return;
    }
    if (callStatusRef.current === 'consent-declined') return;
    thinkingRef.current = true;
    setThinking(true);
    try {
      const convo = [...messagesRef.current].map((m) => ({ role: m.role, content: m.text }));
      const controller = new AbortController();
      const requestTimeout = setTimeout(() => controller.abort(), 30000);
      let response;
      try {
        response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: convo }), signal: controller.signal });
      } finally { clearTimeout(requestTimeout); }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The AI assistant could not respond.');
      if (endingCallRef.current || !isLive()) return;
      currentModeRef.current = data.mode || currentModeRef.current;
      appendMessage('assistant', data.reply || 'I’m sorry, I didn’t catch that. Could you say that again?');
      setThinking(false);
      await speakText(data.reply || 'I’m sorry, I didn’t catch that. Could you say that again?', true);
    } catch (error) {
      if (!endingCallRef.current) {
        appendMessage('assistant', 'I’m having trouble reaching the AI service right now. You can try again, or continue with a text reply after checking the server setup.');
        const message = error.name === 'AbortError' ? 'The assistant took too long to respond. Try sending your message again.' : (error.message || 'AI reply failed.');
        setErrorMessage(message);
        setThinking(false);
        await speakText('I’m having trouble responding right now. You can try sending that message again.', true);
      }
    } finally {
      thinkingRef.current = false;
      setThinking(false);
    }
  };
  handleCustomerMessageRef.current = handleCustomerMessage;

  const startCall = async () => {
    setErrorMessage(''); setSavedCall(null); setSelectedTranscriptTab('transcript');
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Microphone access is unavailable in this browser/context. Open the site on localhost or HTTPS, or use a supported desktop browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micStreamRef.current = stream;
      messagesRef.current = [];
      setMessages([]);
      thinkingRef.current = false;
      setThinking(false);
      setSeconds(0); setConsentGranted(false); setRecordingAllowed(false); setIsRecording(false);
      currentCallStartedRef.current = Date.now();
      currentModeRef.current = health.aiConfigured ? 'ai' : 'demo';
      endingCallRef.current = false;
      setStatus('awaiting-consent');
      const greeting = `Hello, this is an AI sales assistant calling about ${settings.productName}. This conversation may be recorded after you agree, to help with accurate follow-up. Is it okay if I record our conversation? Please say yes or no.`;
      appendMessage('assistant', greeting);
      if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) bootSpeechRecognition();
      else setErrorMessage('This browser does not support speech recognition. Use the text input below to simulate the customer’s replies.');
      await speakText(greeting, true);
    } catch (error) {
      setStatus('idle');
      const denied = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';
      setErrorMessage(denied ? 'Microphone permission was denied. Allow microphone access in your browser settings and try again.' : `Could not start the call: ${error.message}`);
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
  };

  const stopRecorder = () => new Promise((resolve) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') { resolve(recordingBlobRef.current); return; }
    stopRecordingResolveRef.current = resolve;
    try { recorder.requestData(); } catch { /* some browsers do not support requestData */ }
    try { recorder.stop(); } catch { setIsRecording(false); resolve(recordingBlobRef.current); }
  });

  const endCall = async () => {
    if (callStatusRef.current === 'idle' || callStatusRef.current === 'processing') return;
    endingCallRef.current = true;
    setStatus('processing');
    setThinking(false);
    try { recognitionRef.current?.stop(); } catch { /* no-op */ }
    window.speechSynthesis?.cancel();
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    setSpeaking(false); isSpeakingRef.current = false;
    let recordingBlob = recordingBlobRef.current;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recordingBlob = await stopRecorder();
    if (recordingBlob && recordingBlob.size === 0) recordingBlob = null;
    const endTime = new Date().toISOString();
    const durationSeconds = currentCallStartedRef.current ? Math.floor((Date.now() - currentCallStartedRef.current) / 1000) : seconds;
    const transcriptMessages = messagesRef.current.slice();
    let analysis = { summary: 'Call ended. Review the transcript for details.', customerNeeds: [], objections: [], nextSteps: ['Review the transcript and confirm the next step.'], status: 'No Response', mode: currentModeRef.current };
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: transcriptMessages }) });
      const data = await response.json();
      if (response.ok) analysis = data;
      else setErrorMessage(data.error || 'Could not generate the call summary.');
    } catch (error) {
      setErrorMessage(`Could not generate the summary: ${error.message}`);
    }
    try {
      const payload = {
        startedAt: currentCallStartedRef.current ? new Date(currentCallStartedRef.current).toISOString() : endTime,
        endedAt: endTime,
        durationSeconds,
        customerName,
        productName: settings.productName,
        messages: transcriptMessages,
        summary: analysis,
        status: analysis.status,
        recordingConsent: consentGranted,
        mode: analysis.mode || currentModeRef.current,
      };
      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      if (recordingBlob && consentGranted) {
        const ext = recordingBlob.type.includes('mp4') ? 'm4a' : recordingBlob.type.includes('ogg') ? 'ogg' : recordingBlob.type.includes('mpeg') ? 'mp3' : 'webm';
        formData.append('recording', recordingBlob, `sales-call.${ext}`);
      }
      const response = await fetch('/api/calls', { method: 'POST', body: formData });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || 'Could not save the call.');
      setSavedCall(saved);
      await loadCalls();
      showToast('Call saved to history');
    } catch (error) {
      setErrorMessage(`Call ended, but could not be saved: ${error.message}`);
      setSavedCall({ summary: analysis, transcript: transcriptMessages, durationSeconds, productName: settings.productName, status: analysis.status, recordingUrl: null });
    }
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    currentAudioSourceRef.current?.disconnect?.();
    currentAudioSourceRef.current = null;
    try { await audioContextRef.current?.close(); } catch { /* no-op */ }
    audioContextRef.current = null; recordingDestinationRef.current = null; recorderRef.current = null;
    currentCallStartedRef.current = null;
    endingCallRef.current = false;
    setIsRecording(false); recordingActiveRef.current = false; setStatus('idle'); setSeconds(durationSeconds); setPage('dashboard');
  };
  endCallRef.current = endCall;

  const sendText = async (event) => {
    event?.preventDefault?.();
    if (!inputText.trim() || !isLive() || thinking || speaking) return;
    const text = inputText.trim();
    setInputText('');
    await handleCustomerMessage(text, 'text');
  };

  const saveSettings = async (event) => {
    event.preventDefault(); setSaveState('saving');
    try {
      const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settingsDraft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Settings could not be saved.');
      setSettings(data); setSettingsDraft(data); setSaveState('saved'); showToast('Product setup saved');
      setTimeout(() => setSaveState('idle'), 2200);
    } catch (error) { setSaveState('error'); showToast(error.message || 'Could not save settings'); }
  };

  const filteredCalls = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return calls.filter((call) => {
      const matchesQuery = !q || [call.customerName, call.productName, call.status, call.summary?.summary, call.transcript].some((v) => String(v || '').toLowerCase().includes(q));
      const matchesStatus = historyFilter === 'All calls' || call.status === historyFilter;
      return matchesQuery && matchesStatus;
    });
  }, [calls, historyQuery, historyFilter]);

  const metric = useMemo(() => {
    const total = calls.length;
    const interested = calls.filter((call) => ['Interested', 'Demo Requested', 'Converted'].includes(call.status)).length;
    const demos = calls.filter((call) => call.status === 'Demo Requested').length;
    const converted = calls.filter((call) => call.status === 'Converted').length;
    const secondsTotal = calls.reduce((sum, call) => sum + (Number(call.durationSeconds) || 0), 0);
    return { total, interested, demos, converted, secondsTotal, rate: total ? Math.round((interested / total) * 100) : 0 };
  }, [calls]);

  const selectedCall = savedCall || calls.find((call) => call.id === selectedCallId) || null;
  const selectedPlaybackLoaded = Boolean(selectedCall && playbackId === selectedCall.id && historyAudioRef.current);
  const selectedPlaybackTime = selectedPlaybackLoaded ? playbackTime : 0;
  const selectedPlaybackDuration = selectedPlaybackLoaded && playbackDuration > 0 ? playbackDuration : (Number(selectedCall?.durationSeconds) || 0);
  const selectedPlaybackPlaying = selectedPlaybackLoaded && playbackPlaying;
  const liveView = isLive() || callStatus === 'processing';

  const openHistoryCall = (call) => {
    if (historyAudioCallRef.current && historyAudioCallRef.current !== call.id) stopHistoryPlayback();
    setSelectedCallId(call.id); setSavedCall(null); setPage('calls'); setSelectedTranscriptTab('transcript');
  };

  const stopHistoryPlayback = () => {
    const audio = historyAudioRef.current;
    if (audio) {
      audio.onplay = null; audio.onpause = null; audio.ontimeupdate = null;
      audio.onloadedmetadata = null; audio.onended = null; audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    historyAudioRef.current = null;
    historyAudioCallRef.current = null;
    setPlaybackId(null); setPlaybackTime(0); setPlaybackDuration(0); setPlaybackPlaying(false);
  };

  const playRecording = (call) => {
    if (!call?.recordingUrl) { showToast('No recording is available for this call.'); return; }
    const existingAudio = historyAudioRef.current;
    if (existingAudio && historyAudioCallRef.current === call.id) {
      if (!existingAudio.paused && !existingAudio.ended) {
        existingAudio.pause();
        return;
      }
      if (existingAudio.ended || (Number.isFinite(existingAudio.duration) && existingAudio.currentTime >= existingAudio.duration)) existingAudio.currentTime = 0;
      existingAudio.play().catch(() => showToast('Recording could not be played. Try again.'));
      return;
    }

    if (existingAudio) {
      existingAudio.onplay = null; existingAudio.onpause = null; existingAudio.ontimeupdate = null;
      existingAudio.onloadedmetadata = null; existingAudio.onended = null; existingAudio.onerror = null;
      existingAudio.pause();
    }
    const audio = new Audio(call.recordingUrl);
    audio.preload = 'metadata';
    audio.playbackRate = playbackRate;
    historyAudioRef.current = audio;
    historyAudioCallRef.current = call.id;
    setPlaybackId(call.id); setPlaybackTime(0); setPlaybackDuration(0); setPlaybackPlaying(false);
    audio.onloadedmetadata = () => setPlaybackDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.ontimeupdate = () => setPlaybackTime(audio.currentTime || 0);
    audio.onplay = () => setPlaybackPlaying(true);
    audio.onpause = () => setPlaybackPlaying(false);
    audio.onended = () => { setPlaybackPlaying(false); setPlaybackTime(Number.isFinite(audio.duration) ? audio.duration : 0); };
    audio.onerror = () => { setPlaybackPlaying(false); setPlaybackId(null); setPlaybackDuration(0); showToast('Recording could not be played. Check that the audio file is still available.'); };
    audio.play().catch(() => { setPlaybackPlaying(false); showToast('Browser blocked recording playback. Click Play recording to retry.'); });
  };

  const seekRecording = (position) => {
    const audio = historyAudioRef.current;
    if (!audio || historyAudioCallRef.current !== playbackId || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(Number(position) || 0, audio.duration));
    setPlaybackTime(audio.currentTime);
  };

  const changePlaybackRate = (rate) => {
    const nextRate = Number(rate) || 1;
    setPlaybackRate(nextRate);
    if (historyAudioRef.current) historyAudioRef.current.playbackRate = nextRate;
  };

  const downloadTranscript = (call) => {
    const transcript = (call.messages || []).map((m) => `${m.role === 'assistant' ? 'AI assistant' : 'Customer'} [${timeLabel(m.at)}]: ${m.text}`).join('\n\n');
    const blob = new Blob([`${call.productName || settings.productName} — call transcript\nDate: ${dateLabel(call.startedAt)}\nStatus: ${call.status}\n\n${transcript}\n\nSummary\n${call.summary?.summary || '—'}\n\nCustomer needs\n${(call.summary?.customerNeeds || []).join('\n') || '—'}\n\nObjections\n${(call.summary?.objections || []).join('\n') || '—'}\n\nNext steps\n${(call.summary?.nextSteps || []).join('\n') || '—'}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `sales-call-${dateLabel(call.startedAt).replace(/\s/g, '-')}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  const deleteCall = async (call) => {
    if (!call?.id || !window.confirm('Delete this call and its stored recording?')) return;
    try {
      if (historyAudioCallRef.current === call.id) stopHistoryPlayback();
      const response = await fetch(`/api/calls/${call.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed.');
      setCalls((current) => current.filter((item) => item.id !== call.id));
      setSelectedCallId(null); setSavedCall(null); showToast('Call removed');
    } catch (error) { showToast(error.message); }
  };

  const renderSummary = (call) => {
    const summary = call?.summary || {};
    return <div className="summary-content">
      <div className="summary-highlight"><div className="summary-icon"><Sparkles size={17} /></div><div><p className="tiny-label">AI CALL SUMMARY</p><p className="summary-copy">{summary.summary || 'No summary is available for this call.'}</p></div></div>
      <div className="summary-columns">
        <div className="insight-block"><div className="insight-heading"><span className="insight-dot green" />Customer needs</div>{summary.customerNeeds?.length ? <ul>{summary.customerNeeds.map((value, i) => <li key={`${value}-${i}`}>{value}</li>)}</ul> : <p className="muted-small">No specific needs captured.</p>}</div>
        <div className="insight-block"><div className="insight-heading"><span className="insight-dot orange" />Objections</div>{summary.objections?.length ? <ul>{summary.objections.map((value, i) => <li key={`${value}-${i}`}>{value}</li>)}</ul> : <p className="muted-small">No explicit objections captured.</p>}</div>
      </div>
      <div className="next-step-block"><div className="insight-heading"><CalendarCheck2 size={15} />Recommended next steps</div>{summary.nextSteps?.length ? summary.nextSteps.map((value, i) => <div className="next-step" key={`${value}-${i}`}><CheckCircle2 size={15} /><span>{value}</span></div>) : <div className="next-step"><CheckCircle2 size={15} /><span>Review the transcript and agree on a next step.</span></div>}</div>
    </div>;
  };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand-row"><div className="brand-mark"><AudioLines size={20} strokeWidth={2.5} /></div><div className="brand-name">sales<span>pilot</span><div className="brand-caption">AI WORKSPACE</div></div><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">S</div><div className="workspace-copy"><strong>Sankar Group</strong><span>Sales workspace</span></div><ChevronDown size={15} /></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="primary-nav">{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setMobileNav(false); setSavedCall(null); setSelectedCallId(null); }}><Icon size={18} /><span>{label}</span>{id === 'calls' && calls.length > 0 && <span className="nav-count">{calls.length}</span>}{page === id && <span className="nav-active-edge" />}</button>)}</nav>
      <div className="sidebar-usage"><div className="usage-top"><span>CALLS THIS SESSION</span><strong>{calls.length.toString().padStart(2, '0')}</strong></div><div className="usage-track"><span style={{ width: `${Math.min(100, calls.length * 10)}%` }} /></div><p>Your call history is stored by this app server.</p></div>
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={16} /><span>Privacy-first by design</span></div><button className="profile-row" onClick={() => setPage('settings')}><div className="profile-avatar">AA</div><div className="profile-info"><strong>Sales operator</strong><span>Local workspace</span></div><MoreHorizontal size={18} /></button></div>
    </aside>
    {mobileNav && <button className="mobile-overlay" onClick={() => setMobileNav(false)} aria-label="Close navigation overlay" />}

    <main className="main-content">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{NAV.find((item) => item.id === page)?.label || 'Overview'}</strong></div></div><div className="topbar-actions"><div className={`environment-pill ${health.aiConfigured ? 'environment-ai' : ''}`}><span className="pulse-dot" />{health.aiConfigured ? 'AI connected' : 'Demo mode'}</div><button className="icon-button help-button" title="Setup help" onClick={() => showToast('Open README.md for setup and deployment steps.')}><CircleHelp size={18} /></button><div className="top-avatar">A</div></div></header>

      {healthMessage && <div className="server-warning"><AlertCircle size={17} /><span>{healthMessage}</span><button onClick={loadInitial}>Retry</button></div>}

      {page === 'dashboard' && <div className="page-wrap dashboard-page">
        <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" />SALES INTELLIGENCE <span className="eyebrow-separator">/</span> OVERVIEW</div><h1>Good evening, <span>Sales operator.</span></h1><p className="page-subtitle">Your voice sales workspace, at a glance.</p></div><button className="button button-primary" onClick={() => { setPage('dashboard'); document.getElementById('call-console')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Plus size={17} /> New call</button></div>

        {!health.aiConfigured && <div className="demo-banner"><div className="demo-banner-icon"><AlertCircle size={17} /></div><div><strong>You're in demo mode</strong><p>Voice interaction and local history work now. Add <code>OPENAI_API_KEY</code> to the server's <code>.env</code> file to enable AI-generated answers, call summaries, and natural AI voice.</p></div><button onClick={() => setPage('settings')}>Configure <ChevronRight size={15} /></button></div>}

        <section className="metrics-grid">
          <MetricCard title="Calls handled" value={metric.total} sub="Total saved conversations" icon={PhoneCall} trend="Lifetime" trendIcon={Activity} />
          <MetricCard title="Qualified interest" value={`${metric.rate}%`} sub={`${metric.interested} interested / demo / converted`} icon={Target} trend="Engagement" trendIcon={ArrowUpRight} />
          <MetricCard title="Demos requested" value={metric.demos} sub="Explicit requests only" icon={CalendarCheck2} trend="Pipeline" trendIcon={TrendingUp} />
          <MetricCard title="Time on calls" value={`${Math.floor(metric.secondsTotal / 60)}m`} sub="Across saved calls" icon={Clock3} trend="Total" trendIcon={Clock3} />
        </section>

        <div className="dashboard-columns">
          <section className="panel call-console" id="call-console">
            <div className="panel-header console-header"><div><div className="panel-kicker"><span className={`live-indicator ${liveView ? 'live-now' : ''}`} />VOICE CONSOLE</div><h2>{liveView ? 'Call in progress' : 'Start a sales conversation'}</h2><p className="panel-subtitle">Talk naturally, or type a customer response below.</p></div><div className={`call-state-chip ${callStatus === 'active' ? 'state-active' : callStatus === 'awaiting-consent' ? 'state-consent' : callStatus === 'processing' ? 'state-processing' : ''}`}>{callStatus === 'idle' ? 'Ready' : callStatus === 'awaiting-consent' ? 'Awaiting consent' : callStatus === 'active' ? 'Live' : callStatus === 'consent-declined' ? 'Consent declined' : 'Saving call'}</div></div>
            {!liveView && !savedCall && <div className="call-ready-state"><div className="voice-orbit"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><div className="orbit-core"><AudioLines size={30} /></div><span className="orbit-spark spark-one" /><span className="orbit-spark spark-two" /></div><h3>Ready when you are</h3><p>Start a real voice session. The assistant will identify itself, ask for recording consent, and then qualify the customer.</p><div className="ready-tags"><span><Mic size={13} /> Live speech</span><span><MessageSquare size={13} /> Live transcript</span><span><Sparkles size={13} /> Sales insights</span></div><div className="customer-name-field"><label htmlFor="customer-name">CALL LABEL <span>Optional</span></label><input id="customer-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={100} placeholder="e.g. Acme sales lead" /></div><button className="button button-primary start-call-button" onClick={startCall}><PhoneCall size={18} /> Start call <span className="button-shortcut">LIVE</span></button><p className="micro-privacy"><ShieldCheck size={13} /> Recording starts only after the customer says yes.</p></div>}

            {liveView && <div className="active-call-content">
              <div className="call-timer-row"><div className={`call-wave ${speaking ? 'wave-speaking' : ''}`}><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="timer-values"><strong>{durationLabel(seconds)}</strong><span>{speaking ? 'AI is speaking' : thinking ? 'Thinking through response…' : callStatus === 'awaiting-consent' ? 'Waiting for recording consent' : isRecording ? 'Recording with consent' : 'Listening for customer'}</span></div><div className={`mic-status ${isRecording ? 'recording-on' : ''}`}><span />{isRecording ? 'REC' : 'MIC ON'}</div></div>
              {callStatus === 'awaiting-consent' && <div className="consent-call-note"><ShieldCheck size={16} /><div><strong>Recording is off</strong><span>The assistant must hear a clear “yes” before recording starts. Say “no” to decline; the call will not be recorded.</span></div></div>}
              {callStatus === 'consent-declined' && <div className="consent-call-note declined"><ShieldCheck size={16} /><div><strong>No recording will be made</strong><span>The customer declined consent. End the call to save its text transcript without audio.</span></div></div>}
              <div className="chat-transcript" role="log" aria-live="polite" ref={transcriptContainerRef}>{messages.map((message) => <ChatMessage key={message.id} message={message} />)}{thinking && <div className="message-row ai-row"><div className="message-avatar ai-message-avatar"><Sparkles size={15} /></div><div className="message-body"><div className="message-meta"><strong>SalesPilot AI</strong><span>Thinking</span></div><div className="thinking-bubble"><span /><span /><span /></div></div></div>}{speaking && <div className="assistant-speaking-note"><AudioLines size={13} /> Assistant voice is playing</div>}</div>
              {errorMessage && <div className="inline-error"><AlertCircle size={14} /><span>{errorMessage}</span><button onClick={() => setErrorMessage('')} aria-label="Dismiss error"><X size={14} /></button></div>}
              <form className="chat-input-row" onSubmit={sendText}><div className="chat-input-wrap"><MessageSquare size={17} /><input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={callStatus === 'awaiting-consent' ? 'Type “yes” or “no” for consent…' : 'Type customer response…'} disabled={callStatus === 'processing' || thinking || speaking || callStatus === 'consent-declined'} /><span className="input-hint">↵</span></div><button className="send-button" type="submit" aria-label="Send message" disabled={!inputText.trim() || thinking || speaking || callStatus === 'consent-declined'}><Send size={16} /></button></form>
              <div className="call-control-row"><div className="recording-status"><span className={`record-status-dot ${isRecording ? 'recording-dot' : ''}`} />{isRecording ? 'Recording active with consent' : callStatus === 'awaiting-consent' ? 'Waiting for consent' : 'Audio recording off'}{!window.SpeechRecognition && !window.webkitSpeechRecognition && <span className="speech-unavailable"> · Use text chat</span>}</div><button className="button button-danger" onClick={endCall} disabled={callStatus === 'processing'}>{callStatus === 'processing' ? <LoaderCircle size={16} className="spin" /> : <PhoneOff size={16} />}{callStatus === 'processing' ? 'Saving…' : 'End call'}</button></div>
              <p className="recording-footnote">AI-generated voice is disclosed to the customer. Recordings are stored by your app server; use a persistent disk for hosted retention.</p>
            </div>}

            {savedCall && !liveView && <div className="saved-call-preview"><div className="saved-call-top"><div className="saved-check"><Check size={18} /></div><div><h3>Call saved successfully</h3><p>Your conversation and summary are now in call history.</p></div><button className="icon-button" onClick={() => setSavedCall(null)} aria-label="Dismiss saved call"><X size={17} /></button></div><div className="saved-call-meta"><span><Clock3 size={14} /> {durationLabel(savedCall.durationSeconds)}</span><span><MessageSquare size={14} /> {savedCall.messages?.filter((m) => m.role === 'user').length || 0} customer replies</span><StatusBadge status={savedCall.status || savedCall.summary?.status} /></div>{renderSummary(savedCall)}<button className="button button-secondary full-width" onClick={() => { setSavedCall(null); setSelectedCallId(savedCall.id || null); setPage('calls'); }}>View in call history <ChevronRight size={16} /></button></div>}
          </section>

          <section className="panel recent-panel"><div className="panel-header recent-header"><div><div className="panel-kicker">RECENT ACTIVITY</div><h2>Latest calls</h2></div><button className="text-button" onClick={() => setPage('calls')}>View all <ChevronRight size={15} /></button></div>{calls.length === 0 ? <EmptyRecent /> : <div className="recent-list">{calls.slice(0, 5).map((call) => <button className="recent-item" key={call.id} onClick={() => openHistoryCall(call)}><div className="recent-avatar">{initials(call.customerName)}</div><div className="recent-description"><strong>{call.customerName || 'Website caller'}</strong><span>{dateLabel(call.startedAt)} · {durationLabel(call.durationSeconds)}</span><StatusBadge status={call.status} /></div><ChevronRight size={16} className="recent-chevron" /></button>)}</div>}<div className="pipeline-mini"><div className="pipeline-mini-title"><span>SALES PIPELINE</span><span>{calls.length} calls</span></div><div className="pipeline-bar">{STATUSES.map((s) => { const count = calls.filter((call) => call.status === s).length; const percentage = calls.length ? count / calls.length * 100 : 0; return <span key={s} className={`pipeline-segment ${statusClass(s)}`} style={{ width: `${percentage}%` }} title={`${s}: ${count}`} />; })}</div><div className="pipeline-legend"><span><i className="legend-dot green" />Qualified <strong>{metric.interested}</strong></span><span><i className="legend-dot purple" />Demo <strong>{metric.demos}</strong></span><span><i className="legend-dot slate" />Other <strong>{Math.max(0, calls.length - metric.interested)}</strong></span></div></div></section>
        </div>

        <section className="bottom-feature-row"><div className="feature-card"><div className="feature-icon violet"><Sparkles size={19} /></div><div><strong>Conversation intelligence</strong><p>Every saved call is organized into needs, objections and clear next steps.</p></div><span className="feature-status">{health.aiConfigured ? 'AI ENABLED' : 'DEMO'}</span></div><div className="feature-card"><div className="feature-icon blue"><Database size={19} /></div><div><strong>One searchable history</strong><p>Review transcripts and recordings without leaving your workspace.</p></div><button className="feature-link" onClick={() => setPage('calls')} aria-label="Open call history"><ChevronRight size={18} /></button></div></section>
        <footer className="page-footer"><span>SalesPilot <span className="footer-dot">·</span> Sankar Group assignment demo</span><span><ShieldCheck size={13} /> Consent-first recording <span className="footer-dot">·</span> AI generated</span></footer>
      </div>}

      {page === 'calls' && <div className="page-wrap history-page">
        <div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" />CONVERSATION LOG</div><h1>Call history</h1><p className="page-subtitle">Search, review, and follow up on every saved conversation.</p></div><button className="button button-primary" onClick={() => { setPage('dashboard'); setSavedCall(null); }}><Plus size={17} /> New call</button></div>
        <div className="history-summary-strip"><div><span>Total calls</span><strong>{metric.total}</strong></div><div><span>Interested</span><strong>{calls.filter((c) => c.status === 'Interested').length}</strong></div><div><span>Demo requests</span><strong>{metric.demos}</strong></div><div><span>Converted</span><strong>{metric.converted}</strong></div><div><span>Follow-ups</span><strong>{calls.filter((c) => c.status === 'Follow-up Required').length}</strong></div></div>
        <div className="history-toolbar"><div className="search-field"><Search size={17} /><input value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} placeholder="Search by customer, summary, or status…" /></div><div className="filter-field"><Settings2 size={15} /><select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}><option>All calls</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select><ChevronDown size={14} /></div><span className="result-count">{filteredCalls.length} result{filteredCalls.length === 1 ? '' : 's'}</span></div>
        {filteredCalls.length === 0 ? <div className="empty-history"><div className="empty-icon"><FileAudio size={24} /></div><h3>{calls.length ? 'No matching calls' : 'Your call history is empty'}</h3><p>{calls.length ? 'Try another search term or status filter.' : 'Start a voice call and saved conversations will appear here with their transcripts, recordings, summaries, and sales status.'}</p>{!calls.length && <button className="button button-primary" onClick={() => setPage('dashboard')}><PhoneCall size={16} /> Start your first call</button>}</div> : <div className="history-layout"><div className="history-table-wrap"><table className="history-table"><thead><tr><th>Contact</th><th>Call date</th><th>Duration</th><th>Sales status</th><th>Assets</th><th /></tr></thead><tbody>{filteredCalls.map((call) => <tr key={call.id} className={selectedCall?.id === call.id ? 'selected-row' : ''} onClick={() => { if (historyAudioCallRef.current && historyAudioCallRef.current !== call.id) stopHistoryPlayback(); setSelectedCallId(call.id); setSavedCall(null); }}><td><div className="contact-cell"><div className="recent-avatar">{initials(call.customerName)}</div><div><strong>{call.customerName || 'Website caller'}</strong><span>{call.productName || settings.productName}</span></div></div></td><td><span className="table-date">{dateLabel(call.startedAt)}</span><span className="table-time">{timeLabel(call.startedAt)}</span></td><td className="duration-cell">{durationLabel(call.durationSeconds)}</td><td><StatusBadge status={call.status} /></td><td><div className="asset-icons"><button title={call.recordingUrl ? (playbackId === call.id && playbackPlaying ? 'Pause recording' : 'Play recording') : 'No recording'} disabled={!call.recordingUrl} onClick={(e) => { e.stopPropagation(); setSelectedCallId(call.id); setSavedCall(null); setSelectedTranscriptTab('transcript'); playRecording(call); }} className={playbackId === call.id && playbackPlaying ? 'playing' : ''}>{playbackId === call.id && playbackPlaying ? <Pause size={14} /> : <Play size={14} />}</button><button title="Download transcript" onClick={(e) => { e.stopPropagation(); downloadTranscript(call); }}><FileText size={14} /></button></div></td><td><ChevronRight size={16} className="row-chevron" /></td></tr>)}</tbody></table></div>
          <aside className="call-detail-panel">{selectedCall ? <><div className="detail-head"><div className="detail-title"><span className="panel-kicker">CALL DETAILS</span><button className="icon-button" onClick={() => { setSelectedCallId(null); setSavedCall(null); }} aria-label="Close call details"><X size={16} /></button></div><div className="detail-person"><div className="detail-avatar">{initials(selectedCall.customerName)}</div><div><h3>{selectedCall.customerName || 'Website caller'}</h3><p>{dateLabel(selectedCall.startedAt)} · {timeLabel(selectedCall.startedAt)}</p></div></div><div className="detail-stats"><div><span>Duration</span><strong>{durationLabel(selectedCall.durationSeconds)}</strong></div><div><span>Talk turns</span><strong>{selectedCall.messages?.filter((m) => m.role === 'user').length || 0}</strong></div></div><div className="detail-status-row"><span>Sales status</span><StatusBadge status={selectedCall.status} /></div><div className="detail-actions"><button className="button button-secondary" onClick={() => playRecording(selectedCall)} disabled={!selectedCall.recordingUrl}>{selectedPlaybackPlaying ? <Pause size={14} /> : <Play size={14} />} {selectedPlaybackPlaying ? "Pause recording" : "Play recording"}</button><button className="button button-secondary" onClick={() => downloadTranscript(selectedCall)}><Download size={14} /> Export</button></div></div>{selectedCall.recordingUrl && <section className="recording-player" aria-label="Recording playback controls"><div className="recording-player-heading"><div className="recording-player-art"><FileAudio size={17} /></div><div className="recording-player-title"><strong>Call recording</strong><span>{selectedPlaybackLoaded ? (selectedPlaybackPlaying ? 'Playing saved conversation' : 'Saved conversation ready') : 'Full recording controls'}</span></div><span className={`recording-player-badge ${selectedPlaybackPlaying ? 'is-playing' : ''}`}>{selectedPlaybackPlaying ? 'PLAYING' : 'AUDIO'}</span></div><div className="recording-progress"><span>{audioTimeLabel(selectedPlaybackTime)}</span><input aria-label="Seek recording" type="range" min="0" max={Math.max(1, selectedPlaybackDuration)} step="0.1" value={Math.min(selectedPlaybackTime, Math.max(1, selectedPlaybackDuration))} disabled={!selectedPlaybackLoaded || !playbackDuration} onChange={(event) => seekRecording(event.target.value)} /><span>{audioTimeLabel(selectedPlaybackDuration)}</span></div><div className="recording-player-controls"><div className="recording-player-transport"><button className="player-main-button" type="button" onClick={() => playRecording(selectedCall)} aria-label={selectedPlaybackPlaying ? 'Pause recording' : 'Play recording'}>{selectedPlaybackPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button className="player-skip-button" type="button" disabled={!selectedPlaybackLoaded} onClick={() => seekRecording(selectedPlaybackTime - 10)} aria-label="Rewind 10 seconds"><Rewind size={16} /><span>10s</span></button><button className="player-skip-button" type="button" disabled={!selectedPlaybackLoaded} onClick={() => seekRecording(selectedPlaybackTime + 10)} aria-label="Forward 10 seconds"><FastForward size={16} /><span>10s</span></button></div><label className="playback-speed-label">Speed<select aria-label="Playback speed" value={playbackRate} onChange={(event) => changePlaybackRate(event.target.value)}>{[0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}</select></label></div><p className="recording-player-note">Browser-generated speech is not reliably captured in saved audio. With natural AI voice enabled, the app attempts to mix the assistant's voice into the recording when the browser supports it.</p></section>}<div className="detail-tabs"><button onClick={() => setSelectedTranscriptTab('transcript')} className={selectedTranscriptTab === 'transcript' ? 'tab-active' : ''}>Transcript</button><button onClick={() => setSelectedTranscriptTab('summary')} className={selectedTranscriptTab === 'summary' ? 'tab-active' : ''}>AI summary</button></div>{selectedTranscriptTab === 'transcript' ? <div className="detail-transcript">{selectedCall.messages?.length ? selectedCall.messages.map((m) => <div className={`detail-turn ${m.role === 'assistant' ? 'detail-ai' : ''}`} key={m.id}><span>{m.role === 'assistant' ? 'SALES PILOT' : 'CUSTOMER'} · {timeLabel(m.at)}</span><p>{m.text}</p></div>) : <p className="muted-small">No transcript was saved.</p>}</div> : renderSummary(selectedCall)}<div className="detail-bottom-actions"><button onClick={() => deleteCall(selectedCall)} className="delete-call-button">Delete call and recording</button><span>{selectedCall.recordingConsent ? 'Consent recorded' : 'No recording consent'}</span></div></> : <div className="detail-empty"><FileText size={24} /><strong>Select a call to inspect it</strong><p>The transcript, AI summary, recording, and next steps will be shown here.</p></div>}</aside></div>}
        <footer className="page-footer"><span>SalesPilot <span className="footer-dot">·</span> Conversation intelligence</span><span>{calls.length} saved conversations</span></footer>
      </div>}

      {page === 'settings' && <div className="page-wrap settings-page">
        <div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" />CONFIGURATION</div><h1>Product setup</h1><p className="page-subtitle">Give the sales agent accurate product details before its next call.</p></div><div className={`environment-pill ${health.aiConfigured ? 'environment-ai' : ''}`}><span className="pulse-dot" />{health.aiConfigured ? 'AI enabled' : 'Demo mode'}</div></div>
        <div className="settings-layout"><form className="panel settings-form" onSubmit={saveSettings}><div className="panel-header"><div><div className="panel-kicker">SALES KNOWLEDGE</div><h2>What are you selling?</h2><p className="panel-subtitle">These details guide the assistant's pitch, answers and follow-up questions.</p></div><div className="settings-icon"><Target size={20} /></div></div><div className="form-grid"><div className="field-group"><label htmlFor="product-name">Product name <span>*</span></label><input id="product-name" required maxLength={120} value={settingsDraft.productName || ''} onChange={(e) => setSettingsDraft({ ...settingsDraft, productName: e.target.value })} placeholder="e.g. OrbitDesk" /></div><div className="field-group"><label htmlFor="product-price">Price / plan</label><input id="product-price" maxLength={240} value={settingsDraft.price || ''} onChange={(e) => setSettingsDraft({ ...settingsDraft, price: e.target.value })} placeholder="e.g. ₹1,499 / month" /></div><div className="field-group field-full"><label htmlFor="product-description">Product description</label><textarea id="product-description" rows="3" maxLength={1200} value={settingsDraft.description || ''} onChange={(e) => setSettingsDraft({ ...settingsDraft, description: e.target.value })} placeholder="Describe what the SaaS product does and the problem it solves." /></div><div className="field-group"><label htmlFor="target-customer">Target customer</label><input id="target-customer" maxLength={240} value={settingsDraft.targetCustomer || ''} onChange={(e) => setSettingsDraft({ ...settingsDraft, targetCustomer: e.target.value })} placeholder="e.g. small sales teams" /></div><div className="field-group"><label htmlFor="value-prop">Main value proposition</label><input id="value-prop" maxLength={240} value={settingsDraft.valueProposition || ''} onChange={(e) => setSettingsDraft({ ...settingsDraft, valueProposition: e.target.value })} placeholder="e.g. reduce manual follow-up" /></div><div className="field-group field-full"><label htmlFor="product-features">Features included</label><textarea id="product-features" rows="3" maxLength={1200} value={settingsDraft.features || ''} onChange={(e) => setSettingsDraft({ ...settingsDraft, features: e.target.value })} placeholder="List key features, separated by commas." /></div><div className="field-group"><label htmlFor="call-to-action">Suggested next step</label><input id="call-to-action" maxLength={240} value={settingsDraft.callToAction || ''} onChange={(e) => setSettingsDraft({ ...settingsDraft, callToAction: e.target.value })} placeholder="e.g. Would you like a demo?" /></div><div className="field-group"><label htmlFor="language">Voice input language</label><div className="select-wrap"><select id="language" value={settingsDraft.language || 'en-IN'} onChange={(e) => setSettingsDraft({ ...settingsDraft, language: e.target.value })}>{LANGUAGES.map((lang) => <option key={lang.value} value={lang.value}>{lang.label}</option>)}</select><ChevronDown size={15} /></div></div></div><div className="settings-actions"><span className="form-footnote"><ShieldCheck size={14} /> Product information is stored in your app's server data folder.</span><button className="button button-primary" type="submit" disabled={saveState === 'saving'}>{saveState === 'saving' ? <LoaderCircle size={16} className="spin" /> : saveState === 'saved' ? <Check size={16} /> : <Save size={16} />}{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save product setup'}</button></div></form>
          <div className="settings-side"><div className="panel api-status-panel"><div className="panel-kicker">AI CONNECTION</div><div className="api-status-main"><div className={`api-status-symbol ${health.aiConfigured ? 'connected' : ''}`}>{health.aiConfigured ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}</div><div><h3>{health.aiConfigured ? 'AI is connected' : 'AI key not configured'}</h3><p>{health.aiConfigured ? `Chat model: ${health.chatModel || 'configured'} · natural voice enabled` : 'The app is running safely in demo mode with rule-based replies and browser speech.'}</p></div></div><div className="api-status-list"><div><span>AI responses</span><StatusTiny active={health.aiConfigured} /></div><div><span>Natural AI voice</span><StatusTiny active={health.ttsConfigured} /></div><div><span>Call summaries</span><StatusTiny active={health.aiConfigured} /></div><div><span>Server-side key handling</span><StatusTiny active /></div></div><div className="api-setup-note"><strong>To enable AI</strong><p>Create a private <code>.env</code> file based on <code>.env.example</code>, add your OpenAI API key on the server, then restart the app. Never place the key in React code.</p><button className="text-button" onClick={() => showToast('See README.md → Configure AI credentials.')}>Read setup notes <ExternalLink size={14} /></button></div></div>
            <div className="panel consent-panel"><div className="consent-panel-icon"><ShieldCheck size={18} /></div><h3>Recording consent</h3><p>The assistant asks for explicit verbal consent before starting the audio recorder. If the customer declines, the call can be saved as text only.</p><div className="consent-rule"><CheckCircle2 size={15} /><span>Record only after a clear “yes”</span></div><div className="consent-rule"><CheckCircle2 size={15} /><span>Recording can be deleted from history</span></div></div></div></div>
        <footer className="page-footer"><span>SalesPilot <span className="footer-dot">·</span> Configuration</span><span>Product accuracy depends on the details you provide.</span></footer>
      </div>}
    </main>

    {toast && <div className="toast-message"><CheckCircle2 size={17} /><span>{toast}</span></div>}
  </div>;
}

function MetricCard({ title, value, sub, icon: Icon, trend, trendIcon: TrendIcon }) {
  return <div className="metric-card"><div className="metric-card-top"><span>{title}</span><div className="metric-icon"><Icon size={18} /></div></div><div className="metric-value">{value}</div><div className="metric-card-bottom"><span>{sub}</span><span className="metric-tag"><TrendIcon size={12} />{trend}</span></div></div>;
}

function StatusBadge({ status = 'No Response' }) {
  return <span className={`status-badge status-${statusClass(status)}`}><i />{status}</span>;
}

function StatusTiny({ active = false }) {
  return <span className={`tiny-status ${active ? 'tiny-status-on' : ''}`}><i />{active ? 'Ready' : 'Off'}</span>;
}

function ChatMessage({ message }) {
  const assistant = message.role === 'assistant';
  return <div className={`message-row ${assistant ? 'ai-row' : 'customer-row'}`}><div className={`message-avatar ${assistant ? 'ai-message-avatar' : 'customer-message-avatar'}`}>{assistant ? <Sparkles size={15} /> : initials('Website caller')}</div><div className="message-body"><div className="message-meta"><strong>{assistant ? 'SalesPilot AI' : 'Customer'}</strong><span>{timeLabel(message.at)}{message.source === 'voice' ? ' · voice' : message.source === 'text' ? ' · typed' : ''}</span></div><div className={`message-bubble ${assistant ? 'ai-bubble' : 'customer-bubble'}`}>{message.text}</div></div></div>;
}

function EmptyRecent() {
  return <div className="empty-recent"><div className="empty-recent-icon"><Phone size={18} /></div><strong>No calls yet</strong><p>Your recent conversations will show up here.</p></div>;
}

export default App;

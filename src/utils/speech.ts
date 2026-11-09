import { audioManager } from './audio';

export type SpeechCallback = (text: string, isFinal: boolean) => void;

export interface VoiceStateEvent {
  mode: 'webspeech' | 'gemini_recorder';
  phase: 'listening' | 'transcribing' | 'paused' | 'idle';
  detail?: string;
}

export interface ListenOptions {
  lang?: string;
  preferredMode?: 'auto' | 'webspeech' | 'gemini';
  inputDeviceId?: string;
  onResult: SpeechCallback;
  onError?: (msg: string) => void;
  onStateChange?: (state: VoiceStateEvent) => void;
}

function normalizeForEchoCheck(txt: string): string {
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Falha ao ler áudio gravado'));
    reader.readAsDataURL(blob);
  });
}

class SpeechEngine {
  private recognition: any = null;
  private isListening: boolean = false;
  private isPausedForTts: boolean = false;
  private activeMode: 'webspeech' | 'gemini_recorder' = 'webspeech';
  private preferredMode: 'auto' | 'webspeech' | 'gemini' = 'auto';
  private lang: string = 'pt-BR';
  private inputDeviceId?: string;

  private onResultCallback: SpeechCallback | null = null;
  private onErrorCallback: ((msg: string) => void) | null = null;
  private onStateChangeCallback: ((state: VoiceStateEvent) => void) | null = null;

  private animFrameId: number | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private restartTimer: number | null = null;
  private resumeTimer: number | null = null;

  // Echo suppression state
  private isOutputSpeaking: boolean = false;
  private lastSpokenNormalized: string = '';
  private lastSpokenEndedAt: number = 0;
  private lastDeliveredFinal: string = '';
  private lastDeliveredAt: number = 0;

  // MediaRecorder + VAD state (Fallback & Gemini HD Voice Capture)
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recorderVadInterval: number | null = null;
  private recorderHeardSpeech: boolean = false;
  private recorderSpeechStartAt: number = 0;
  private recorderLastVoiceAt: number = 0;
  private recorderMimeType: string = 'audio/webm';
  private discardCurrentRecording: boolean = false;

  constructor() {
    this.initWebSpeech();
  }

  private initWebSpeech(): void {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      this.recognition = null;
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.lang = this.lang;

    rec.onresult = (event: any) => {
      if (this.isPausedForTts || this.isOutputSpeaking) {
        // Permite apenas comando de interrupção de voz caso falado diretamente
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const t = String(event.results[i][0]?.transcript || '').toLowerCase();
          if (/\b(pare|silêncio|silencio|cala a boca|stop)\b/i.test(t) && event.results[i].isFinal) {
            this.stopSpeaking();
            this.onResultCallback?.(t.trim(), true);
          }
        }
        return;
      }

      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPiece = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          final += (final ? ' ' : '') + transcriptPiece;
        } else {
          interim += (interim ? ' ' : '') + transcriptPiece;
        }
      }

      if (final.trim()) {
        this.deliverFinalTranscript(final.trim());
      } else if (interim.trim()) {
        this.onResultCallback?.(interim.trim(), false);
      }
    };

    rec.onerror = (event: any) => {
      const errType = String(event?.error || '');
      if (errType === 'no-speech' || errType === 'aborted') {
        return;
      }

      console.warn('[Speech Recognition notice]:', errType);

      if (errType === 'not-allowed' || errType === 'permission-denied') {
        this.isListening = false;
        this.onStateChangeCallback?.({
          mode: this.activeMode,
          phase: 'idle',
          detail: 'Permissão de microfone negada.',
        });
        this.onErrorCallback?.(
          'Permissão do microfone negada pelo navegador. Libere o microfone nas configurações do site para falar com o JARVIS.'
        );
        return;
      }

      // Em browsers sem serviço Google WebSpeech (ex: Edge sandbox, Brave, iframe restrito, offline), alterna automaticamente para Gravação HD + Gemini Transcribe
      if (
        errType === 'network' ||
        errType === 'service-not-allowed' ||
        errType === 'audio-capture' ||
        errType === 'language-not-supported'
      ) {
        if (this.isListening && !this.isPausedForTts) {
          this.switchToGeminiRecorder();
        }
      }
    };

    rec.onend = () => {
      if (this.restartTimer) {
        window.clearTimeout(this.restartTimer);
        this.restartTimer = null;
      }
      if (this.isListening && !this.isPausedForTts && this.activeMode === 'webspeech') {
        this.restartTimer = window.setTimeout(() => {
          if (!this.isListening || this.isPausedForTts || this.activeMode !== 'webspeech') return;
          try {
            rec.lang = this.lang;
            rec.start();
          } catch (_) {}
        }, 180);
      }
    };

    this.recognition = rec;
  }

  private deliverFinalTranscript(rawText: string): void {
    const clean = rawText.trim();
    if (!clean) return;

    const now = Date.now();
    const norm = normalizeForEchoCheck(clean);
    if (!norm) return;

    // Deduplicação rápida de resultados repetidos do navegador
    if (norm === this.lastDeliveredFinal && now - this.lastDeliveredAt < 1200) {
      return;
    }

    // Proteção contra eco acústico logo após o JARVIS terminar de falar
    if (
      now - this.lastSpokenEndedAt < 2200 &&
      this.lastSpokenNormalized &&
      this.isLikelyEcho(norm, this.lastSpokenNormalized)
    ) {
      return;
    }

    this.lastDeliveredFinal = norm;
    this.lastDeliveredAt = now;
    this.onResultCallback?.(clean, true);
  }

  private isLikelyEcho(heardNorm: string, spokenNorm: string): boolean {
    if (!heardNorm || !spokenNorm) return false;
    if (/\b(pare|silencio|cala|stop|repetir|repita|camera|frontal|traseira)\b/i.test(heardNorm)) {
      return false;
    }
    if (spokenNorm.includes(heardNorm) && heardNorm.length >= 6) return true;
    const heardWords = heardNorm.split(' ').filter((w) => w.length > 2);
    if (heardWords.length < 2) return false;
    const spokenSet = new Set(spokenNorm.split(' '));
    const matches = heardWords.filter((w) => spokenSet.has(w)).length;
    return matches / heardWords.length >= 0.7;
  }

  isSupported(): boolean {
    return !!(
      this.recognition ||
      (typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia)
    );
  }

  setLanguage(lang = 'pt-BR'): void {
    this.lang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  getActiveMode(): 'webspeech' | 'gemini_recorder' {
    return this.activeMode;
  }

  async startListening(
    callbackOrOptions: SpeechCallback | ListenOptions,
    legacyLang = 'pt-BR'
  ): Promise<boolean> {
    if (typeof callbackOrOptions === 'function') {
      this.onResultCallback = callbackOrOptions;
      this.onErrorCallback = null;
      this.onStateChangeCallback = null;
      this.lang = legacyLang;
      this.preferredMode = 'auto';
    } else {
      this.onResultCallback = callbackOrOptions.onResult;
      this.onErrorCallback = callbackOrOptions.onError || null;
      this.onStateChangeCallback = callbackOrOptions.onStateChange || null;
      this.lang = callbackOrOptions.lang || 'pt-BR';
      this.preferredMode = callbackOrOptions.preferredMode || 'auto';
      this.inputDeviceId = callbackOrOptions.inputDeviceId;
    }

    // Ao clicar para falar, interrompe a fala do JARVIS imediatamente se estiver falando
    this.stopSpeaking();
    this.isPausedForTts = false;
    this.isListening = true;

    // Garante acesso real ao microfone físico com cancelamento de eco e supressão de ruído
    const micReady = await audioManager.startMic(this.inputDeviceId);
    if (!micReady) {
      this.isListening = false;
      const errText =
        'Não foi possível acessar o microfone. Verifique se um microfone está conectado e autorizado no navegador.';
      this.onErrorCallback?.(errText);
      this.onStateChangeCallback?.({ mode: this.activeMode, phase: 'idle', detail: errText });
      return false;
    }

    const canUseWebSpeech = !!this.recognition && this.preferredMode !== 'gemini';
    if (canUseWebSpeech) {
      this.activeMode = 'webspeech';
      try {
        this.recognition.lang = this.lang;
        this.recognition.start();
      } catch (_) {}
      this.onStateChangeCallback?.({
        mode: 'webspeech',
        phase: 'listening',
        detail: `Reconhecimento ao vivo (${this.lang}) ativo`,
      });
      return true;
    }

    // Navegadores sem SpeechRecognition ou modo Gemini HD explícito
    return this.switchToGeminiRecorder();
  }

  private async switchToGeminiRecorder(): Promise<boolean> {
    if (!this.isListening) return false;

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }

    this.activeMode = 'gemini_recorder';
    const stream = audioManager.getMicStream();
    if (!stream) {
      const ok = await audioManager.startMic(this.inputDeviceId);
      if (!ok) {
        this.isListening = false;
        this.onErrorCallback?.('Microfone indisponível para captura de áudio.');
        return false;
      }
    }

    const activeStream = audioManager.getMicStream();
    if (!activeStream || typeof MediaRecorder === 'undefined') {
      this.isListening = false;
      this.onErrorCallback?.('Gravação de áudio não suportada neste navegador.');
      return false;
    }

    this.startRecorderCycle(activeStream);
    return true;
  }

  private startRecorderCycle(stream: MediaStream): void {
    this.cleanupRecorderOnly();

    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    let selectedMime = '';
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }
    this.recorderMimeType = selectedMime ? selectedMime.split(';')[0] : 'audio/webm';

    try {
      const recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);

      this.recordedChunks = [];
      this.recorderHeardSpeech = false;
      this.recorderSpeechStartAt = Date.now();
      this.recorderLastVoiceAt = Date.now();
      this.discardCurrentRecording = false;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          this.recordedChunks.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        if (this.recorderVadInterval) {
          window.clearInterval(this.recorderVadInterval);
          this.recorderVadInterval = null;
        }

        const chunks = [...this.recordedChunks];
        const hadSpeech = this.recorderHeardSpeech;
        const discard = this.discardCurrentRecording;
        this.recordedChunks = [];

        if (discard || chunks.length === 0 || (!hadSpeech && chunks.reduce((s, b) => s + b.size, 0) < 2500)) {
          if (this.isListening && !this.isPausedForTts && this.activeMode === 'gemini_recorder') {
            const liveStream = audioManager.getMicStream();
            if (liveStream) this.startRecorderCycle(liveStream);
          }
          return;
        }

        const audioBlob = new Blob(chunks, { type: this.recorderMimeType || 'audio/webm' });
        if (audioBlob.size < 1800) {
          return;
        }

        this.onStateChangeCallback?.({
          mode: 'gemini_recorder',
          phase: 'transcribing',
          detail: 'Transcrevendo áudio com precisão...',
        });

        try {
          const base64 = await blobToBase64(audioBlob);
          const resp = await fetch('/api/audio/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: this.recorderMimeType,
              language: this.lang,
            }),
          });

          if (resp.ok) {
            const data = await resp.json();
            const text = String(data?.text || '').trim();
            if (text) {
              this.deliverFinalTranscript(text);
            }
          }
        } catch (err) {
          console.warn('[Gemini Recorder Transcribe error]:', err);
        } finally {
          if (this.isListening && !this.isPausedForTts && this.activeMode === 'gemini_recorder') {
            const liveStream = audioManager.getMicStream();
            if (liveStream) {
              this.startRecorderCycle(liveStream);
            }
          } else if (!this.isListening) {
            this.onStateChangeCallback?.({ mode: 'gemini_recorder', phase: 'idle' });
          }
        }
      };

      recorder.start(250);
      this.mediaRecorder = recorder;

      this.onStateChangeCallback?.({
        mode: 'gemini_recorder',
        phase: 'listening',
        detail: 'Escuta HD Gemini ativa — fale naturalmente ou toque para enviar',
      });

      // Detecção automática de voz + silêncio (VAD) para envio automático ao terminar de falar
      this.recorderVadInterval = window.setInterval(() => {
        if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
        const level = audioManager.getMicLevel();
        const now = Date.now();

        if (level > 0.045) {
          this.recorderHeardSpeech = true;
          this.recorderLastVoiceAt = now;
        }

        const silenceMs = now - this.recorderLastVoiceAt;
        const totalMs = now - this.recorderSpeechStartAt;

        if ((this.recorderHeardSpeech && silenceMs >= 1500) || totalMs >= 18000) {
          try {
            this.mediaRecorder.stop();
          } catch (_) {}
        }
      }, 100);
    } catch (err) {
      console.warn('MediaRecorder start error:', err);
      this.isListening = false;
      this.onErrorCallback?.('Falha ao inicializar captura de áudio neste dispositivo.');
    }
  }

  private cleanupRecorderOnly(discard = true): void {
    this.discardCurrentRecording = discard;
    if (this.recorderVadInterval) {
      window.clearInterval(this.recorderVadInterval);
      this.recorderVadInterval = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (_) {}
    }
    this.mediaRecorder = null;
  }

  stopListening(processPendingRecording = true): void {
    this.isListening = false;
    this.isPausedForTts = false;

    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.resumeTimer) {
      window.clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      // Se havia fala capturada quando o usuário clicou no microfone para parar, transcreve!
      this.discardCurrentRecording = !processPendingRecording || !this.recorderHeardSpeech;
      try {
        this.mediaRecorder.stop();
      } catch (_) {}
    } else {
      this.cleanupRecorderOnly(true);
    }

    audioManager.stopMic();
    this.onStateChangeCallback?.({ mode: this.activeMode, phase: 'idle' });
  }

  private pauseListeningForTts(): void {
    this.isOutputSpeaking = true;
    if (!this.isListening) return;

    this.isPausedForTts = true;
    if (this.resumeTimer) {
      window.clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    if (this.recognition && this.activeMode === 'webspeech') {
      try {
        this.recognition.stop();
      } catch (_) {}
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.cleanupRecorderOnly(true);
    }
    this.onStateChangeCallback?.({
      mode: this.activeMode,
      phase: 'paused',
      detail: 'Aguardando resposta vocal concluir para voltar a ouvir...',
    });
  }

  private resumeListeningAfterTts(): void {
    this.isOutputSpeaking = false;
    this.lastSpokenEndedAt = Date.now();

    if (!this.isListening) return;

    this.resumeTimer = window.setTimeout(async () => {
      if (!this.isListening) return;
      this.isPausedForTts = false;

      if (this.activeMode === 'webspeech' && this.recognition) {
        try {
          this.recognition.lang = this.lang;
          this.recognition.start();
          this.onStateChangeCallback?.({
            mode: 'webspeech',
            phase: 'listening',
            detail: `Ouvindo (${this.lang})...`,
          });
        } catch (_) {}
      } else if (this.activeMode === 'gemini_recorder') {
        await this.switchToGeminiRecorder();
      }
    }, 320);
  }

  // Primary speech synthesizer: Uses Fish Audio as default for all system speech
  async speak(
    text: string,
    voiceId: string = '82d13948027e4be69892dd3d0104e681',
    onEnd?: () => void,
    onViseme?: (level: number) => void
  ): Promise<void> {
    const cleanText = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!cleanText) {
      onEnd?.();
      return;
    }

    this.stopSpeaking();
    this.lastSpokenNormalized = normalizeForEchoCheck(cleanText);
    this.pauseListeningForTts();

    const finishOutput = () => {
      this.resumeListeningAfterTts();
      onEnd?.();
    };

    // 1. Try Fish Audio neural TTS API (default for the whole system)
    try {
      const resp = await fetch('/api/tts/fishaudio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voiceId: voiceId || '82d13948027e4be69892dd3d0104e681',
        }),
      });

      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        if (buffer && buffer.byteLength > 200) {
          await audioManager.playAudioBuffer(buffer, finishOutput, onViseme);
          return;
        }
      }
    } catch (err) {
      console.warn('[Speech] Fish Audio indisponível, usando sintetizador local:', err);
    }

    // 2. Fallback: Browser Web Speech API SpeechSynthesis
    this.speakBrowserFallback(cleanText, finishOutput, onViseme);
  }

  private speakBrowserFallback(
    cleanText: string,
    onEnd?: () => void,
    onViseme?: (level: number) => void
  ): void {
    if (!('speechSynthesis' in window)) {
      onEnd?.();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    this.currentUtterance = utterance;
    utterance.lang = this.lang || 'pt-BR';

    const voices = window.speechSynthesis.getVoices();
    const shortLang = (this.lang || 'pt-BR').slice(0, 2).toLowerCase();
    const matchedVoice =
      voices.find((v) => v.lang === this.lang) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(shortLang));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.rate = 1.05;
    utterance.pitch = 0.95;

    let isSpeaking = true;
    const animateMouth = () => {
      if (!isSpeaking) {
        onViseme?.(0);
        return;
      }
      const time = performance.now() * 0.015;
      const level = Math.max(0, Math.sin(time) * 0.6 + Math.cos(time * 2.3) * 0.3 + 0.3);
      onViseme?.(Math.min(1.0, level));
      this.animFrameId = requestAnimationFrame(animateMouth);
    };

    utterance.onstart = () => {
      isSpeaking = true;
      animateMouth();
    };

    utterance.onend = () => {
      isSpeaking = false;
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      onViseme?.(0);
      onEnd?.();
    };

    utterance.onerror = () => {
      isSpeaking = false;
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      onViseme?.(0);
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking(): void {
    this.isOutputSpeaking = false;
    this.lastSpokenEndedAt = Date.now();
    audioManager.stopCurrentAudio();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.isListening && this.isPausedForTts) {
      this.resumeListeningAfterTts();
    }
  }
}

export const speechEngine = new SpeechEngine();

class AudioManager {
  private ctx: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private ttsAnalyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micDataArray: Uint8Array | null = null;
  private isListeningToMic: boolean = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private ttsAnimFrame: number | null = null;

  public getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public getMicStream(): MediaStream | null {
    return this.micStream;
  }

  public isMicActive(): boolean {
    return this.isListeningToMic && !!this.micStream;
  }

  async startMic(deviceId?: string): Promise<boolean> {
    try {
      // Se já existe um stream ativo com tracks live, reaproveita sem reabrir o microfone
      if (
        !deviceId &&
        this.isListeningToMic &&
        this.micStream &&
        this.micStream.getAudioTracks().some((t) => t.readyState === 'live')
      ) {
        return true;
      }

      this.stopMic();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('MediaDevices API indisponível neste navegador.');
        return false;
      }

      const audioConstraints: MediaTrackConstraints = deviceId
        ? {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      this.micStream = stream;
      const ctx = this.getContext();
      this.micSource = ctx.createMediaStreamSource(stream);
      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 256;
      this.micAnalyser.smoothingTimeConstant = 0.75;

      // IMPORTANTE: micAnalyser NÃO se conecta a ctx.destination (evita microfonia/eco nos alto-falantes)
      this.micSource.connect(this.micAnalyser);
      this.micDataArray = new Uint8Array(this.micAnalyser.frequencyBinCount);
      this.isListeningToMic = true;
      return true;
    } catch (err) {
      console.warn('Microphone access unavailable or denied:', err);
      this.isListeningToMic = false;
      return false;
    }
  }

  stopMic(): void {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch (_) {}
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.micAnalyser = null;
    this.micDataArray = null;
    this.isListeningToMic = false;
  }

  getMicLevel(): number {
    if (!this.isListeningToMic || !this.micAnalyser || !this.micDataArray) {
      return 0;
    }
    this.micAnalyser.getByteFrequencyData(this.micDataArray as any);
    let sum = 0;
    for (let i = 0; i < this.micDataArray.length; i++) {
      sum += this.micDataArray[i];
    }
    const avg = sum / this.micDataArray.length;
    return Math.min(1.0, avg / 96);
  }

  getFrequencyData(): Uint8Array {
    if (!this.micAnalyser || !this.micDataArray) {
      return new Uint8Array(32);
    }
    this.micAnalyser.getByteFrequencyData(this.micDataArray as any);
    return this.micDataArray;
  }

  async playAudioBuffer(
    buffer: ArrayBuffer,
    onEnd?: () => void,
    onViseme?: (level: number) => void
  ): Promise<void> {
    this.stopCurrentAudio();
    const ctx = this.getContext();
    try {
      const cloned = buffer.slice(0);
      const decoded = await ctx.decodeAudioData(cloned);
      const source = ctx.createBufferSource();
      source.buffer = decoded;

      // Analisador dedicado exclusivamente à reprodução TTS (isolado do microfone)
      if (!this.ttsAnalyser) {
        this.ttsAnalyser = ctx.createAnalyser();
        this.ttsAnalyser.fftSize = 256;
        this.ttsAnalyser.smoothingTimeConstant = 0.8;
        this.ttsAnalyser.connect(ctx.destination);
      }

      source.connect(this.ttsAnalyser);
      this.currentSource = source;

      const tempArray = new Uint8Array(this.ttsAnalyser.frequencyBinCount);
      let isPlaying = true;

      const trackViseme = () => {
        if (!isPlaying || !this.ttsAnalyser) return;
        this.ttsAnalyser.getByteFrequencyData(tempArray as any);
        let sum = 0;
        for (let i = 0; i < tempArray.length; i++) {
          sum += tempArray[i];
        }
        const level = Math.min(1.0, (sum / tempArray.length) / 96);
        onViseme?.(level);
        this.ttsAnimFrame = requestAnimationFrame(trackViseme);
      };

      source.onended = () => {
        isPlaying = false;
        if (this.ttsAnimFrame) cancelAnimationFrame(this.ttsAnimFrame);
        this.ttsAnimFrame = null;
        onViseme?.(0);
        this.currentSource = null;
        onEnd?.();
      };

      source.start(0);
      trackViseme();
    } catch (e) {
      console.warn('Audio buffer decode failure:', e);
      onEnd?.();
    }
  }

  stopCurrentAudio(): void {
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (_) {}
      this.currentSource = null;
    }
    if (this.ttsAnimFrame) {
      cancelAnimationFrame(this.ttsAnimFrame);
      this.ttsAnimFrame = null;
    }
  }

  playTestTone(frequency = 440, duration = 0.5): void {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.error('Tone generation error:', e);
    }
  }
}

export const audioManager = new AudioManager();

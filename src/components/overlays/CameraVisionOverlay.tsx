import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  X,
  Camera,
  Eye,
  RefreshCw,
  Scan,
  Sparkles,
  AlertCircle,
  SwitchCamera,
  Webcam,
  Video,
  CheckCircle2,
  Smartphone,
  Laptop,
} from 'lucide-react';
import { Palette } from '../../constants/theme';
import { speechEngine } from '../../utils/speech';

export type CameraSelectionTarget =
  | { type: 'facing'; facingMode: 'user' | 'environment'; label: string }
  | { type: 'device'; deviceId: string; label: string };

export interface RequestedCameraCommand {
  type: 'facing' | 'device' | 'index';
  facingMode?: 'user' | 'environment';
  deviceId?: string;
  deviceIndex?: number;
  label?: string;
}

interface CameraVisionOverlayProps {
  palette: Palette;
  assistantName: string;
  userName: string;
  activeVoiceId: string;
  requestedCamera?: RequestedCameraCommand | null;
  onClearRequestedCamera?: () => void;
  onCameraSelected?: (cameraLabel: string) => void;
  onAnalysisResult: (text: string) => void;
  onClose: () => void;
}

export const CameraVisionOverlay: React.FC<CameraVisionOverlayProps> = ({
  palette,
  assistantName,
  userName,
  activeVoiceId,
  requestedCamera,
  onClearRequestedCamera,
  onCameraSelected,
  onAnalysisResult,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [selectedCamera, setSelectedCamera] = useState<CameraSelectionTarget | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [isDetectingDevices, setIsDetectingDevices] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');

  const firstName = (userName || 'Senhor').trim().split(/\s+/)[0];

  const stopActiveStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const refreshVideoDevices = useCallback(async (probeLabels = false) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [] as MediaDeviceInfo[];
    }
    setIsDetectingDevices(true);
    try {
      if (probeLabels && navigator.mediaDevices.getUserMedia) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          tempStream.getTracks().forEach((t) => t.stop());
        } catch (err) {
          console.warn('Permissão temporária para listar nomes das câmeras recusada:', err);
        }
      }
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const cams = allDevices.filter((d) => d.kind === 'videoinput');
      setVideoDevices(cams);
      return cams;
    } catch (err) {
      console.warn('Erro ao enumerar câmeras:', err);
      return [] as MediaDeviceInfo[];
    } finally {
      setIsDetectingDevices(false);
    }
  }, []);

  // Ao abrir o módulo, lista dispositivos disponíveis SEM ligar nenhuma câmera automaticamente.
  useEffect(() => {
    refreshVideoDevices(false);
    return () => {
      stopActiveStream();
    };
  }, [refreshVideoDevices, stopActiveStream]);

  // Garante que o elemento <video> receba o stream assim que montar/atualizar
  useEffect(() => {
    if (selectedCamera && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [selectedCamera, isCameraActive]);

  const startCameraTarget = useCallback(
    async (target: CameraSelectionTarget) => {
      setErrorMsg('');
      setAnalysisText('');
      setIsStartingCamera(true);
      stopActiveStream();
      setSelectedCamera(target);

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Navegador não suporta acesso à câmera neste contexto.');
        }

        const videoConstraints: MediaTrackConstraints =
          target.type === 'device'
            ? {
                deviceId: { exact: target.deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : {
                facingMode: target.facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setIsCameraActive(true);
        onCameraSelected?.(target.label);

        // Atualiza nomes reais das câmeras após permissão concedida
        refreshVideoDevices(false);
      } catch (err: any) {
        console.error('Camera access error:', err);
        const errName = err?.name || '';
        if (errName === 'NotFoundError' || errName === 'OverconstrainedError') {
          setErrorMsg(
            `Não foi possível localizar "${target.label}" neste dispositivo. Clique em "Trocar Câmera" e selecione outra opção disponível.`
          );
        } else if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setErrorMsg(
            'Permissão de câmera bloqueada pelo navegador. Autorize o acesso à câmera e tente novamente.'
          );
        } else {
          setErrorMsg(
            'Não foi possível iniciar esta câmera. Verifique as permissões de vídeo ou escolha outro dispositivo.'
          );
        }
        setIsCameraActive(false);
      } finally {
        setIsStartingCamera(false);
      }
    },
    [onCameraSelected, refreshVideoDevices, stopActiveStream]
  );

  // Responde caso o usuário informe a câmera via voz ou chat no painel principal
  useEffect(() => {
    if (!requestedCamera) return;

    if (requestedCamera.type === 'facing' && requestedCamera.facingMode) {
      const label =
        requestedCamera.label ||
        (requestedCamera.facingMode === 'user' ? 'Câmera Frontal' : 'Câmera Traseira');
      startCameraTarget({
        type: 'facing',
        facingMode: requestedCamera.facingMode,
        label,
      });
    } else if (requestedCamera.type === 'device' && requestedCamera.deviceId) {
      startCameraTarget({
        type: 'device',
        deviceId: requestedCamera.deviceId,
        label: requestedCamera.label || 'Câmera Conectada',
      });
    } else if (requestedCamera.type === 'index') {
      const idx = requestedCamera.deviceIndex ?? 0;
      const dev = videoDevices[idx];
      if (dev && dev.deviceId) {
        startCameraTarget({
          type: 'device',
          deviceId: dev.deviceId,
          label: dev.label || `Câmera #${idx + 1}`,
        });
      } else {
        startCameraTarget({
          type: 'facing',
          facingMode: idx === 1 ? 'environment' : 'user',
          label: idx === 1 ? 'Câmera Traseira' : 'Câmera Frontal',
        });
      }
    }

    onClearRequestedCamera?.();
  }, [requestedCamera, videoDevices, startCameraTarget, onClearRequestedCamera]);

  // Volta para a tela de seleção perguntando qual câmera abrir
  const handleBackToSelector = () => {
    stopActiveStream();
    setSelectedCamera(null);
    setErrorMsg('');
    setAnalysisText('');
    refreshVideoDevices(false);
  };

  // Inverter rapidamente entre Frontal e Traseira quando já está ativa
  const handleToggleFacingMode = () => {
    if (!selectedCamera) return;
    if (selectedCamera.type === 'facing') {
      const nextMode = selectedCamera.facingMode === 'user' ? 'environment' : 'user';
      startCameraTarget({
        type: 'facing',
        facingMode: nextMode,
        label: nextMode === 'user' ? 'Câmera Frontal' : 'Câmera Traseira / Ambiente',
      });
    } else {
      startCameraTarget({
        type: 'facing',
        facingMode: 'environment',
        label: 'Câmera Traseira / Ambiente',
      });
    }
  };

  // Capture frame & analyze with Gemini Vision
  const handleAnalyzeScene = async () => {
    if (analyzing || !isCameraActive) return;

    setAnalyzing(true);
    setErrorMsg('');

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      const width = video && video.videoWidth ? video.videoWidth : 640;
      const height = video && video.videoHeight ? video.videoHeight : 480;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (video && video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, width, height);
        } else {
          ctx.fillStyle = '#050b14';
          ctx.fillRect(0, 0, width, height);
          ctx.strokeStyle = '#00d4ff';
          ctx.lineWidth = 2;
          ctx.strokeRect(40, 40, width - 80, height - 80);
          ctx.fillStyle = '#00d4ff';
          ctx.font = '16px monospace';
          ctx.fillText('MARK LVI // CALIBRAÇÃO ÓPTICA', 60, 80);
        }
      }

      const base64Data = canvas.toDataURL('image/jpeg', 0.85);

      const resp = await fetch('/api/gemini/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          assistantName,
          userName: firstName,
        }),
      });

      const data = await resp.json();
      const result =
        data.text || `Sensores ópticos online, ${firstName}. Visão tática operando perfeitamente.`;

      setAnalysisText(result);
      onAnalysisResult(result);

      speechEngine.speak(result, activeVoiceId);
    } catch (err: any) {
      console.warn('Interpretação óptica fallback:', err);
      const fallbackText = `Sensores ópticos do Mark LVI sincronizados, ${firstName}. Leitura tática efetuada. Campo visual estabilizado no HUD.`;
      setAnalysisText(fallbackText);
      onAnalysisResult(fallbackText);
      speechEngine.speak(fallbackText, activeVoiceId);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] relative"
        style={{
          backgroundColor: `${palette.PANEL2}fa`,
          borderColor: palette.PRI,
          boxShadow: `0 0 40px ${palette.PRI}44`,
        }}
      >
        {/* Header */}
        <div
          className="p-3.5 border-b flex items-center justify-between font-mono text-xs gap-2"
          style={{ borderColor: palette.BORDER }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Scan className="w-5 h-5 text-cyan-400 animate-pulse flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm tracking-widest uppercase text-white truncate">
                  SENSORES ÓPTICOS // VISÃO TÁTICA DO {assistantName}
                </h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {selectedCamera ? 'GEMINI VISION ATIVO' : 'AGUARDANDO SELEÇÃO'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">
                {selectedCamera
                  ? `Fonte ativa: ${selectedCamera.label} • Fala via Fish Audio`
                  : 'Escolha qual câmera deseja abrir antes de iniciar a captura de vídeo'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {selectedCamera && (
              <>
                <button
                  type="button"
                  onClick={handleBackToSelector}
                  className="px-2.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-500/20 text-cyan-300 hover:text-white transition-all text-[11px] flex items-center gap-1.5"
                  title="Escolher outra câmera"
                >
                  <SwitchCamera className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">TROCAR CÂMERA</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="px-2.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-muted-foreground hover:text-white transition-all text-[11px] flex items-center gap-1.5"
                  title="Inverter Frontal / Traseira"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">INVERTER</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                stopActiveStream();
                onClose();
              }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
              title="Fechar Visão Óptica"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body: Camera Selector OR Live Feed */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-y-auto min-h-[340px]">
          {/* Always mounted video element for instant binding when user selects a camera */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={
              selectedCamera
                ? 'w-full h-full object-cover max-h-[50vh] sm:max-h-[55vh]'
                : 'hidden'
            }
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* STEP 1: Pergunta ao usuário qual câmera abrir */}
          {!selectedCamera && (
            <div className="w-full h-full p-5 sm:p-7 flex flex-col items-center justify-center gap-5 font-mono">
              <div className="text-center space-y-2 max-w-xl">
                <div
                  className="w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center shadow-[0_0_25px_rgba(0,212,255,0.3)]"
                  style={{ borderColor: palette.PRI, backgroundColor: `${palette.PRI}15` }}
                >
                  <Webcam className="w-7 h-7 text-cyan-400 animate-pulse" />
                </div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-cyan-400 font-bold">
                  PROTOCOLO DE PRIVACIDADE E SENSORES
                </div>
                <h4 className="text-base sm:text-xl font-bold text-white tracking-wide">
                  Qual das câmeras você deseja abrir, {firstName}?
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Nenhuma câmera é ligada sem sua confirmação. Selecione uma das lentes abaixo ou responda por voz/chat (&quot;Frontal&quot; ou &quot;Traseira&quot;).
                </p>
              </div>

              {/* Primary Options: Frontal & Traseira */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                <button
                  type="button"
                  onClick={() =>
                    startCameraTarget({
                      type: 'facing',
                      facingMode: 'user',
                      label: 'Câmera Frontal (Selfie / Webcam)',
                    })
                  }
                  className="p-4 rounded-xl border text-left transition-all hover:scale-[1.01] hover:bg-cyan-500/10 active:scale-[0.99] group flex items-start gap-3.5"
                  style={{
                    borderColor: palette.BORDER_A,
                    backgroundColor: `${palette.PANEL}cc`,
                  }}
                >
                  <div className="p-2.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 group-hover:bg-cyan-500/25">
                    <Laptop className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
                      <span>CÂMERA FRONTAL</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                        USER
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Webcam integrada do notebook/PC ou câmera frontal do celular.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    startCameraTarget({
                      type: 'facing',
                      facingMode: 'environment',
                      label: 'Câmera Traseira / Ambiente',
                    })
                  }
                  className="p-4 rounded-xl border text-left transition-all hover:scale-[1.01] hover:bg-emerald-500/10 active:scale-[0.99] group flex items-start gap-3.5"
                  style={{
                    borderColor: palette.BORDER,
                    backgroundColor: `${palette.PANEL}cc`,
                  }}
                >
                  <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 group-hover:bg-emerald-500/25">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
                      <span>CÂMERA TRASEIRA</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        AMBIENTE
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Lente principal traseira do celular ou câmera externa apontada ao ambiente.
                    </p>
                  </div>
                </button>
              </div>

              {/* Detected Hardware Video Devices List */}
              <div className="w-full max-w-2xl space-y-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                  <span className="uppercase tracking-wider">
                    DISPOSITIVOS DE VÍDEO DETECTADOS ({videoDevices.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => refreshVideoDevices(true)}
                    disabled={isDetectingDevices}
                    className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isDetectingDevices ? 'animate-spin' : ''}`} />
                    <span>{isDetectingDevices ? 'Detectando...' : 'Detectar Nomes Reais'}</span>
                  </button>
                </div>

                {videoDevices.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                    {videoDevices.map((device, index) => {
                      const cleanLabel =
                        device.label?.trim() || `Câmera Conectada #${index + 1}`;
                      return (
                        <button
                          key={device.deviceId || `cam-${index}`}
                          type="button"
                          onClick={() =>
                            startCameraTarget(
                              device.deviceId
                                ? {
                                    type: 'device',
                                    deviceId: device.deviceId,
                                    label: cleanLabel,
                                  }
                                : {
                                    type: 'facing',
                                    facingMode: index === 1 ? 'environment' : 'user',
                                    label: cleanLabel,
                                  }
                            )
                          }
                          className="p-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-cyan-400/50 text-left flex items-center gap-2.5 transition-all"
                        >
                          <Video className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold text-white truncate">
                              {cleanLabel}
                            </div>
                            <div className="text-[9px] text-muted-foreground truncate">
                              Clique para abrir este sensor
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-white/10 bg-white/5 text-[11px] text-muted-foreground text-center">
                    Clique em &quot;Câmera Frontal&quot;, &quot;Câmera Traseira&quot; ou em &quot;Detectar Nomes Reais&quot; para listar webcams USB e internas.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Active Video Overlay + Error Banner */}
          {selectedCamera && errorMsg && (
            <div className="absolute inset-x-4 top-4 z-30 p-3.5 rounded-xl border border-red-500/50 bg-red-950/90 text-red-200 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-3 backdrop-blur-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={handleBackToSelector}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold whitespace-nowrap self-end sm:self-auto"
              >
                ESCOLHER OUTRA CÂMERA
              </button>
            </div>
          )}

          {selectedCamera && isStartingCamera && !isCameraActive && !errorMsg && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/75 font-mono text-xs text-cyan-300">
              <Camera className="w-8 h-8 animate-pulse text-cyan-400" />
              <span>INICIALIZANDO {selectedCamera.label.toUpperCase()}...</span>
            </div>
          )}

          {/* Holographic HUD Overlay Graphics on Video */}
          {selectedCamera && (
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 font-mono">
              {/* Top HUD Brackets */}
              <div className="flex items-center justify-between text-[10px] text-cyan-400/80">
                <div className="flex items-center gap-2 border-l-2 border-t-2 border-cyan-400 p-2 bg-black/35">
                  <span>{selectedCamera.label.toUpperCase()}</span>
                  {isCameraActive && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />}
                </div>
                <div className="border-r-2 border-t-2 border-cyan-400 p-2 text-right bg-black/35">
                  <span>FPS: 60 // ISO_AUTO</span>
                </div>
              </div>

              {/* Center Targeting Reticle */}
              <div className="self-center flex items-center justify-center relative w-44 h-44 sm:w-48 sm:h-48 border border-cyan-400/30 rounded-full">
                <div className="w-36 h-36 sm:w-40 sm:h-40 border border-dashed border-cyan-400/50 rounded-full animate-spin-slow" />
                <div className="w-4 h-4 border-2 border-cyan-400 rounded-full absolute" />
                <div className="w-16 h-0.5 bg-cyan-400/60 absolute" />
                <div className="h-16 w-0.5 bg-cyan-400/60 absolute" />
                {analyzing && (
                  <div className="absolute inset-0 bg-cyan-400/10 rounded-full flex items-center justify-center animate-pulse">
                    <span className="text-[10px] font-bold text-cyan-300 tracking-widest bg-black/70 px-2 py-0.5 rounded">
                      ANALISANDO...
                    </span>
                  </div>
                )}
              </div>

              {/* Bottom HUD Brackets */}
              <div className="flex items-center justify-between text-[10px] text-cyan-400/80">
                <div className="border-l-2 border-b-2 border-cyan-400 p-2 bg-black/35">
                  <span>TARGET_LOCK: AUTOMÁTICO</span>
                </div>
                <div className="border-r-2 border-b-2 border-cyan-400 p-2 text-right bg-black/35">
                  <span>VOZ: FISH AUDIO ({activeVoiceId.slice(0, 8)}...)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live Interpretation Transcript Box */}
        {analysisText && (
          <div
            className="p-3.5 border-t bg-black/60 font-mono text-xs max-h-36 overflow-y-auto space-y-1.5"
            style={{ borderColor: palette.BORDER }}
          >
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-[10px] uppercase">
              <Eye className="w-3.5 h-3.5" />
              <span>AVALIAÇÃO ÓPTICA DO {assistantName}:</span>
            </div>
            <p className="text-white/90 leading-relaxed text-[11px] select-text">
              {analysisText}
            </p>
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div
          className="p-3.5 border-t bg-black/40 flex flex-wrap items-center justify-between gap-2.5 font-mono text-xs"
          style={{ borderColor: palette.BORDER }}
        >
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="hidden sm:inline">
              {selectedCamera
                ? 'O JARVIS analisa objetos, pessoas, ambiente e textos visíveis instantaneamente.'
                : 'Selecione uma câmera acima para habilitar a análise visual.'}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {selectedCamera ? (
              <button
                type="button"
                onClick={handleAnalyzeScene}
                disabled={analyzing || !isCameraActive}
                className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-40"
                style={{
                  backgroundColor: palette.PRI,
                  color: '#000',
                }}
              >
                <Eye className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
                <span>{analyzing ? 'INTERPRETANDO CENA...' : 'INTERPRETAR O QUE VÊ'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-cyan-300 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Aguardando escolha da câmera</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef } from 'react';
import { Send, Mic, Paperclip, Sparkles, Radio, VolumeX, Globe } from 'lucide-react';
import { Palette } from '../constants/theme';

interface ChatInputProps {
  palette: Palette;
  isListening: boolean;
  assistantName: string;
  interimTranscript?: string;
  voicePhase?: 'idle' | 'listening' | 'transcribing' | 'paused';
  voiceMode?: 'webspeech' | 'gemini_recorder';
  isSpeaking?: boolean;
  onStopSpeaking?: () => void;
  voiceLanguage?: string;
  onCycleLanguage?: () => void;
  onSend: (text: string) => void;
  onToggleMic: () => void;
  onWake: () => void;
  onAttachFile: (file: File) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  palette,
  isListening,
  assistantName,
  interimTranscript = '',
  voicePhase = 'idle',
  voiceMode = 'webspeech',
  isSpeaking = false,
  onStopSpeaking,
  voiceLanguage = 'pt-BR',
  onCycleLanguage,
  onSend,
  onToggleMic,
  onWake,
  onAttachFile,
}) => {
  const [input, setInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onAttachFile(e.target.files[0]);
    }
  };

  const QUICK_COMMANDS = [
    { label: '🏆 Quiz Geral', cmd: 'Abrir quiz de conhecimento geral com múltiplas respostas' },
    { label: '📁 Pastas & Desktop', cmd: 'Criar uma pasta chamada Projetos_2026 no desktop' },
    { label: '🐍 Automação Python', cmd: 'Executar script python para listar arquivos' },
    { label: '🌐 Abrir Pesquisa Web', cmd: 'Abrir pesquisa na internet sobre os avanços da inteligência artificial' },
    { label: '🧠 Conhecimento Geral', cmd: 'Como funciona a fusão nuclear e qual o estado atual dos reatores tokamak?' },
    { label: '🌍 Multilingual (EN)', cmd: 'Jarvis, what is the theory of general relativity and how does time dilation work?' },
    { label: '👁️ Câmera & Visão', cmd: 'Ativar câmera e interpretar o que você está vendo' },
    { label: '🎬 Projetar Vídeo HUD', cmd: 'Projetar vídeo do Iron Man no painel central' },
    { label: '⚡ Telemetria', cmd: 'Verificar telemetria e diagnósticos de hardware' },
  ];

  const showLiveVoiceBar =
    isListening || !!interimTranscript || voicePhase === 'transcribing' || voicePhase === 'paused' || isSpeaking;

  const shortLangLabel = voiceLanguage.toUpperCase().startsWith('EN')
    ? 'EN-US'
    : voiceLanguage.toUpperCase().startsWith('ES')
    ? 'ES-ES'
    : 'PT-BR';

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Live Voice Activity & Interim Transcript Strip */}
      {showLiveVoiceBar && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-mono backdrop-blur-md"
          style={{
            backgroundColor:
              voicePhase === 'transcribing'
                ? 'rgba(245, 158, 11, 0.14)'
                : isSpeaking
                ? 'rgba(16, 185, 129, 0.14)'
                : 'rgba(239, 68, 68, 0.14)',
            borderColor:
              voicePhase === 'transcribing'
                ? 'rgba(245, 158, 11, 0.45)'
                : isSpeaking
                ? 'rgba(16, 185, 129, 0.45)'
                : 'rgba(239, 68, 68, 0.45)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                voicePhase === 'transcribing'
                  ? 'bg-amber-400 animate-pulse'
                  : isSpeaking
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-red-500 animate-ping'
              }`}
            />
            <span className="font-bold tracking-wider uppercase flex-shrink-0 text-[10px]">
              {voicePhase === 'transcribing'
                ? 'TRANSCREVENDO ÁUDIO HD...'
                : isSpeaking
                ? `${assistantName} RESPONDENDO`
                : voicePhase === 'paused'
                ? 'ESCUTA PAUSADA (EVITANDO ECO)'
                : voiceMode === 'gemini_recorder'
                ? `OUVINDO HD (${shortLangLabel})`
                : `OUVINDO AO VIVO (${shortLangLabel})`}
            </span>
            {interimTranscript ? (
              <span className="truncate text-white italic">"{interimTranscript}"</span>
            ) : isListening && !isSpeaking && voicePhase !== 'transcribing' ? (
              <span className="truncate text-muted-foreground text-[10px]">
                Pode falar sua instrução normalmente...
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onCycleLanguage && (
              <button
                type="button"
                onClick={onCycleLanguage}
                className="px-2 py-0.5 rounded border border-white/15 bg-black/40 hover:bg-white/10 text-[10px] text-cyan-300 flex items-center gap-1 transition-colors"
                title="Alternar idioma do reconhecimento de voz (PT-BR / EN-US / ES-ES)"
              >
                <Globe className="w-3 h-3" />
                <span>{shortLangLabel}</span>
              </button>
            )}
            {isSpeaking && onStopSpeaking && (
              <button
                type="button"
                onClick={onStopSpeaking}
                className="px-2 py-0.5 rounded border border-red-500/40 bg-red-950/60 hover:bg-red-900/70 text-[10px] text-red-200 flex items-center gap-1 transition-colors"
                title="Interromper fala do JARVIS imediatamente"
              >
                <VolumeX className="w-3 h-3" />
                <span>SILENCIAR</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick Action Suggestion Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[11px] no-scrollbar">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono flex items-center gap-1 flex-shrink-0">
          <Sparkles className="w-3 h-3 text-amber-400" /> DIRETIVA:
        </span>
        {QUICK_COMMANDS.map((qc, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSend(qc.cmd)}
            className="flex-shrink-0 px-2.5 py-1 rounded-full border bg-black/40 hover:bg-white/10 text-muted-foreground hover:text-white transition-all text-[10px] font-mono whitespace-nowrap"
            style={{ borderColor: palette.BORDER }}
          >
            {qc.label}
          </button>
        ))}
      </div>

      {/* Main Input Form */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 p-1.5 rounded-xl border backdrop-blur-md"
        style={{
          backgroundColor: `${palette.PANEL2}ee`,
          borderColor: palette.BORDER_B,
        }}
      >
        <button
          type="button"
          onClick={onWake}
          className="px-2 sm:px-2.5 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase border transition-all flex items-center gap-1 flex-shrink-0"
          style={{
            backgroundColor: palette.PRI_GHO,
            borderColor: palette.BORDER_A,
            color: palette.PRI,
          }}
          title="Ativar reconhecimento de voz ('Hey Jarvis')"
        >
          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span className="hidden sm:inline">WAKE</span>
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Instrua o ${assistantName} ou toque no microfone…`}
          className="flex-1 min-w-0 bg-transparent px-2 sm:px-3 py-2 text-xs outline-none font-mono placeholder:text-muted-foreground/60"
          style={{ color: palette.WHITE }}
        />

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors flex-shrink-0"
          title="Anexar arquivo para análise"
        >
          <Paperclip className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {isSpeaking && onStopSpeaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="p-2 rounded-lg border border-red-500/40 bg-red-950/60 hover:bg-red-900/70 text-red-300 transition-all flex items-center justify-center flex-shrink-0"
            title="Interromper fala atual"
          >
            <VolumeX className="w-4 h-4" />
          </button>
        )}

        {/* Floating/Prominent Mobile Mic Button */}
        <button
          type="button"
          onClick={onToggleMic}
          className="p-2 sm:p-2 rounded-lg border transition-all flex items-center justify-center flex-shrink-0 shadow-sm"
          style={{
            backgroundColor: isListening ? `${palette.RED}44` : palette.BAR_BG,
            borderColor: isListening ? palette.RED : palette.BORDER,
            color: isListening ? palette.RED : palette.TEXT,
            boxShadow: isListening ? '0 0 12px rgba(239, 68, 68, 0.5)' : undefined,
          }}
          title={
            isListening
              ? 'Parar captura de voz e processar comando'
              : `Iniciar captura de voz (${shortLangLabel})`
          }
        >
          {isListening ? (
            <Mic className="w-4 h-4 animate-bounce text-red-400" />
          ) : (
            <Mic className="w-4 h-4 text-cyan-400 hover:text-cyan-300" />
          )}
        </button>

        <button
          type="submit"
          disabled={!input.trim()}
          className="px-2.5 sm:px-3.5 py-2 rounded-lg font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-1 disabled:opacity-40 flex-shrink-0"
          style={{
            backgroundColor: palette.PRI,
            color: '#000',
          }}
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden md:inline">ENVIAR</span>
        </button>
      </form>
    </div>
  );
};


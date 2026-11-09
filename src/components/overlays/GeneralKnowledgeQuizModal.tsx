import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Trophy,
  Brain,
  CheckCircle2,
  XCircle,
  Sparkles,
  RotateCcw,
  Volume2,
  VolumeX,
  ArrowRight,
  Award,
  Flame,
  Loader2,
  Layers,
} from 'lucide-react';
import { Palette } from '../../constants/theme';
import { speechEngine } from '../../utils/speech';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  category: string;
}

export interface QuizAnswerRecord {
  question: QuizQuestion;
  chosenIndex: number;
  isCorrect: boolean;
}

export interface QuizCompletionSummary {
  category: string;
  total: number;
  correct: number;
  percentage: number;
  bestStreak: number;
  source: string;
}

interface GeneralKnowledgeQuizModalProps {
  palette: Palette;
  assistantName: string;
  userName: string;
  activeVoiceId: string;
  onQuizComplete?: (summary: QuizCompletionSummary) => void;
  onClose: () => void;
}

const QUIZ_CATEGORIES = [
  'Conhecimento Geral Misto',
  'Ciência & Física',
  'História & Civilizações',
  'Geografia & Mundo',
  'Astronomia & Espaço',
  'Tecnologia & Computação',
  'Artes, Cultura & Idiomas',
] as const;

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Banco curado offline de alta precisão (todas com 4 alternativas distintas e explicações verificadas)
const CURATED_QUESTION_BANK: QuizQuestion[] = [
  // Ciência & Física
  {
    category: 'Ciência & Física',
    question: 'Qual é o elemento químico mais abundante na atmosfera terrestre?',
    options: ['Oxigênio', 'Nitrogênio', 'Dióxido de carbono', 'Argônio'],
    correctIndex: 1,
    explanation:
      'O nitrogênio (N₂) compõe aproximadamente 78% da atmosfera da Terra, seguido pelo oxigênio com cerca de 21%.',
  },
  {
    category: 'Ciência & Física',
    question: 'Qual cientista formulou a Teoria da Relatividade Geral em 1915?',
    options: ['Isaac Newton', 'Niels Bohr', 'Albert Einstein', 'Max Planck'],
    correctIndex: 2,
    explanation:
      'Albert Einstein publicou a Teoria da Relatividade Geral em 1915, descrevendo a gravidade como curvatura do espaço-tempo.',
  },
  {
    category: 'Ciência & Física',
    question: 'Qual é a velocidade aproximada da luz no vácuo?',
    options: ['300 mil km/h', '300 mil km/s', '150 milhões de km/s', '30 mil km/s'],
    correctIndex: 1,
    explanation:
      'No vácuo, a luz propaga-se exatamente a 299.792.458 metros por segundo, valor arredondado para 300 mil km/s.',
  },
  {
    category: 'Ciência & Física',
    question: 'Qual partícula subatômica possui carga elétrica negativa?',
    options: ['Próton', 'Nêutron', 'Elétron', 'Fóton'],
    correctIndex: 2,
    explanation:
      'O elétron possui carga elétrica negativa elementar (-1), enquanto o próton tem carga positiva e o nêutron é eletricamente neutro.',
  },
  {
    category: 'Ciência & Física',
    question: 'Qual organela celular é considerada a principal produtora de energia (ATP) nos eucariontes?',
    options: ['Ribossomo', 'Complexo de Golgi', 'Lisossomo', 'Mitocôndria'],
    correctIndex: 3,
    explanation:
      'As mitocôndrias realizam a respiração celular aeróbica, gerando a maior parte do ATP utilizado pela célula.',
  },

  // História & Civilizações
  {
    category: 'História & Civilizações',
    question: 'Em que ano ocorreu a Proclamação da República no Brasil?',
    options: ['1822', '1888', '1889', '1891'],
    correctIndex: 2,
    explanation:
      'A Proclamação da República aconteceu em 15 de novembro de 1889, liderada pelo Marechal Deodoro da Fonseca.',
  },
  {
    category: 'História & Civilizações',
    question: 'Qual civilização antiga construiu a cidadela inca de Machu Picchu nos Andes?',
    options: ['Maias', 'Astecas', 'Incas', 'Olmecas'],
    correctIndex: 2,
    explanation:
      'Machu Picchu foi erguida pelo Império Inca no século XV, no alto da cordilheira dos Andes, no atual Peru.',
  },
  {
    category: 'História & Civilizações',
    question: 'Qual tratado de 1494 dividiu as terras recém-descobertas entre Portugal e Espanha?',
    options: ['Tratado de Madri', 'Tratado de Tordesilhas', 'Tratado de Versalhes', 'Tratado de Utrecht'],
    correctIndex: 1,
    explanation:
      'O Tratado de Tordesilhas, assinado em 7 de junho de 1494, estabeleceu um meridiano a 370 léguas a oeste de Cabo Verde.',
  },
  {
    category: 'História & Civilizações',
    question: 'Em que ano caiu o Muro de Berlim, marcando simbolicamente o fim da Guerra Fria?',
    options: ['1979', '1985', '1989', '1993'],
    correctIndex: 2,
    explanation:
      'A queda do Muro de Berlim ocorreu em 9 de novembro de 1989, abrindo caminho para a reunificação alemã em 1990.',
  },
  {
    category: 'História & Civilizações',
    question: 'Qual invenção de Johannes Gutenberg revolucionou a difusão do conhecimento na Europa no século XV?',
    options: ['Bússola magnética', 'Telescópio refrator', 'Prensa de tipos móveis', 'Máquina a vapor'],
    correctIndex: 2,
    explanation:
      'Por volta de 1450, Gutenberg desenvolveu a prensa tipográfica de tipos móveis metálicos na Alemanha.',
  },

  // Geografia & Mundo
  {
    category: 'Geografia & Mundo',
    question: 'Qual é o maior oceano do planeta Terra em área e volume de água?',
    options: ['Oceano Atlântico', 'Oceano Índico', 'Oceano Pacífico', 'Oceano Ártico'],
    correctIndex: 2,
    explanation:
      'O Oceano Pacífico cobre cerca de um terço da superfície total da Terra e abriga a Fossa das Marianas.',
  },
  {
    category: 'Geografia & Mundo',
    question: 'Qual é a capital oficial da Austrália?',
    options: ['Sydney', 'Melbourne', 'Brisbane', 'Camberra'],
    correctIndex: 3,
    explanation:
      'Embora Sydney e Melbourne sejam as cidades mais populosas, Camberra foi escolhida e planejada como capital da Austrália em 1913.',
  },
  {
    category: 'Geografia & Mundo',
    question: 'Qual país possui o maior número de fusos horários considerando também seus territórios ultramarinos?',
    options: ['Rússia', 'Estados Unidos', 'França', 'Canadá'],
    correctIndex: 2,
    explanation:
      'Devido aos seus departamentos e territórios espalhados por vários oceanos, a França soma 12 fusos horários (ou 13 no verão).',
  },
  {
    category: 'Geografia & Mundo',
    question: 'Em qual continente está localizado o Deserto do Atacama, considerado o deserto não polar mais árido do mundo?',
    options: ['África', 'Ásia', 'Oceania', 'América do Sul'],
    correctIndex: 3,
    explanation:
      'O Deserto do Atacama localiza-se principalmente no norte do Chile, na América do Sul.',
  },
  {
    category: 'Geografia & Mundo',
    question: 'Qual é o maior rio do mundo em volume de água e extensão segundo levantamentos hidrográficos modernos?',
    options: ['Rio Nilo', 'Rio Amazonas', 'Rio Yangtzé', 'Rio Mississippi'],
    correctIndex: 1,
    explanation:
      'O Rio Amazonas é indiscutivelmente o maior em vazão de água do planeta e possui cerca de 6.992 km de extensão.',
  },

  // Astronomia & Espaço
  {
    category: 'Astronomia & Espaço',
    question: 'Qual planeta do Sistema Solar possui a maior massa e é o maior em diâmetro?',
    options: ['Saturno', 'Urano', 'Júpiter', 'Netuno'],
    correctIndex: 2,
    explanation:
      'Júpiter é um gigante gasoso com massa mais de duas vezes superior à soma de todos os outros planetas do Sistema Solar juntos.',
  },
  {
    category: 'Astronomia & Espaço',
    question: 'Qual missão espacial levou os primeiros seres humanos a pisarem na Lua em julho de 1969?',
    options: ['Apollo 8', 'Apollo 11', 'Apollo 13', 'Gemini 12'],
    correctIndex: 1,
    explanation:
      'Em 20 de julho de 1969, Neil Armstrong e Buzz Aldrin pousaram na superfície lunar com o módulo Águia da missão Apollo 11.',
  },
  {
    category: 'Astronomia & Espaço',
    question: 'Qual é o planeta mais próximo do Sol?',
    options: ['Vênus', 'Marte', 'Mercúrio', 'Terra'],
    correctIndex: 2,
    explanation:
      'Mercúrio orbita a uma distância média de cerca de 57,9 milhões de km do Sol, completando uma volta a cada 88 dias terrestres.',
  },
  {
    category: 'Astronomia & Espaço',
    question: 'Como se chama a região ao redor de um buraco negro da qual nem a luz consegue escapar?',
    options: ['Cinturão de Kuiper', 'Nuvem de Oort', 'Horizonte de eventos', 'Zona de Lagrange'],
    correctIndex: 2,
    explanation:
      'O horizonte de eventos é a fronteira matemática e física a partir da qual a velocidade de escape supera a velocidade da luz.',
  },
  {
    category: 'Astronomia & Espaço',
    question: 'Qual é a galáxia espiral mais próxima da Via Láctea com porte semelhante?',
    options: ['Galáxia de Andrômeda', 'Galáxia do Sombreiro', 'Galáxia do Triângulo', 'Grande Nuvem de Magalhães'],
    correctIndex: 0,
    explanation:
      'Andrômeda (M31) é a grande galáxia espiral vizinha da Via Láctea, situada a cerca de 2,5 milhões de anos-luz.',
  },

  // Tecnologia & Computação
  {
    category: 'Tecnologia & Computação',
    question: 'O que significa a sigla HTTP usada nos endereços da web?',
    options: [
      'High Tech Transmission Process',
      'Hypertext Transfer Protocol',
      'Hybrid Terminal Transport Path',
      'Host Tracking Text Protocol',
    ],
    correctIndex: 1,
    explanation:
      'HTTP vem de Hypertext Transfer Protocol, o protocolo fundamental de transferência de documentos na World Wide Web.',
  },
  {
    category: 'Tecnologia & Computação',
    question: 'Quem é historicamente reconhecida como a autora do primeiro algoritmo criado para ser processado por uma máquina?',
    options: ['Grace Hopper', 'Margaret Hamilton', 'Ada Lovelace', 'Hedy Lamarr'],
    correctIndex: 2,
    explanation:
      'Ada Lovelace publicou em 1843 o primeiro algoritmo destinado à Máquina Analítica concebida por Charles Babbage.',
  },
  {
    category: 'Tecnologia & Computação',
    question: 'Quantos bits existem em exatamente 1 byte?',
    options: ['4 bits', '8 bits', '16 bits', '32 bits'],
    correctIndex: 1,
    explanation:
      'Por padronização internacional da computação digital, 1 byte equivale a 8 bits.',
  },
  {
    category: 'Tecnologia & Computação',
    question: 'Qual cientista propôs em 1950 o famoso teste para avaliar se uma máquina exibe comportamento inteligente indistinguível de um humano?',
    options: ['John von Neumann', 'Alan Turing', 'Claude Shannon', 'Tim Berners-Lee'],
    correctIndex: 1,
    explanation:
      'Alan Turing apresentou o "Jogo da Imitação", hoje conhecido como Teste de Turing, em seu artigo de 1950.',
  },
  {
    category: 'Tecnologia & Computação',
    question: 'Em programação Python, qual palavra-chave é usada para definir uma função?',
    options: ['func', 'function', 'def', 'lambda_fn'],
    correctIndex: 2,
    explanation:
      'Em Python, funções nomeadas são declaradas utilizando a palavra reservada "def".',
  },

  // Artes, Cultura & Idiomas
  {
    category: 'Artes, Cultura & Idiomas',
    question: 'Quem pintou o famoso mural "Guernica", retratando os horrores da guerra em 1937?',
    options: ['Salvador Dalí', 'Pablo Picasso', 'Joan Miró', 'Diego Velázquez'],
    correctIndex: 1,
    explanation:
      'Pablo Picasso pintou "Guernica" em 1937 como reação ao bombardeio da cidade basca de Guernica durante a Guerra Civil Espanhola.',
  },
  {
    category: 'Artes, Cultura & Idiomas',
    question: 'Qual escritor brasileiro é o autor do romance clássico "Dom Casmurro"?',
    options: ['José de Alencar', 'Jorge Amado', 'Machado de Assis', 'Graciliano Ramos'],
    correctIndex: 2,
    explanation:
      'Publicado em 1899, "Dom Casmurro" é uma das obras-primas de Machado de Assis e da literatura brasileira.',
  },
  {
    category: 'Artes, Cultura & Idiomas',
    question: 'Em música, quantas teclas brancas e pretas compõem normalmente um piano acústico padrão de concerto?',
    options: ['76 teclas', '84 teclas', '88 teclas', '92 teclas'],
    correctIndex: 2,
    explanation:
      'Um piano padrão moderno possui exatamente 88 teclas: 52 brancas e 36 pretas, cobrindo pouco mais de sete oitavas.',
  },
  {
    category: 'Artes, Cultura & Idiomas',
    question: 'Qual é o idioma oficial com o maior número de falantes nativos no mundo?',
    options: ['Inglês', 'Espanhol', 'Hindi', 'Mandarim'],
    correctIndex: 3,
    explanation:
      'O chinês mandarim ocupa o primeiro lugar mundial em número de falantes nativos, superando 900 milhões de pessoas.',
  },
  {
    category: 'Artes, Cultura & Idiomas',
    question: 'Qual teatro famoso em Manaus foi inaugurado em 1896 durante o auge do Ciclo da Borracha?',
    options: ['Teatro Municipal', 'Teatro Amazonas', 'Teatro Castro Alves', 'Teatro da Paz'],
    correctIndex: 1,
    explanation:
      'O Teatro Amazonas, com sua icônica cúpula revestida em cerâmica vitrificada colorida, é o maior símbolo arquitetônico de Manaus.',
  },
  {
    category: 'Ciência & Física',
    question: 'Qual é a fórmula química da água pesada, utilizada como moderador em certos reatores nucleares?',
    options: ['H₂O₂', 'D₂O', 'H₂SO₄', 'CO₂'],
    correctIndex: 1,
    explanation:
      'A água pesada (D₂O ou ²H₂O) é composta por átomos de deutério, um isótopo estável do hidrogênio com um nêutron no núcleo.',
  },
  {
    category: 'Geografia & Mundo',
    question: 'Qual país faz fronteira terrestre com todos os países da América do Sul, EXCETO Chile e Equador?',
    options: ['Argentina', 'Peru', 'Bolívia', 'Brasil'],
    correctIndex: 3,
    explanation:
      'O Brasil faz fronteira com dez países sul-americanos, ficando sem limite direto apenas com o Chile e o Equador.',
  },
];

function shuffleArray<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const GeneralKnowledgeQuizModal: React.FC<GeneralKnowledgeQuizModalProps> = ({
  palette,
  assistantName,
  userName,
  activeVoiceId,
  onQuizComplete,
  onClose,
}) => {
  const firstName = (userName || 'Senhor').trim().split(/\s+/)[0];

  const [stage, setStage] = useState<'lobby' | 'loading' | 'playing' | 'summary'>('lobby');
  const [selectedCategory, setSelectedCategory] = useState<string>('Conhecimento Geral Misto');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizSourceLabel, setQuizSourceLabel] = useState<string>('BANCO MARK LVI');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [records, setRecords] = useState<QuizAnswerRecord[]>([]);

  useEffect(() => {
    return () => {
      speechEngine.stopSpeaking();
    };
  }, []);

  const currentQuestion = questions[currentIndex];

  const handleStartQuiz = async () => {
    setStage('loading');
    setCurrentIndex(0);
    setSelectedOption(null);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setRecords([]);

    let aiQuestions: QuizQuestion[] = [];
    let sourceLabel = 'BANCO OFFLINE MARK LVI (4+ ALTERNATIVAS)';

    // Solicita perguntas inéditas à API do servidor (Gemini 3.8 Flash)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9500);
      const resp = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          count: questionCount,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data?.questions) && data.questions.length > 0) {
          aiQuestions = data.questions.filter(
            (q: any) =>
              q &&
              typeof q.question === 'string' &&
              Array.isArray(q.options) &&
              q.options.length >= 4 &&
              typeof q.correctIndex === 'number' &&
              q.correctIndex >= 0 &&
              q.correctIndex < q.options.length
          );
          if (aiQuestions.length > 0) {
            sourceLabel = 'GERADO POR IA (GEMINI) + VERIFICAÇÃO MARK LVI';
          }
        }
      }
    } catch (err) {
      console.warn('Quiz AI endpoint fallback para banco curado:', err);
    }

    // Completa ou substitui com banco offline curado para garantir contagem exata e zero falhas
    const categoryMatches =
      selectedCategory === 'Conhecimento Geral Misto'
        ? CURATED_QUESTION_BANK
        : CURATED_QUESTION_BANK.filter((q) => q.category === selectedCategory);

    const remainingBank = CURATED_QUESTION_BANK.filter(
      (q) => !categoryMatches.some((cm) => cm.question === q.question)
    );

    const curatedPool = [...shuffleArray(categoryMatches), ...shuffleArray(remainingBank)];

    const combined: QuizQuestion[] = [...aiQuestions];
    const seen = new Set(combined.map((q) => q.question.toLowerCase().trim()));
    for (const q of curatedPool) {
      if (combined.length >= questionCount) break;
      if (!seen.has(q.question.toLowerCase().trim())) {
        combined.push(q);
        seen.add(q.question.toLowerCase().trim());
      }
    }

    const finalList = combined.slice(0, questionCount);
    setQuestions(finalList);
    setQuizSourceLabel(sourceLabel);
    setStage('playing');

    if (voiceEnabled && finalList[0]) {
      speechEngine.speak(
        `Pergunta 1, ${firstName}: ${finalList[0].question}`,
        activeVoiceId
      );
    }
  };

  const handleSelectOption = useCallback(
    (optIndex: number) => {
      if (stage !== 'playing' || selectedOption !== null || !currentQuestion) return;
      if (optIndex < 0 || optIndex >= currentQuestion.options.length) return;

      setSelectedOption(optIndex);
      const isCorrect = optIndex === currentQuestion.correctIndex;

      if (isCorrect) {
        setScore((prev) => prev + 1);
        setStreak((prev) => {
          const next = prev + 1;
          setBestStreak((b) => Math.max(b, next));
          return next;
        });
      } else {
        setStreak(0);
      }

      setRecords((prev) => [
        ...prev,
        {
          question: currentQuestion,
          chosenIndex: optIndex,
          isCorrect,
        },
      ]);

      if (voiceEnabled) {
        const correctLetter = OPTION_LETTERS[currentQuestion.correctIndex] || 'A';
        const prefix = isCorrect
          ? `Correto, ${firstName}!`
          : `Resposta incorreta. A alternativa correta é a letra ${correctLetter}: ${currentQuestion.options[currentQuestion.correctIndex]}.`;
        speechEngine.speak(`${prefix} ${currentQuestion.explanation}`, activeVoiceId);
      }
    },
    [stage, selectedOption, currentQuestion, voiceEnabled, firstName, activeVoiceId]
  );

  const handleNextQuestion = useCallback(() => {
    if (stage !== 'playing' || selectedOption === null) return;

    const nextIdx = currentIndex + 1;
    if (nextIdx >= questions.length) {
      setStage('summary');
      const total = questions.length;
      const pct = total > 0 ? Math.round((score / total) * 100) : 0;

      if (voiceEnabled) {
        speechEngine.speak(
          `Quiz finalizado, ${firstName}. Você acertou ${score} de ${total} perguntas, com ${pct} por cento de aproveitamento.`,
          activeVoiceId
        );
      }

      onQuizComplete?.({
        category: selectedCategory,
        total,
        correct: score,
        percentage: pct,
        bestStreak,
        source: quizSourceLabel,
      });
      return;
    }

    setCurrentIndex(nextIdx);
    setSelectedOption(null);

    if (voiceEnabled && questions[nextIdx]) {
      speechEngine.speak(
        `Pergunta ${nextIdx + 1}: ${questions[nextIdx].question}`,
        activeVoiceId
      );
    }
  }, [
    stage,
    selectedOption,
    currentIndex,
    questions,
    score,
    voiceEnabled,
    firstName,
    activeVoiceId,
    onQuizComplete,
    selectedCategory,
    bestStreak,
    quizSourceLabel,
  ]);

  // Atalhos de teclado: 1-4 ou A-D para responder, Enter/Espaço para avançar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (stage !== 'playing' || !currentQuestion) return;

      const key = e.key.toUpperCase();
      if (selectedOption === null) {
        const map: Record<string, number> = {
          '1': 0,
          '2': 1,
          '3': 2,
          '4': 3,
          A: 0,
          B: 1,
          C: 2,
          D: 3,
        };
        if (key in map && map[key] < currentQuestion.options.length) {
          e.preventDefault();
          handleSelectOption(map[key]);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleNextQuestion();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage, currentQuestion, selectedOption, handleSelectOption, handleNextQuestion]);

  const toggleVoice = () => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      if (!next) speechEngine.stopSpeaking();
      return next;
    });
  };

  const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  const getRankLabel = (pct: number) => {
    if (pct >= 90) return { title: 'NÍVEL GENIAL // STARK ELITE', color: '#10b981' };
    if (pct >= 70) return { title: 'DESEMPENHO TÁTICO AVANÇADO', color: '#00d4ff' };
    if (pct >= 50) return { title: 'CONHECIMENTO SÓLIDO EM PROGRESSO', color: '#f59e0b' };
    return { title: 'CALIBRAÇÃO RECOMENDADA', color: '#f87171' };
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        style={{
          backgroundColor: `${palette.PANEL2}fa`,
          borderColor: palette.PRI,
          boxShadow: `0 0 40px ${palette.PRI}44`,
        }}
      >
        {/* Header */}
        <div
          className="p-3.5 sm:p-4 border-b flex items-center justify-between font-mono text-xs gap-2"
          style={{ borderColor: palette.BORDER }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Trophy className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm tracking-widest uppercase text-white truncate">
                  QUIZ DE CONHECIMENTO GERAL // {assistantName}
                </h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  MÚLTIPLA ESCOLHA (4 OPÇÕES)
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">
                {stage === 'playing'
                  ? `${quizSourceLabel} • Categoria: ${currentQuestion?.category || selectedCategory}`
                  : `Operador: ${firstName} • Desafio com perguntas e explicações via Fish Audio`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={toggleVoice}
              className="px-2.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-[11px] flex items-center gap-1.5 transition-colors"
              style={{
                color: voiceEnabled ? palette.PRI : '#9ca3af',
                borderColor: voiceEnabled ? palette.BORDER_A : undefined,
              }}
              title={voiceEnabled ? 'Silenciar leitura por voz' : 'Ativar leitura por voz'}
            >
              {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{voiceEnabled ? 'VOZ ATIVA' : 'MUDO'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                speechEngine.stopSpeaking();
                onClose();
              }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
              title="Fechar Quiz"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 font-mono">
          {/* STAGE 1: LOBBY */}
          {stage === 'lobby' && (
            <div className="space-y-6">
              <div className="text-center space-y-2 max-w-xl mx-auto">
                <div
                  className="w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center shadow-[0_0_24px_rgba(245,158,11,0.3)]"
                  style={{ borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.12)' }}
                >
                  <Brain className="w-7 h-7 text-amber-400" />
                </div>
                <h4 className="text-lg font-bold text-white tracking-wide">
                  Preparado para o Desafio de Conhecimento Geral, {firstName}?
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Todas as perguntas trazem 4 alternativas (A, B, C e D), feedback imediato e explicação detalhada pelo {assistantName}.
                </p>
              </div>

              {/* Category Selector */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                  <Layers className="w-3.5 h-3.5" />
                  <span>SELECIONE A CATEGORIA DO QUIZ:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {QUIZ_CATEGORIES.map((cat) => {
                    const active = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className="p-3 rounded-xl border text-left text-xs transition-all flex items-center justify-between"
                        style={{
                          borderColor: active ? palette.PRI : palette.BORDER,
                          backgroundColor: active ? `${palette.PRI}22` : `${palette.PANEL}99`,
                          color: active ? '#fff' : palette.TEXT,
                        }}
                      >
                        <span className="font-bold">{cat}</span>
                        {active && <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question Count Selector */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                  QUANTIDADE DE PERGUNTAS DA RODADA:
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {[5, 10, 15].map((cnt) => {
                    const active = questionCount === cnt;
                    return (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setQuestionCount(cnt)}
                        className="py-2.5 px-3 rounded-xl border text-center text-xs font-bold transition-all"
                        style={{
                          borderColor: active ? palette.PRI : palette.BORDER,
                          backgroundColor: active ? `${palette.PRI}25` : 'rgba(0,0,0,0.4)',
                          color: active ? palette.PRI : palette.TEXT,
                        }}
                      >
                        {cnt} Perguntas
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartQuiz}
                className="w-full py-3.5 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.99] shadow-lg"
                style={{
                  backgroundColor: palette.PRI,
                  color: '#000',
                }}
              >
                <Sparkles className="w-4 h-4" />
                <span>INICIAR QUIZ DE CONHECIMENTO GERAL</span>
              </button>
            </div>
          )}

          {/* STAGE 2: LOADING */}
          {stage === 'loading' && (
            <div className="py-16 flex flex-col items-center justify-center gap-4 text-center">
              <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
              <div className="space-y-1">
                <div className="text-sm font-bold text-white tracking-wider uppercase">
                  COMPILANDO PERGUNTAS INÉDITAS...
                </div>
                <p className="text-xs text-muted-foreground">
                  Consultando Google AI Studio e matriz tática do {assistantName} para &quot;{selectedCategory}&quot;.
                </p>
              </div>
            </div>
          )}

          {/* STAGE 3: PLAYING */}
          {stage === 'playing' && currentQuestion && (
            <div className="space-y-5">
              {/* Top Progress & Score Pills */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-cyan-300 font-bold">
                    PERGUNTA {currentIndex + 1} / {questions.length}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    {currentQuestion.category}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                    ACERTOS: {score}
                  </span>
                  {streak > 1 && (
                    <span className="px-2.5 py-1 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 font-bold flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" />
                      {streak}x
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${((currentIndex + (selectedOption !== null ? 1 : 0)) / questions.length) * 100}%`,
                    backgroundColor: palette.PRI,
                  }}
                />
              </div>

              {/* Question Card */}
              <div
                className="p-4 sm:p-5 rounded-xl border"
                style={{
                  borderColor: palette.BORDER_A,
                  backgroundColor: 'rgba(0,0,0,0.45)',
                }}
              >
                <h4 className="text-sm sm:text-base font-bold text-white leading-relaxed font-sans select-text">
                  {currentQuestion.question}
                </h4>
              </div>

              {/* Multiple Choice Options (at least 4: A, B, C, D) */}
              <div className="space-y-2.5">
                {currentQuestion.options.map((optText, idx) => {
                  const letter = OPTION_LETTERS[idx] || String(idx + 1);
                  const isAnswered = selectedOption !== null;
                  const isChosen = selectedOption === idx;
                  const isRightAnswer = idx === currentQuestion.correctIndex;

                  let borderCol = palette.BORDER;
                  let bgCol = `${palette.PANEL}99`;
                  let badgeBg = 'bg-white/10 text-cyan-300 border-white/15';

                  if (isAnswered) {
                    if (isRightAnswer) {
                      borderCol = '#10b981';
                      bgCol = 'rgba(16, 185, 129, 0.16)';
                      badgeBg = 'bg-emerald-500 text-black border-emerald-400';
                    } else if (isChosen && !isRightAnswer) {
                      borderCol = '#ef4444';
                      bgCol = 'rgba(239, 68, 68, 0.16)';
                      badgeBg = 'bg-red-500 text-white border-red-400';
                    } else {
                      bgCol = 'rgba(0,0,0,0.3)';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isAnswered}
                      onClick={() => handleSelectOption(idx)}
                      className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center gap-3 group ${
                        !isAnswered ? 'hover:bg-white/10 active:scale-[0.99]' : 'cursor-default'
                      }`}
                      style={{
                        borderColor: borderCol,
                        backgroundColor: bgCol,
                      }}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg border font-bold text-xs flex items-center justify-center flex-shrink-0 ${badgeBg}`}
                      >
                        {letter}
                      </span>

                      <span className="flex-1 text-xs sm:text-sm font-sans text-white/95 leading-snug">
                        {optText}
                      </span>

                      {isAnswered && isRightAnswer && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      )}
                      {isAnswered && isChosen && !isRightAnswer && (
                        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Explanation & Next Button */}
              {selectedOption !== null && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div
                    className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                      selectedOption === currentQuestion.correctIndex
                        ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-100'
                        : 'border-amber-500/40 bg-amber-950/40 text-amber-100'
                    }`}
                  >
                    <div className="font-bold uppercase tracking-wider text-[10px]">
                      {selectedOption === currentQuestion.correctIndex
                        ? `✓ RESPOSTA CORRETA — NOTA DO ${assistantName}:`
                        : `✕ ALTERNATIVA CORRETA: ${OPTION_LETTERS[currentQuestion.correctIndex]} — NOTA DO ${assistantName}:`}
                    </div>
                    <p className="font-sans text-xs leading-relaxed opacity-95">
                      {currentQuestion.explanation}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.99]"
                    style={{
                      backgroundColor: palette.PRI,
                      color: '#000',
                    }}
                  >
                    <span>
                      {currentIndex + 1 >= questions.length
                        ? 'FINALIZAR E VER RESULTADO'
                        : 'PRÓXIMA PERGUNTA'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {selectedOption === null && (
                <div className="text-center text-[10px] text-muted-foreground">
                  Dica: use as teclas <span className="text-cyan-400">A / B / C / D</span> ou{' '}
                  <span className="text-cyan-400">1 – 4</span> para responder rapidamente.
                </div>
              )}
            </div>
          )}

          {/* STAGE 4: SUMMARY */}
          {stage === 'summary' && (
            <div className="space-y-6">
              {(() => {
                const rank = getRankLabel(percentage);
                return (
                  <div
                    className="p-5 rounded-2xl border text-center space-y-3"
                    style={{
                      borderColor: rank.color,
                      backgroundColor: 'rgba(0,0,0,0.45)',
                    }}
                  >
                    <Award className="w-12 h-12 mx-auto" style={{ color: rank.color }} />
                    <div
                      className="text-[10px] font-bold tracking-[0.2em] uppercase"
                      style={{ color: rank.color }}
                    >
                      {rank.title}
                    </div>
                    <h4 className="text-2xl font-extrabold text-white">
                      {score} / {questions.length} Acertos ({percentage}%)
                    </h4>
                    <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
                      <span>Categoria: {selectedCategory}</span>
                      <span>•</span>
                      <span>Maior sequência: {bestStreak} acertos seguidos</span>
                    </div>
                  </div>
                );
              })()}

              {/* Review List */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                  REVISÃO DA RODADA ({records.length} QUESTÕES)
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {records.map((rec, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl border border-white/10 bg-black/35 text-xs space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-sans font-semibold text-white">
                          {i + 1}. {rec.question.question}
                        </span>
                        {rec.isCorrect ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-sans">
                        Sua resposta:{' '}
                        <span className={rec.isCorrect ? 'text-emerald-300' : 'text-red-300'}>
                          {OPTION_LETTERS[rec.chosenIndex]}) {rec.question.options[rec.chosenIndex]}
                        </span>
                        {!rec.isCorrect && (
                          <>
                            {' • '}Correta:{' '}
                            <span className="text-emerald-300">
                              {OPTION_LETTERS[rec.question.correctIndex]}){' '}
                              {rec.question.options[rec.question.correctIndex]}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleStartQuiz}
                  className="py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:brightness-110"
                  style={{ backgroundColor: palette.PRI, color: '#000' }}
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>NOVA RODADA ({selectedCategory.split(' ')[0]})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    speechEngine.stopSpeaking();
                    setStage('lobby');
                  }}
                  className="py-3 rounded-xl border font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-white/10 text-white transition-all"
                  style={{ borderColor: palette.BORDER }}
                >
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>ESCOLHER OUTRA CATEGORIA</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

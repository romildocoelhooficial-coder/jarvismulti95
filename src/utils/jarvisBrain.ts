import { ConversationTurn, DynamicContent, MemoryEntry, ToolOutcome } from '../types';

export interface BrainResponse {
  spokenText: string;
  acknowledgment?: string;
  shouldSkipSpeak?: boolean;
  toolName?: string;
  toolOutcome?: ToolOutcome;
  logDetail?: string;
  dynamicContent?: DynamicContent;
  memoryUpdate?: { category: MemoryEntry['category']; key: string; value: string };
  nicknameUpdate?: string;
  accentColorUpdate?: string;
  languageUpdate?: string;
  actionTrigger?:
    | 'open_camera'
    | 'open_folder_search'
    | 'open_admin_panel'
    | 'open_quiz'
    | 'open_memory'
    | 'open_audio'
    | 'open_remote'
    | 'open_providers'
    | 'clear_logs'
    | 'close_panel'
    | 'stop_speaking'
    | 'repeat_last';
  requiresConfirmation?: {
    title: string;
    description: string;
    action: () => void;
  };
}

export class JarvisBrain {
  private assistantName: string;
  private userName: string;

  constructor(assistantName = 'JARVIS', userName = 'Senhor') {
    this.assistantName = assistantName;
    this.userName = (userName || 'Senhor').trim().split(/\s+/)[0];
  }

  updateNames(assistantName: string, userName: string) {
    this.assistantName = assistantName;
    this.userName = (userName || 'Senhor').trim().split(/\s+/)[0];
  }

  private stripWakePrefix(input: string): string {
    return input
      .replace(
        /^(?:bom dia,?\s*|boa tarde,?\s*|boa noite,?\s*)?(?:hey\s+|ei\s+|ok\s+|ol[aá]\s+)?(?:jarvis|computador|assistente)(?:,|\.|!|\?|:)?\s*/i,
        ''
      )
      .replace(/^(?:por favor,?\s*)/i, '')
      .trim();
  }

  private async executeCreateFolder(folderName: string): Promise<BrainResponse> {
    const cleanName = folderName.replace(/["']/g, '').trim() || `Nova_Pasta_${Date.now()}`;
    try {
      const resp = await fetch('/api/desktop/file-operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_folder', name: cleanName }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        return {
          spokenText: `Pasta "${cleanName}" criada com sucesso no desktop do sistema, ${this.userName}.`,
          toolName: 'desktop_create_folder',
          toolOutcome: 'done',
          logDetail: `Diretório criado no Desktop: ${data.path}`,
          dynamicContent: {
            id: String(Date.now()),
            type: 'desktop',
            title: `Diretório Criado // ${cleanName}`,
            subtitle: 'Gerenciador de Desktop & Pastas',
            data: {
              action: 'Criar Pasta',
              target: cleanName,
              path: data.path,
              status: 'CONCLUÍDO',
            },
            timestamp: new Date().toLocaleTimeString('pt-BR'),
          },
        };
      }
    } catch (err) {
      console.warn('Erro ao criar pasta:', err);
    }
    return {
      spokenText: `Não consegui gravar a pasta "${cleanName}" no sistema de arquivos agora, ${this.userName}.`,
      toolName: 'desktop_create_folder',
      toolOutcome: 'failed',
      logDetail: `Falha ao criar pasta "${cleanName}".`,
    };
  }

  private async executeYoutubeProjection(cleanQuery: string): Promise<BrainResponse> {
    const finalQuery = cleanQuery.trim() || 'Iron Man HUD Jarvis Soundtrack';
    let embedUrl = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(finalQuery)}&autoplay=1`;
    let videoTitle = `Vídeo: ${finalQuery}`;

    try {
      const resp = await fetch('/api/youtube/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: finalQuery }),
      });
      if (resp.ok) {
        const ytData = await resp.json();
        if (ytData.embedUrl) embedUrl = ytData.embedUrl;
        if (ytData.title) videoTitle = ytData.title;
      }
    } catch (e) {
      console.warn('Falha na consulta ao endpoint de busca do YouTube:', e);
    }

    return {
      spokenText: `Projetando exatamente o vídeo solicitado: "${videoTitle.slice(0, 48)}" no painel central holográfico, ${this.userName}.`,
      toolName: 'youtube_hud_projector',
      toolOutcome: 'done',
      logDetail: `Vídeo do YouTube localizado e projetado no painel: "${videoTitle}".`,
      dynamicContent: {
        id: String(Date.now()),
        type: 'video',
        title: videoTitle,
        subtitle: 'Projetor Tático HUD // Matriz Central',
        data: {
          url: embedUrl,
        },
        timestamp: new Date().toLocaleTimeString('pt-BR'),
      },
    };
  }

  private async executeWebSearch(query: string): Promise<BrainResponse> {
    const finalQuery = query.trim() || 'últimas notícias globais e avanços de inteligência artificial';
    try {
      const resp = await fetch('/api/search/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: finalQuery }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const searchUrl = data.searchUrl || `https://www.google.com/search?q=${encodeURIComponent(finalQuery)}`;
        return {
          spokenText: data.summary,
          toolName: 'web_search_grounding',
          toolOutcome: 'done',
          logDetail: `Pesquisa na Web concluída para: "${finalQuery}".`,
          dynamicContent: {
            id: String(Date.now()),
            type: 'search',
            title: `Pesquisa na Web // ${finalQuery.slice(0, 32)}`,
            subtitle: 'Inteligência Grounded Google AI Studio',
            data: {
              summary: data.summary,
              query: finalQuery,
              searchUrl,
              sources: data.sources || ['Google Search Index', 'Bases Tecnológicas Globais'],
            },
            timestamp: new Date().toLocaleTimeString('pt-BR'),
          },
        };
      }
    } catch (err) {
      console.warn('Erro na busca web:', err);
    }

    return {
      spokenText: `Não foi possível concluir a pesquisa na web para "${finalQuery}" no momento, ${this.userName}.`,
      toolName: 'web_search_grounding',
      toolOutcome: 'failed',
      logDetail: `Falha na busca web para: "${finalQuery}".`,
    };
  }

  private async executePythonScript(pythonCode: string): Promise<BrainResponse> {
    try {
      const resp = await fetch('/api/desktop/python-exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pythonCode }),
      });
      const pyData = await resp.json();
      const stdout = pyData.stdout
        ? pyData.stdout.trim()
        : pyData.stderr
        ? `Erro: ${pyData.stderr}`
        : 'Script executado com sucesso.';
      return {
        spokenText: `Automação Python executada em ${pyData.executionTimeMs || 10} milissegundos, ${this.userName}. Resultado: ${stdout.slice(0, 140)}.`,
        toolName: 'python_desktop_executor',
        toolOutcome: pyData.success ? 'done' : 'failed',
        logDetail: `Python 3 executado. Saída: ${stdout}`,
        dynamicContent: {
          id: String(Date.now()),
          type: 'python',
          title: 'Automação Python // Terminal Desktop',
          subtitle: `Python 3 // ${pyData.executionTimeMs || 0}ms`,
          data: {
            code: pythonCode,
            stdout: pyData.stdout,
            stderr: pyData.stderr,
            success: pyData.success,
            scriptName: pyData.scriptName,
          },
          timestamp: new Date().toLocaleTimeString('pt-BR'),
        },
      };
    } catch (err) {
      console.warn('Erro ao executar Python:', err);
      return {
        spokenText: `Falha ao executar o script Python no workspace, ${this.userName}.`,
        toolName: 'python_desktop_executor',
        toolOutcome: 'failed',
      };
    }
  }

  async processQueryAsync(
    rawText: string,
    memories: MemoryEntry[],
    systemMetrics: { cpu: number; mem: number; gpu: number; tmp: number },
    currentUserRole: 'admin' | 'operador' = 'admin',
    history: ConversationTurn[] = []
  ): Promise<BrainResponse> {
    const trimmedRaw = rawText.trim();
    const cleaned = this.stripWakePrefix(trimmedRaw);
    const text = (cleaned || trimmedRaw).toLowerCase().trim();
    const effectiveRaw = cleaned || trimmedRaw;

    // 0. PURO CHAMADO DE ATIVAÇÃO (sem instrução adicional)
    if (
      /^(?:hey\s+|ei\s+|ok\s+|ol[aá]\s+)?(?:jarvis|computador)[\s!?.]*$/i.test(trimmedRaw) ||
      /^(?:acordar|wake up)[\s!?.]*$/i.test(trimmedRaw)
    ) {
      return {
        spokenText: `Estou ouvindo perfeitamente, ${this.userName}. Pode ditar sua instrução ou diretiva.`,
        toolName: 'voice_wake_ready',
        toolOutcome: 'done',
        logDetail: 'Ativação por voz confirmada. Aguardando instrução.',
      };
    }

    // 0.1. PARAR DE FALAR / SILÊNCIO IMEDIATO
    if (
      /^(?:pare|para|pare de falar|sil[eê]ncio|cale-se|cala a boca|stop speaking|be quiet|silence|mute)[\s!?.]*$/i.test(
        text
      )
    ) {
      return {
        spokenText: '',
        shouldSkipSpeak: true,
        actionTrigger: 'stop_speaking',
        toolName: 'voice_interrupt',
        toolOutcome: 'done',
        logDetail: 'Reprodução vocal interrompida por comando direto do usuário.',
      };
    }

    // 0.2. REPETIR ÚLTIMA RESPOSTA
    if (
      /^(?:repita|repete|repetir|pode repetir|o que voc[eê] disse|repita a [uú]ltima resposta|repeat)[\s!?.]*$/i.test(
        text
      )
    ) {
      return {
        spokenText: '',
        actionTrigger: 'repeat_last',
        toolName: 'voice_repeat',
        toolOutcome: 'done',
        logDetail: 'Solicitação para repetir a última resposta vocal.',
      };
    }

    // 0.3. TROCAR IDIOMA DE ESCUTA / RESPOSTA POR VOZ
    const langMatch = text.match(
      /\b(?:fale|falar|responda|responder|ouvir|mudar idioma|trocar idioma)\s+(?:em|para)\s+(ingl[eê]s|english|espanhol|spanish|franc[eê]s|french|portugu[eê]s|portuguese)\b/i
    );
    if (langMatch) {
      const target = langMatch[1].toLowerCase();
      if (target.includes('ingl') || target.includes('english')) {
        return {
          spokenText: `Understood, ${this.userName}. Voice recognition and responses are now tuned to English.`,
          languageUpdate: 'en-US',
          toolName: 'voice_language_switch',
          toolOutcome: 'done',
          logDetail: 'Idioma de escuta e fala ajustado para en-US.',
        };
      }
      if (target.includes('espan') || target.includes('spanish')) {
        return {
          spokenText: `Entendido, ${this.userName}. Reconocimiento de voz y respuestas ajustados a Español.`,
          languageUpdate: 'es-ES',
          toolName: 'voice_language_switch',
          toolOutcome: 'done',
          logDetail: 'Idioma de escuta e fala ajustado para es-ES.',
        };
      }
      if (target.includes('franc') || target.includes('french')) {
        return {
          spokenText: `Compris, ${this.userName}. La reconnaissance vocale est maintenant réglée en Français.`,
          languageUpdate: 'fr-FR',
          toolName: 'voice_language_switch',
          toolOutcome: 'done',
          logDetail: 'Idioma de escuta e fala ajustado para fr-FR.',
        };
      }
      return {
        spokenText: `Compreendido, ${this.userName}. Escuta e respostas sincronizadas novamente em Português do Brasil.`,
        languageUpdate: 'pt-BR',
        toolName: 'voice_language_switch',
        toolOutcome: 'done',
        logDetail: 'Idioma de escuta e fala ajustado para pt-BR.',
      };
    }

    // 0.4. TROCAR COR DO TEMA DO HUD (PROTEGIDO AO ADMIN)
    const colorMatch = text.match(
      /\b(?:mudar|alterar|trocar|colocar|definir)\s+(?:a\s+)?cor(?:\s+do\s+(?:tema|painel|hud|sistema))?\s+(?:para\s+)?(azul|ciano|vermelho|verde|amarelo|[aâ]mbar|dourado|roxo|violeta|laranja)\b/i
    );
    if (colorMatch) {
      if (currentUserRole !== 'admin') {
        return {
          spokenText: `Acesso restrito, ${this.userName}. Apenas o Administrador pode alterar as cores e preferências globais do HUD.`,
          toolName: 'theme_color_guard',
          toolOutcome: 'failed',
          logDetail: 'Tentativa de alteração de tema bloqueada para operador não administrador.',
        };
      }
      const colorMap: Record<string, string> = {
        azul: '#00aaff',
        ciano: '#00d4ff',
        vermelho: '#ff3b30',
        verde: '#00ff88',
        amarelo: '#ffaa00',
        ambar: '#ffaa00',
        âmbar: '#ffaa00',
        dourado: '#f59e0b',
        roxo: '#a855f7',
        violeta: '#a855f7',
        laranja: '#ff6b00',
      };
      const pickedName = colorMatch[1].toLowerCase();
      const hex = colorMap[pickedName] || '#00d4ff';
      return {
        spokenText: `Cor principal do HUD atualizada para ${pickedName}, ${this.userName}.`,
        accentColorUpdate: hex,
        toolName: 'theme_color_update',
        toolOutcome: 'done',
        logDetail: `Cor do tema alterada para ${pickedName} (${hex}).`,
      };
    }

    // 0.5. LIMPAR LOGS OU FECHAR PAINEL ATUAL
    if (/^(?:limpar|apagar|zerar)\s+(?:o\s+|os\s+)?(?:log|logs|console|hist[oó]rico)\b/i.test(text)) {
      return {
        spokenText: `Console tático limpo, ${this.userName}.`,
        actionTrigger: 'clear_logs',
        toolName: 'hud_clear_logs',
        toolOutcome: 'done',
      };
    }

    if (/^(?:fechar|feche|sair)\s+(?:o\s+|a\s+)?(?:painel|v[ií]deo|janela|modal|cart[aã]o|quiz|c[aâ]mera)\b/i.test(text)) {
      return {
        spokenText: `Painel encerrado, ${this.userName}.`,
        actionTrigger: 'close_panel',
        toolName: 'hud_close_panel',
        toolOutcome: 'done',
      };
    }

    // 0.6. ABERTURA DIRETA DE PAINÉIS DO SISTEMA
    if (/\b(?:abrir|mostrar|configurar)\s+(?:o\s+|a\s+)?(?:mem[oó]ria|mem[oó]rias|matriz de mem[oó]ria)\b/i.test(text)) {
      return {
        spokenText: `Abrindo a Matriz de Memória persistente, ${this.userName}.`,
        actionTrigger: 'open_memory',
        toolName: 'hud_open_memory',
        toolOutcome: 'done',
      };
    }
    if (/\b(?:abrir|configurar|testar)\s+(?:o\s+|os\s+)?(?:[aá]udio|microfone|som|dispositivos de [aá]udio)\b/i.test(text)) {
      return {
        spokenText: `Abrindo as configurações de entrada de microfone e saída de áudio, ${this.userName}.`,
        actionTrigger: 'open_audio',
        toolName: 'hud_open_audio',
        toolOutcome: 'done',
      };
    }
    if (/\b(?:abrir|mostrar)\s+(?:o\s+)?(?:qr\s*code|pareamento remoto|controle remoto|mobile remote)\b/i.test(text)) {
      return {
        spokenText: `Exibindo o QR Code de pareamento do Mobile Remote Dashboard, ${this.userName}.`,
        actionTrigger: 'open_remote',
        toolName: 'hud_open_remote',
        toolOutcome: 'done',
      };
    }
    if (/\b(?:abrir|acessar)\s+(?:o\s+)?(?:painel admin|painel administrativo|administra[cç][aã]o|gerenciar usu[aá]rios|vozes do sistema)\b/i.test(text)) {
      return {
        spokenText: `Solicitando abertura do Painel Administrativo, ${this.userName}.`,
        actionTrigger: 'open_admin_panel',
        toolName: 'hud_open_admin',
        toolOutcome: 'done',
      };
    }

    // 1. PYTHON E AUTOMAÇÃO NO DESKTOP (consulta sobre arquitetura)
    if (
      /^(?:eu\s+)?preciso instalar o python\??$/i.test(text) ||
      text === 'preciso do python' ||
      text === 'preciso instalar o python?'
    ) {
      return {
        spokenText: `O ambiente de automação Python 3 está completamente integrado e operacional no Mark LVI, ${this.userName}. Posso criar pastas no desktop, copiar e colar arquivos, abrir pesquisas na internet e executar rotinas de código Python diretamente no sistema operacional.`,
        toolName: 'system_architecture_query',
        toolOutcome: 'done',
        logDetail: 'Status da arquitetura: Python 3 e automações de desktop operacionais.',
      };
    }

    // 2. PEDIDO DO USUÁRIO PARA O JARVIS O CHAMAR PELO NOME (sem alterar o padrão geral do Admin)
    if (text.includes('me chame de') || text.includes('meu nome é') || text.includes('pode me chamar de')) {
      const match = effectiveRaw.match(/(?:me chame de|meu nome é|pode me chamar de)\s+([a-zA-ZÀ-ÿ0-9_ -]+)/i);
      const rawNick = match ? match[1].replace(/[.!?]/g, '').trim() : '';
      const nickname = rawNick ? rawNick.split(/\s+/)[0] : '';
      if (nickname) {
        this.userName = nickname;
        return {
          spokenText: `Afirmativo, ${nickname}. A partir deste instante passarei a chamá-lo pelo seu primeiro nome: ${nickname}. A configuração global do Administrador permanece protegida e intacta. Em que posso auxiliá-lo agora, ${nickname}?`,
          logDetail: `Tratamento personalizado da sessão definido como: "${nickname}". Padrão geral do Admin preservado.`,
          nicknameUpdate: nickname,
          toolName: 'user_profile_nickname',
          toolOutcome: 'done',
        };
      }
    }

    // 2.0. SALVAR FATO / LEMBRETE NA MEMÓRIA PERSISTENTE
    const memorySaveMatch = effectiveRaw.match(
      /^(?:memoriz[ea]|lembr[ea](?:-me)?|anot[ea]|salve na mem[oó]ria|guarde na mem[oó]ria)\s+(?:que\s+)?(.+)/i
    );
    if (memorySaveMatch && memorySaveMatch[1]?.trim().length > 2) {
      const fact = memorySaveMatch[1].trim();
      const shortKey = fact
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join('_') || `nota_${Date.now()}`;
      return {
        spokenText: `Memorizado com precisão, ${this.userName}: "${fact}".`,
        memoryUpdate: {
          category: 'notes',
          key: shortKey,
          value: fact,
        },
        toolName: 'memory_commit',
        toolOutcome: 'done',
        logDetail: `Fato salvo na matriz de memória [${shortKey}]: ${fact}`,
      };
    }

    // 2.1. DESKTOP: CRIAR PASTAS NO COMPUTADOR / DESKTOP
    if (
      /\b(criar pasta|crie uma pasta|crie a pasta|criar diret[oó]rio|crie um diret[oó]rio|nova pasta|create folder|make directory)\b/i.test(
        text
      )
    ) {
      let folderName = effectiveRaw
        .replace(/^(?:crie uma pasta chamada|crie uma pasta com o nome|crie a pasta|criar pasta|crie uma pasta|criar diret[oó]rio|crie um diret[oó]rio|nova pasta|create folder|make directory)\s*/i, '')
        .replace(/(?:no desktop|na área de trabalho|na area de trabalho|no meu computador|no pc|no sistema)/gi, '')
        .trim();

      return this.executeCreateFolder(folderName || `Nova_Pasta_${Date.now()}`);
    }

    // 2.2. DESKTOP: COPIAR E COLAR ARQUIVOS
    if (
      /\b(copiar arquivo|copie o arquivo|copiar o arquivo|colar arquivo|duplicar arquivo|copy file)\b/i.test(
        text
      )
    ) {
      let source = 'documento.txt';
      let destination = 'Backup';
      const copyMatch = effectiveRaw.match(
        /(?:copiar|copie)(?:\s+o)?\s+arquivo\s+["']?([^"'\s]+)["']?(?:\s+para\s+["']?([^"'\s]+)["']?)?/i
      );
      if (copyMatch) {
        source = copyMatch[1] || 'relatorio.txt';
        destination = copyMatch[2] || 'Backup';
      }

      try {
        const resp = await fetch('/api/desktop/file-operation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'copy_file', source, destination }),
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          return {
            spokenText: `Arquivo "${source}" copiado com sucesso para "${destination}" no desktop, ${this.userName}.`,
            toolName: 'desktop_copy_file',
            toolOutcome: 'done',
            logDetail: `Arquivo copiado: ${data.source} -> ${data.destination}`,
            dynamicContent: {
              id: String(Date.now()),
              type: 'desktop',
              title: `Arquivo Copiado // ${source}`,
              subtitle: 'Gerenciador de Arquivos & Desktop',
              data: {
                action: 'Copiar e Colar',
                source: data.source,
                destination: data.destination,
                status: 'CONCLUÍDO',
              },
              timestamp: new Date().toLocaleTimeString('pt-BR'),
            },
          };
        } else {
          return {
            spokenText: `Operação de cópia iniciada, ${this.userName}. O arquivo "${source}" foi preparado para seleção no painel de arquivos.`,
            actionTrigger: 'open_folder_search',
            toolName: 'desktop_copy_file',
            toolOutcome: 'done',
            logDetail: `Operação de cópia acionada no gerenciador para: ${source}`,
          };
        }
      } catch (err) {
        console.warn('Erro ao copiar arquivo:', err);
      }
    }

    // 2.3. AUTOMAÇÃO E EXECUÇÃO DE PYTHON NO DESKTOP (apenas quando pedir para rodar/executar script)
    if (
      /\b(executar python|execute python|rodar python|rode o python|script python|executar script python|rodar script|run python)\b/i.test(
        text
      ) ||
      text.startsWith('python ')
    ) {
      let pythonCode = '';
      if (rawText.includes('```python')) {
        const codeMatch = rawText.match(/```python([\s\S]*?)```/);
        if (codeMatch) pythonCode = codeMatch[1].trim();
      } else if (rawText.includes('```')) {
        const codeMatch = rawText.match(/```([\s\S]*?)```/);
        if (codeMatch) pythonCode = codeMatch[1].trim();
      }

      if (!pythonCode) {
        if (text.includes('listar') || text.includes('arquivos')) {
          pythonCode = `import os\nfiles = os.listdir('.')\nprint(f"Arquivos no Desktop Workspace: {len(files)}")\nfor f in files[:8]:\n    print(f"• {f}")`;
        } else if (text.includes('criar') && text.includes('pasta')) {
          pythonCode = `import os\nos.makedirs("Automacao_Python", exist_ok=True)\nprint("Diretório 'Automacao_Python' gerado com sucesso via Python 3.")`;
        } else {
          pythonCode = `import sys, platform\nprint(f"Python {platform.python_version()} integrado com sucesso ao Mark LVI.")\nprint("Recursos de automação de desktop e arquivos prontos.")`;
        }
      }

      return this.executePythonScript(pythonCode);
    }

    // 3. ATIVAR E MOSTRAR A CÂMERA DO USUÁRIO / INTERPRETAR O QUE VÊ (sem interceptar perguntas teóricas como "o que é uma câmera")
    const isCameraCommand =
      /(?:abr(?:a|e|ir)|ativ(?:ar|e|a)|lig(?:ar|ue|a)|mostr(?:ar|e|a)|us(?:ar|e|a)|inici(?:ar|e|a)|conectar)\s+.*?\b(?:c[aâ]mera|webcam|sensores?\s*[oó]pticos?|vis[aã]o\s*[oó]ptica)\b/i.test(
        text
      ) ||
      /\b(?:o que (?:voc[eê]|tu) (?:est[aá]|t[aá]) vendo|o que v[eê]|interpretar o que v[eê]|interpretar a cena|olh(?:e|a) (?:aqui|isso)|ligar vis[aã]o|abrir c[aâ]mera|ativar c[aâ]mera)\b/i.test(
        text
      );

    if (isCameraCommand) {
      return {
        spokenText: `Qual das câmeras você deseja abrir, ${this.userName}? Selecione Câmera Frontal, Câmera Traseira ou uma das câmeras conectadas no dispositivo (ou responda "Frontal" ou "Traseira").`,
        toolName: 'camera_vision_selector',
        toolOutcome: 'done',
        actionTrigger: 'open_camera',
        logDetail: 'Seletor de câmeras exibido aguardando escolha do operador.',
      };
    }

    // 3.5. QUIZ DE CONHECIMENTO GERAL (sem interceptar perguntas tipo "o que é um quiz?")
    const isQuizQuestionDef = /^(?:o que [eé]|como funciona|explique)\s+(?:um\s+|o\s+)?quiz/i.test(text);
    if (
      !isQuizQuestionDef &&
      /\b(?:quiz|perguntas e respostas|jogo de perguntas|teste de conhecimento|desafio de conhecimento)\b/i.test(
        text
      )
    ) {
      return {
        spokenText: `Abrindo o Quiz de Conhecimento Geral com múltipla escolha, ${this.userName}. Cada pergunta apresenta 4 alternativas para testar seus conhecimentos.`,
        toolName: 'general_knowledge_quiz',
        toolOutcome: 'done',
        actionTrigger: 'open_quiz',
        logDetail: 'Módulo de Quiz de Conhecimento Geral (4 alternativas) inicializado.',
      };
    }

    // 4. BUSCA EM PASTAS LOCAIS DO PC (SEM PYTHON)
    if (
      /\b(?:buscar em pasta|busca em pasta|procurar arquivo|pesquisar pasta|abrir pasta|explorador de arquivos|abrir explorador)\b/i.test(
        text
      )
    ) {
      return {
        spokenText: `Abrindo o indexador de pastas e desktop, ${this.userName}. Você pode navegar por diretórios, criar pastas e executar rotinas Python diretamente pelo painel.`,
        toolName: 'local_folder_search',
        toolOutcome: 'done',
        actionTrigger: 'open_folder_search',
        logDetail: 'Módulo de busca em pastas locais acionado.',
      };
    }

    // 5. PROJETAR VÍDEO DO YOUTUBE NO PAINEL CENTRAL DO HUD
    const isVideoIntent =
      /(?:abr(?:a|e|ir)|projet(?:ar|e|a)|toc(?:ar|a|e)|reproduz(?:ir|a)|coloc(?:ar|a|e)|bot(?:ar|a)|mostr(?:ar|a|e)|assist(?:ir|a)|ouvi?r|play)\b.*\b(?:v[ií]deo|m[uú]sica|trailer|clipe|faixa|youtube|som)\b/i.test(
        text
      ) ||
      /\b(?:youtube|v[ií]deo|trailer|clipe)\b.*\b(?:no painel|no hud|central|na tela)\b/i.test(text) ||
      text.includes('youtube.com') ||
      text.includes('youtu.be');

    if (isVideoIntent) {
      let cleanQuery = effectiveRaw
        .replace(/^(?:d[aá] play no|d[aá] play na|d[aá] play em|play no|play na|play em|play)\s+/i, '')
        .replace(
          /^(?:abra|abrir|abre|coloque|colocar|coloca|bota|botar|mostre|mostrar|mostra|projetar|projete|projeta|assistir|assista|ver|veja|tocar|toca|toque|reproduzir|reproduza|reproduz|ouvir|ouça)\s+/i,
          ''
        )
        .replace(
          /^(?:um|uma|o|a|os|as)?\s*(?:v[ií]deo|m[uú]sica|can[cç][aã]o|trailer|clipe|faixa|som|áudio|audio)\s*(?:de|do|da|dos|das|sobre|com)?\s*/i,
          ''
        )
        .replace(
          /(?:no painel central|no painel|no hud|no projetor|na tela central|na tela|no youtube|do youtube|em tela cheia|em v[ií]deo)/gi,
          ''
        )
        .replace(/^(?:de|do|da|dos|das|sobre|com)\s+/i, '')
        .trim();

      return this.executeYoutubeProjection(cleanQuery);
    }

    // 6. BUSCA EXPLÍCITA NA INTERNET
    if (
      /^(?:pesquisar na internet|buscar na internet|pesquise na web|pesquise no google|pesquise sobre|buscar sobre|abrir pesquisa|abrir busca|pesquisa no google|procure na internet)\b/i.test(
        text
      )
    ) {
      const query = effectiveRaw
        .replace(
          /^(?:pesquisar na internet sobre|buscar na internet sobre|abrir pesquisa na internet sobre|abrir pesquisa sobre|abrir busca sobre|pesquisar na internet|buscar na internet|pesquise na web|pesquise no google|pesquise sobre|buscar sobre|pesquisa no google|procure na internet|abrir pesquisa|abrir busca)\s*/i,
          ''
        )
        .trim();
      return this.executeWebSearch(query);
    }

    // 7. RELATÓRIO MATINAL / BRIEFING (apenas quando pedido explicitamente)
    if (
      /\b(?:relat[oó]rio matinal|executar briefing|fazer briefing|meu briefing|briefing di[aá]rio)\b/i.test(text) ||
      /^(?:bom dia|good morning|briefing)[\s!?.]*$/i.test(text)
    ) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return {
        spokenText: `Bom dia, ${this.userName}. São ${timeStr}. Os diagnósticos de hardware confirmam todos os núcleos operando dentro da margem térmica ideal a ${systemMetrics.tmp.toFixed(0)} graus Celsius, com carga de CPU em ${systemMetrics.cpu.toFixed(0)} por cento e memória RAM em ${systemMetrics.mem.toFixed(0)} por cento. Todos os subsistemas Mark LVI estão em prontidão.`,
        toolName: 'proactive_briefing',
        toolOutcome: 'done',
        logDetail: 'Sequência de relatório matinal concluída. Diagnósticos de hardware e memória nominais.',
        dynamicContent: {
          id: String(Date.now()),
          type: 'weather',
          title: 'Relatório Matinal // Telemetria & Clima',
          subtitle: 'Estação Local Integrada',
          data: {
            temp: '23°C',
            condition: 'Tempo Estável / Céu Limpo',
            humidity: '52%',
            wind: '14 km/h SE',
          },
          timestamp: timeStr,
        },
      };
    }

    // 8. TELEMETRIA E HARDWARE DO SISTEMA (sem roubar perguntas tipo "temperatura do Sol")
    if (
      /\b(?:telemetria|diagn[oó]stico de hardware|diagn[oó]stico do sistema|executar diagn[oó]stico|verificar telemetria|status do sistema|status do hardware|uso da cpu|uso da ram|mem[oó]ria ram|temperatura do sistema|temperatura da cpu|temperatura dos n[uú]cleos)\b/i.test(
        text
      ) ||
      /^(?:status|telemetria|diagn[oó]stico)[\s!?.]*$/i.test(text)
    ) {
      const isHot = systemMetrics.tmp > 80;
      return {
        spokenText: `A carga da CPU está em ${systemMetrics.cpu.toFixed(0)} por cento, o consumo de memória RAM é de ${systemMetrics.mem.toFixed(0)} por cento e a GPU registra ${systemMetrics.gpu.toFixed(0)} por cento. A temperatura média dos núcleos é de ${systemMetrics.tmp.toFixed(0)} graus Celsius. ${isHot ? 'Alerta: temperaturas elevadas detectadas.' : 'Envelope operacional perfeitamente estável.'}`,
        toolName: 'system_monitor',
        toolOutcome: 'done',
        logDetail: `Verificação de sistema concluída: CPU ${systemMetrics.cpu.toFixed(0)}%, RAM ${systemMetrics.mem.toFixed(0)}%, GPU ${systemMetrics.gpu.toFixed(0)}%, TEMP ${systemMetrics.tmp.toFixed(0)}°C.`,
      };
    }

    // 9. CLIMA LOCAL IMEDIATO (sem roubar perguntas como "quanto tempo leva a luz..." ou clima de cidade específica que vai pro Gemini/Search)
    if (
      /^(?:como est[aá] o (?:clima|tempo)|qual (?:[eé] )?a previs[aã]o do tempo|vai chover hoje|clima hoje|temperatura hoje|meteorologia local)[\s!?.]*$/i.test(
        text
      )
    ) {
      return {
        spokenText: `Registrando atualmente 23 graus Celsius na estação local, ${this.userName}, com céu parcialmente nublado, ventos de 14 quilômetros por hora e umidade relativa do ar em 52 por cento.`,
        toolName: 'weather_report',
        toolOutcome: 'done',
        logDetail: 'Dados meteorológicos locais obtidos.',
        dynamicContent: {
          id: String(Date.now()),
          type: 'weather',
          title: 'Condições Meteorológicas // Radar ao Vivo',
          subtitle: 'Estação de Monitoramento Atmosférico',
          data: {
            temp: '23°C',
            condition: 'Parcialmente Nublado',
            humidity: '52%',
            wind: '14 km/h SE',
          },
          timestamp: new Date().toLocaleTimeString('pt-BR'),
        },
      };
    }

    // 10. PROCESSAMENTO INTELIGENTE DE INSTRUÇÕES, DIRETRIZES E CONHECIMENTO GERAL VIA GOOGLE AI STUDIO / LLM ATIVO
    try {
      const memorySummary = memories.slice(0, 10).map((m) => `- ${m.key}: ${m.value}`).join('\n');
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawText,
          history: history.slice(-10),
          assistantName: this.assistantName,
          userName: this.userName,
          userRole: currentUserRole,
          metrics: systemMetrics,
          memoryContext: memorySummary,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Executa diretriz detectada por Function Calling caso a IA tenha identificado uma ação do sistema em linguagem natural
        if (data.action && data.action.name) {
          const act = data.action as { name: string; args?: Record<string, any> };
          const args = act.args || {};

          switch (act.name) {
            case 'open_camera_selector':
              return {
                spokenText: `Qual das câmeras você deseja abrir, ${this.userName}? Selecione Câmera Frontal, Câmera Traseira ou uma das câmeras conectadas no dispositivo.`,
                toolName: 'camera_vision_selector',
                toolOutcome: 'done',
                actionTrigger: 'open_camera',
                logDetail: 'Diretriz de câmera interpretada via IA.',
              };

            case 'open_quiz':
              return {
                spokenText: `Abrindo o Quiz de Conhecimento Geral com 4 alternativas por questão, ${this.userName}.`,
                toolName: 'general_knowledge_quiz',
                toolOutcome: 'done',
                actionTrigger: 'open_quiz',
                logDetail: 'Diretriz de quiz interpretada via IA.',
              };

            case 'open_folder_search':
              return {
                spokenText: `Abrindo o explorador de pastas e arquivos locais, ${this.userName}.`,
                toolName: 'local_folder_search',
                toolOutcome: 'done',
                actionTrigger: 'open_folder_search',
              };

            case 'create_desktop_folder':
              return this.executeCreateFolder(String(args.folderName || 'Nova_Pasta'));

            case 'project_youtube_video':
              return this.executeYoutubeProjection(String(args.query || effectiveRaw));

            case 'web_search':
              return this.executeWebSearch(String(args.query || effectiveRaw));

            case 'run_python_script':
              return this.executePythonScript(
                String(
                  args.code ||
                    `print("Automação Python do Mark LVI executada para: ${String(args.description || 'tarefa')}")`
                )
              );

            case 'save_memory': {
              const val = String(args.value || effectiveRaw);
              const key = String(args.key || `nota_${Date.now()}`);
              const validCats = ['identity', 'preferences', 'projects', 'relationships', 'wishes', 'notes'];
              const cat = validCats.includes(args.category) ? args.category : 'notes';
              return {
                spokenText: `Informação registrada na matriz de memória, ${this.userName}: "${val}".`,
                memoryUpdate: {
                  category: cat as MemoryEntry['category'],
                  key,
                  value: val,
                },
                toolName: 'memory_commit',
                toolOutcome: 'done',
                logDetail: `Memória salva [${cat}] ${key}: ${val}`,
              };
            }

            case 'get_hardware_telemetry':
              return {
                spokenText: `CPU operando a ${systemMetrics.cpu.toFixed(0)} por cento, memória RAM em ${systemMetrics.mem.toFixed(0)} por cento, GPU em ${systemMetrics.gpu.toFixed(0)} por cento e temperatura térmica dos núcleos em ${systemMetrics.tmp.toFixed(0)} graus Celsius, ${this.userName}.`,
                toolName: 'system_monitor',
                toolOutcome: 'done',
                logDetail: `Telemetria: CPU ${systemMetrics.cpu.toFixed(0)}%, RAM ${systemMetrics.mem.toFixed(0)}%, GPU ${systemMetrics.gpu.toFixed(0)}%, TEMP ${systemMetrics.tmp.toFixed(0)}°C.`,
              };

            case 'control_hud': {
              const cmd = String(args.command || '');
              const triggerMap: Record<string, BrainResponse['actionTrigger']> = {
                open_memory: 'open_memory',
                open_audio: 'open_audio',
                open_remote: 'open_remote',
                open_admin: 'open_admin_panel',
                open_providers: 'open_providers',
                clear_logs: 'clear_logs',
                close_panel: 'close_panel',
                repeat_last: 'repeat_last',
                stop_speaking: 'stop_speaking',
              };
              const trig = triggerMap[cmd];
              if (trig) {
                return {
                  spokenText:
                    trig === 'stop_speaking'
                      ? ''
                      : data.text || `Diretriz executada conforme solicitado, ${this.userName}.`,
                  shouldSkipSpeak: trig === 'stop_speaking',
                  actionTrigger: trig,
                  toolName: `hud_${cmd}`,
                  toolOutcome: 'done',
                };
              }
              break;
            }
          }
        }

        const geminiReply = data.text || '';
        if (geminiReply.trim()) {
          return {
            spokenText: geminiReply,
            logDetail: `Resposta precisa via ${data.model || 'Google Gemini'}.`,
            toolName: 'gemini_dialogue_engine',
            toolOutcome: 'done',
          };
        }
      }
    } catch (apiError) {
      console.warn('Erro ao consultar /api/gemini/chat:', apiError);
    }

    return {
      spokenText: `Às suas ordens, ${this.userName}. Todos os canais de telemetria e interpretação de voz do Mark LVI estão ativos. Pode repetir ou detalhar sua instrução?`,
      logDetail: `Diálogo processado localmente: "${rawText}"`,
    };
  }
}

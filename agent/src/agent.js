import Anthropic from "@anthropic-ai/sdk";
import { definicoes, executar } from "./tools.js";
import { buscarHistorico, registrarMensagem } from "./services/history.js";

const anthropic = new Anthropic({
  fetch: globalThis.fetch,
});

// [FIX #5] Limite de tokens estimados no histórico para evitar context overflow.
// Cada mensagem é estimada de forma conservadora; ao ultrapassar o limite,
// as mensagens mais antigas (exceto a primeira, que pode ser relevante como âncora)
// são descartadas até caber. Ajuste MAX_HISTORICO_TOKENS conforme seu uso real.
const MAX_HISTORICO_TOKENS = 80_000;

function estimarTokens(mensagem) {
  // Estimativa grosseira: ~4 caracteres por token. Funciona bem para português.
  const conteudo =
    typeof mensagem.content === "string"
      ? mensagem.content
      : JSON.stringify(mensagem.content);
  return Math.ceil(conteudo.length / 4);
}

function truncarHistorico(historico) {
  let total = historico.reduce((acc, m) => acc + estimarTokens(m), 0);
  if (total <= MAX_HISTORICO_TOKENS) return historico;

  // Remove mensagens do início (mais antigas) até caber no limite.
  // Mantém sempre pelo menos a última mensagem do usuário.
  const truncado = [...historico];
  while (truncado.length > 1 && total > MAX_HISTORICO_TOKENS) {
    const removida = truncado.shift();
    total -= estimarTokens(removida);
  }

  console.warn(
    `[agent] histórico truncado: ${historico.length} → ${truncado.length} mensagens (estimativa: ${total} tokens)`,
  );
  return truncado;
}

function dataDeHoje() {
  return new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function montarSystemPrompt() {
  return `DATA ATUAL: ${dataDeHoje()} (horário de Brasília).
REGRA DE DATA: use EXCLUSIVAMENTE essa data como "hoje". NUNCA infira a data do histórico de conversa — mensagens antigas podem mencionar datas passadas e isso não representa a data atual. Se o usuário disser "hoje" ou "agora", use sempre a DATA ATUAL acima.
Ao confirmar o cadastro de uma viagem, mostre a data no formato "DD/MM (dia da semana)" — não use as palavras "hoje" ou "amanhã" na confirmação para evitar ambiguidade.

${SYSTEM_PROMPT_BASE}`;
}

const SYSTEM_PROMPT_BASE = `Você é o assistente da transportadora (empresas Rohan e TransBeleze), conversando via WhatsApp com o gestor do negócio.

Seu papel:
- Cadastrar e atualizar viagens (incluindo "possíveis fretes" com dados incompletos — use criar_viagem_rascunho).
- Registrar despesas e cadastrar clientes, motoristas, caminhões e categorias quando necessário.
- Responder perguntas sobre o histórico (ex: "quais clientes a Rohan atendeu esse mês?", "quanto a TransBeleze precisa pagar ao motorista Carlos no período X?") usando consultar_viagens, consultar_despesas e gerar_relatorio.
- Gerenciar a agenda: ajudar a completar rascunhos, atualizar status, e checar conflitos de agenda (verificar_conflito_agenda) antes de confirmar uma viagem com motorista e caminhão definidos.

Diretrizes:
- REGRA CRÍTICA — CONFIRMAÇÃO ANTES DE GRAVAR: antes de chamar QUALQUER ferramenta de escrita (criar_viagem_rascunho, atualizar_viagem, registrar_despesa, adicionar_cliente, adicionar_motorista, adicionar_caminhao, adicionar_categoria, registrar_apelido_motorista), você DEVE:
  1. Mostrar ao usuário um resumo claro e completo do que será gravado — todos os campos relevantes, sem omitir nada.
  2. Perguntar "Confirma?" (ou similar).
  3. Aguardar a resposta do usuário na PRÓXIMA mensagem.
  4. Somente após receber confirmação ("sim", "pode", "confirma", "ok" ou equivalente) chamar a ferramenta de escrita.
  Nunca chame uma ferramenta de escrita na mesma mensagem em que apresentou o resumo — são sempre dois turnos separados.
  Exceção: se os dados foram enviados incompletos e você precisou perguntar algo (empresa, data, motorista etc.), a resposta do usuário a essa pergunta NÃO é confirmação de gravação — mostre o resumo completo e peça confirmação explícita antes de gravar.

- REGRA CRÍTICA — FERRAMENTA OBRIGATÓRIA: você só tem efeito no mundo real através das ferramentas. NUNCA diga que algo foi "registrado", "cadastrado", "salvo", "atualizado", "corrigido" etc. sem ter chamado a ferramenta correspondente NESTA mesma resposta e recebido o resultado de sucesso dela. Isso se aplica inclusive quando o usuário responde "sim", "pode", "confirma" a um resumo que você apresentou: essa confirmação não executa nada sozinha — você ainda precisa chamar a ferramenta. Confirmar uma ação que não ocorreu cria dados financeiros incorretos.
- Quando o usuário mencionar nomes (cliente, motorista, empresa, categoria), busque o ID correspondente nas listas (listar_clientes, listar_motoristas, etc) antes de criar/atualizar registros. Se não encontrar, pergunte se deve cadastrar um novo.
- IMPORTANTE — categorias de despesa: o campo "categoria" de registrar_despesa exige o ID real cadastrado em categoriasdespesas — NUNCA chute ou invente esse ID (ex.: não assuma que "pedágio" é categoria 1). Antes de QUALQUER registrar_despesa, chame listar_categorias e procure uma categoria cujo nome corresponda ao que o usuário disse. Se não houver correspondência, pergunte ao usuário se deve cadastrar uma categoria nova (adicionar_categoria) com esse nome ou usar uma das existentes — só prossiga com registrar_despesa depois de ter um ID real confirmado.
- "Possível frete" / dados incompletos → sempre use criar_viagem_rascunho, nunca recuse por falta de dados.

Consultas de viagens — REGRA CRÍTICA:
- Quando o usuário pedir viagens de um período (hoje, semana, mês etc.) sem especificar empresa, chame consultar_viagens UMA vez SEM o filtro de empresa para retornar ambas as empresas juntas. NUNCA assuma que uma empresa "não tem viagens" sem ter chamado a ferramenta e recebido o resultado dela.
- Quando o usuário questionar ou corrigir um resultado de consulta ("A TB não teve viagens?", "tem certeza?", "e a Rohan?"), SEMPRE re-consulte a ferramenta antes de responder — nunca confirme ou negue com base na resposta anterior sem nova chamada.

Múltiplas empresas (Rohan e TransBeleze):
- O mesmo número de WhatsApp gerencia as duas empresas. Para ESCRITAS (cadastrar viagem, registrar despesa, atualizar registro): se o usuário não informar a empresa, PERGUNTE antes de prosseguir. Para LEITURAS (consultar viagens, relatórios, agenda): se não especificar empresa, consulte ambas sem filtro — nunca pergunte a empresa para uma simples consulta.
- A TransBeleze também é chamada de "TB" (e variações como "tb", "T.B.") — trate como sinônimo de "TransBeleze". Ao chamar qualquer ferramenta (criar_viagem_rascunho, atualizar_viagem, registrar_despesa, consultar_viagens, gerar_relatorio etc.), sempre normalize e use o nome completo "TransBeleze" no campo empresa — nunca salve nem filtre por "TB".
- Exceção: ao pré-agendar um possível frete, é normal o usuário ainda não saber qual empresa vai atender (ex: "tenho um possível frete pro cliente João dia 10, ainda não sei se vai ser pela Rohan ou TransBeleze"). Nesse caso, crie o rascunho com criar_viagem_rascunho SEM o campo empresa — fica pendente até o usuário decidir, e depois você usa atualizar_viagem para preencher.

Apelidos de motoristas:
- IMPORTANTE: antes de responder QUALQUER pergunta que cite um motorista pelo nome ou apelido (pagamentos, viagens, conflitos, etc.), chame listar_motoristas primeiro para resolver esse nome contra o cadastro real. Nunca responda "não encontrei" nem cite nomes de motoristas de memória — só com base no retorno da ferramenta. Note que apelidos podem bater com o início, fim ou parte do nome cadastrado (ex.: "nego" pode ser o próprio nome de um motorista).
- A lista retornada por listar_motoristas inclui o campo "apelidos" com os apelidos já conhecidos de cada motorista.
- Se, depois de consultar listar_motoristas, o nome mencionado realmente não bater com nenhum nome nem apelido cadastrado, NÃO cadastre um motorista novo de cara. Primeiro pergunte se esse nome é apelido de algum motorista já existente, citando os nomes retornados pela ferramenta (nunca invente nomes).
- Se o usuário confirmar que é apelido de alguém já cadastrado, chame registrar_apelido_motorista para guardar essa associação (assim da próxima vez o agente já reconhece) e prossiga usando o motorista correto.
- Só use adicionar_motorista se o usuário confirmar que é realmente uma pessoa nova.
- Antes de confirmar uma viagem com motorista e caminhão definidos para uma data, rode verificar_conflito_agenda; se houver conflito, avise o usuário e peça confirmação antes de prosseguir.
- Ao editar uma viagem por descrição (ex: "a viagem do dia 05/06 com o cliente João"), busque com consultar_viagens e, se houver mais de uma correspondência, peça para o usuário especificar qual.
- Seja direto e conciso — está conversando por WhatsApp. Use valores em R$ com duas casas decimais.
- Nunca invente dados: se não souber algo, pergunte ou consulte o banco.`;

// [FIX #6] Validação mínima da entrada antes de qualquer processamento.
// Evita que mensagens vazias, gigantes ou obviamente maliciosas cheguem ao modelo.
const MAX_TEXTO_CHARS = 4_000;

function validarEntrada(texto) {
  if (!texto || typeof texto !== "string") {
    return "Mensagem vazia ou inválida.";
  }
  const t = texto.trim();
  if (t.length === 0) {
    return "Mensagem vazia.";
  }
  if (t.length > MAX_TEXTO_CHARS) {
    return `Mensagem muito longa (máximo ${MAX_TEXTO_CHARS} caracteres).`;
  }
  return null; // null = válido
}

function formatarResultadoFerramenta(resultado) {
  return JSON.stringify(resultado, null, 2);
}

// [FIX #1] Execução sequencial de ferramentas para evitar race conditions
// em operações de escrita dependentes entre si.
// O comportamento externo é idêntico — apenas garante ordem de execução.
async function executarFerramentasSequencial(blocosFerramenta) {
  const resultados = [];
  for (const bloco of blocosFerramenta) {
    try {
      const resultado = await executar(bloco.name, bloco.input);
      console.log(
        `[agent] ferramenta ${bloco.name} -> ${formatarResultadoFerramenta(resultado)}`,
      );
      resultados.push({
        type: "tool_result",
        tool_use_id: bloco.id,
        content: formatarResultadoFerramenta(resultado),
      });
    } catch (err) {
      console.error(`[agent] erro na ferramenta ${bloco.name}:`, err);
      resultados.push({
        type: "tool_result",
        tool_use_id: bloco.id,
        content: `Erro ao executar ${bloco.name}: ${err.message}`,
        is_error: true,
      });
    }
  }
  return resultados;
}

const MAX_ITERACOES = 8;

const ERROS_TRANSITORIOS = ["ERR_STREAM_PREMATURE_CLOSE", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"];

async function chamarAnthropicComRetry(params, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err) {
      const isTransitorio = ERROS_TRANSITORIOS.some(
        (c) => err.code === c || err.cause?.code === c || err.message?.includes(c)
      );
      if (!isTransitorio || i === tentativas - 1) throw err;
      const espera = (i + 1) * 2000;
      console.warn(`[agent] erro transitório (tentativa ${i + 1}/${tentativas}), retry em ${espera}ms:`, err.code || err.message);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}

export async function processarMensagem(telefone, texto) {
  // [FIX #6] Valida entrada antes de qualquer I/O.
  const erroValidacao = validarEntrada(texto);
  if (erroValidacao) {
    console.warn(`[agent] entrada rejeitada (${telefone}): ${erroValidacao}`);
    return "Não consegui entender sua mensagem. Pode tentar novamente?";
  }

  await registrarMensagem(telefone, "user", texto);
  const historico = await buscarHistorico(telefone);

  // [FIX #5] Trunca o histórico se estiver próximo do limite do context window.
  const historicoTruncado = truncarHistorico(historico);

  // [FIX #4] temperature: 0 para máxima determinismo em agente financeiro.
  // Mantém toda a capacidade de interpretação de linguagem natural;
  // apenas remove variação aleatória nas decisões de ferramentas e texto.

  // [FIX #3] System prompt montado uma única vez antes do loop —
  // evita chamadas redundantes e garante que a data não mude entre iterações.
  const systemPrompt = montarSystemPrompt();

  let mensagens = [...historicoTruncado];
  let respostaFinal = "";
  let atingiuLimite = false;

  for (let iteracao = 0; iteracao < MAX_ITERACOES; iteracao++) {
    const resposta = await chamarAnthropicComRetry({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      temperature: 0, // [FIX #4]
      system: systemPrompt, // [FIX #3]
      tools: definicoes,
      messages: mensagens,
    });

    const blocosTexto = resposta.content.filter((b) => b.type === "text");
    const blocosFerramenta = resposta.content.filter(
      (b) => b.type === "tool_use",
    );

    respostaFinal = blocosTexto
      .map((b) => b.text)
      .join("\n")
      .trim();

    console.log(
      `[agent] iteração ${iteracao} stop_reason=${
        resposta.stop_reason
      } tools=[${blocosFerramenta
        .map((b) => `${b.name}(${JSON.stringify(b.input)})`)
        .join(", ")}]`,
    );

    if (resposta.stop_reason !== "tool_use") break;

    // [FIX #2] Detecta se chegou ao limite de iterações ainda em tool_use.
    if (iteracao === MAX_ITERACOES - 1) {
      atingiuLimite = true;
      break;
    }

    mensagens = [
      ...mensagens,
      { role: "assistant", content: resposta.content },
    ];

    // [FIX #1] Execução sequencial em vez de Promise.all.
    const resultadosFerramentas =
      await executarFerramentasSequencial(blocosFerramenta);

    // [FIX #7] Se alguma ferramenta de escrita retornou erro, interrompe o loop
    // e avisa o usuário — evita que o modelo confirme uma operação que falhou.
    const erroEscrita = resultadosFerramentas.find(
      (r) =>
        r.is_error &&
        blocosFerramenta.find(
          (b) => b.id === r.tool_use_id && isFerramentaEscrita(b.name),
        ),
    );

    if (erroEscrita) {
      const nomeBloco = blocosFerramenta.find(
        (b) => b.id === erroEscrita.tool_use_id,
      )?.name;
      console.error(
        `[agent] interrompendo loop: erro em ferramenta de escrita "${nomeBloco}"`,
      );
      respostaFinal =
        `Ocorreu um erro ao tentar salvar os dados (${nomeBloco}). ` +
        `Nada foi registrado. Por favor, tente novamente ou verifique com o suporte.`;
      await registrarMensagem(telefone, "assistant", respostaFinal);
      return respostaFinal;
    }

    mensagens = [
      ...mensagens,
      { role: "user", content: resultadosFerramentas },
    ];
  }

  // [FIX #2] Aviso explícito ao usuário se o limite de iterações foi atingido.
  if (atingiuLimite) {
    console.warn(
      `[agent] limite de ${MAX_ITERACOES} iterações atingido para telefone ${telefone}`,
    );
    respostaFinal =
      "Não consegui concluir essa operação — ela requer muitas etapas encadeadas. " +
      "Pode dividir o pedido em partes menores?";
  }

  if (!respostaFinal) {
    respostaFinal =
      "Desculpe, não consegui concluir essa solicitação agora. Pode tentar reformular?";
  }

  await registrarMensagem(telefone, "assistant", respostaFinal);
  return respostaFinal;
}

// Ferramentas que escrevem no banco — erros nelas devem interromper o fluxo.
// [FIX #7] Ajuste essa lista conforme as ferramentas reais do seu tools.js.
function isFerramentaEscrita(nome) {
  const ferramentasEscrita = new Set([
    "criar_viagem_rascunho",
    "atualizar_viagem",
    "registrar_despesa",
    "adicionar_cliente",
    "adicionar_motorista",
    "adicionar_caminhao",
    "adicionar_categoria",
    "registrar_apelido_motorista",
  ]);
  return ferramentasEscrita.has(nome);
}

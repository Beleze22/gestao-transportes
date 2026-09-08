import Anthropic from "@anthropic-ai/sdk";
import { definicoes, executar } from "./tools.js";
import { buscarHistorico, registrarMensagem } from "./services/history.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  const agora = new Date();
  const iso = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  const legivel = agora.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return { iso, legivel };
}

function montarSystemPrompt() {
  const { iso, legivel } = dataDeHoje();
  return `DATA ATUAL: ${legivel} | ISO: ${iso} (horário de Brasília).
REGRA DE DATA: use EXCLUSIVAMENTE essa data como "hoje". NUNCA infira a data do histórico de conversa — mensagens antigas podem mencionar datas passadas e isso não representa a data atual. Se o usuário disser "hoje" ou "agora", use sempre a DATA ATUAL acima.
Ao usar a data de hoje em qualquer ferramenta, copie EXATAMENTE o valor ISO indicado acima (${iso}) — não converta nem recalcule.
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

- REGRA CRÍTICA — FERRAMENTA OBRIGATÓRIA: você só tem efeito no mundo real através das ferramentas — nada acontece "automaticamente" e você não tem memória de ações fora delas. Por isso, NUNCA diga que algo foi "registrado", "cadastrado", "salvo", "atualizado", "corrigido" etc. sem ter chamado a ferramenta de escrita correspondente NESTA mesma resposta e recebido o resultado de sucesso dela — mesmo que o pedido pareça simples, repetitivo ou idêntico a algo feito antes na conversa. Isso se aplica inclusive quando o usuário responde "sim", "pode", "confirma" a um resumo que você apresentou: essa confirmação não executa nada sozinha — você ainda precisa chamar a ferramenta. Confirmar uma ação que não ocorreu cria dados financeiros incorretos.
- PROVA DE GRAVAÇÃO: toda confirmação de gravação DEVE citar o ID retornado pela ferramenta neste turno (ex: "✅ Viagem #415 cadastrada!", "✅ Despesa #66 registrada!"). Se você não recebeu um ID de uma ferramenta de escrita NESTE turno, é porque nada foi gravado — não afirme o contrário.
- CONFERÊNCIA OBRIGATÓRIA DE REFERÊNCIAS: sempre que enviar cliente_id, motorista_id, caminhao_id ou categoria a uma ferramenta de escrita, envie TAMBÉM o campo de nome correspondente (cliente_nome, motorista_nome, caminhao_placa, categoria_nome), copiado EXATAMENTE como veio da ferramenta de listagem. O sistema cruza o nome com o ID no banco e RECUSA a gravação se o ID apontar para outro registro — é essa conferência que impede lançar um frete no motorista errado. Enviar o ID sem o nome também é recusado.
- Quando o usuário mencionar nomes (cliente, motorista, empresa, categoria), busque o ID correspondente nas listas (listar_clientes, listar_motoristas, etc) antes de criar/atualizar registros. Se não encontrar, pergunte se deve cadastrar um novo.
- IMPORTANTE — categorias de despesa: o campo "categoria" de registrar_despesa exige o ID real cadastrado em categoriasdespesas — NUNCA chute ou invente esse ID (ex.: não assuma que "pedágio" é categoria 1). Antes de QUALQUER registrar_despesa, chame listar_categorias e procure uma categoria cujo nome corresponda ao que o usuário disse. Se não houver correspondência, pergunte ao usuário se deve cadastrar uma categoria nova (adicionar_categoria) com esse nome ou usar uma das existentes — só prossiga com registrar_despesa depois de ter um ID real confirmado.
- "Possível frete" / dados incompletos → sempre use criar_viagem_rascunho, nunca recuse por falta de dados.
- Despesas sem data → assuma a data de hoje (DATA ATUAL acima). Não pergunte a data — inclua-a no resumo de confirmação para que o usuário possa corrigir se necessário.
- Mensagens de áudio chegam transcritas automaticamente e podem conter erros de transcrição (ex: "despreza" em vez de "despesa", "negro" em vez de "nego"). Interprete pelo contexto e normalize erros óbvios — em especial nomes de motoristas/clientes: se a palavra transcrita for parecida com um nome cadastrado, use o nome do cadastro. Mostre a versão normalizada no resumo de confirmação para o usuário validar.

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
- PEDIDOS ANTIGOS QUE FALHARAM: se o histórico tiver uma mensagem do usuário seguida de um aviso de erro (⚠️) ou sem nenhuma resposta em seguida, aquele pedido NÃO foi atendido e o usuário já sabe disso. Nunca o execute por conta própria — responda somente ao pedido atual. Se achar que algo ficou pendente, pergunte antes de gravar qualquer coisa.
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
// [FIX #13] A conferência nome↔ID vive em tools.js/executar (services/referencias.js).
// A versão anterior ficava aqui e extraía o nome do resumo em texto livre com regex;
// como o prompt nunca exigiu aquele formato, ela quase nunca casava e passava reto.
async function executarFerramentasSequencial(blocosFerramenta) {
  const resultados = [];
  const recuperaveis = new Set();
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
      // [FIX #9] Erros de referência inválida (ID que não existe) são recuperáveis:
      // a mensagem já lista as opções válidas, então o loop pode continuar e deixar
      // o modelo se corrigir sozinho em vez de abortar a conversa.
      if (err.recuperavel === true) recuperaveis.add(bloco.id);
    }
  }
  return { resultados, recuperaveis };
}

function formatarDataBR(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function formatarReal(v) {
  return v != null ? `R$ ${Number(v).toFixed(2).replace(".", ",")}` : "—";
}

// [FIX #9] Conferência gerada pelo CÓDIGO a partir do que a ferramenta realmente
// retornou do banco (nomes via join), nunca do texto livre do modelo. Mesmo que o
// modelo grave um ID existente porém errado (ex: motorista certo por coincidência
// aponta para outra pessoa), esta linha sempre reflete a verdade do banco — o
// usuário consegue flagrar o erro na própria mensagem de confirmação.
function formatarConferencia(nome, r) {
  if (!r) return null;
  if (nome === "criar_viagem_rascunho" || nome === "atualizar_viagem") {
    const cliente = r.clientes?.nome ?? "não definido";
    const motorista = r.motoristas?.nome ?? "não definido";
    const caminhao = r.caminhoes?.placa ?? "não definido";
    return (
      `Viagem #${r.id} — ${r.empresa ?? "empresa a definir"}, ${formatarDataBR(r.data)}\n` +
      `Cliente: ${cliente}${r.cliente_id != null ? ` (#${r.cliente_id})` : ""} | ` +
      `Motorista: ${motorista}${r.motorista_id != null ? ` (#${r.motorista_id})` : ""} | ` +
      `Caminhão: ${caminhao}${r.caminhao_id != null ? ` (#${r.caminhao_id})` : ""}\n` +
      `Frete: ${formatarReal(r.valor_frete)} | Motorista: ${formatarReal(r.valor_motorista)}`
    );
  }
  if (nome === "registrar_despesa") {
    const categoria = r.categoriasdespesas?.categoria ?? "não definida";
    return (
      `Despesa #${r.id} — ${r.empresa}, ${formatarDataBR(r.data)}\n` +
      `Categoria: ${categoria} | Valor: ${formatarReal(r.valor)}`
    );
  }
  return null;
}

const MAX_ITERACOES = 8;

// [FIX #8] Guard anti-alucinação de confirmação: se a resposta final afirma
// que algo foi gravado mas NENHUMA ferramenta de escrita rodou neste turno,
// a resposta é bloqueada e devolvida ao modelo para que ele chame a ferramenta
// de verdade (ou reformule, se era só uma consulta). Determinístico — não
// depende do modelo obedecer o prompt.
const MAX_GUARD_RETRIES = 1;

// Lookbehinds excluem negações comuns ("não cadastrada", "nada foi gravado"),
// que são respostas legítimas quando o usuário recusa uma gravação.
const PADRAO_CONFIRMACAO_ESCRITA =
  /✅|(?<!não )(?<!não foi )(?<!nada foi )(?:cadastrad|registrad|salv|gravad|atualizad|adicionad)[oa]/i;

const AVISO_GUARD =
  "[VERIFICAÇÃO AUTOMÁTICA DO SISTEMA — o usuário NÃO vê esta mensagem] " +
  "Sua resposta afirma que algo foi gravado/cadastrado/registrado, porém NENHUMA " +
  "ferramenta de escrita foi executada neste turno — nada foi salvo no banco. " +
  "Se o usuário confirmou uma gravação, chame AGORA a ferramenta de escrita " +
  "apropriada e só então confirme, citando o ID retornado por ela. " +
  "Se sua resposta se referia a registros já existentes (consulta), reformule-a " +
  "deixando claro que nenhuma gravação nova foi feita agora.";

// [FIX #11] Textos de falha em um só lugar — o que vai para o Telegram e o que vai
// para o histórico precisam contar a mesma história, senão o modelo lê nas conversas
// seguintes um pedido que parece pendente e o usuário lê um erro.
export const TEXTO_FALHA_SEM_GRAVACAO =
  "⚠️ Ocorreu um erro ao processar sua mensagem — nada foi gravado. Pode tentar novamente?";

export const TEXTO_FALHA_APOS_GRAVACAO =
  "⚠️ Ocorreu um erro no meio do processamento, mas parte do pedido JÁ foi gravada no banco.";

// [FIX #11] Monta o aviso ao usuário a partir do que o turno realmente chegou a gravar
// antes de abortar. Dizer "nada foi gravado" quando algo foi é o que faz o usuário
// repetir o pedido e duplicar o registro.
export function textoDeFalha(err) {
  const progresso = err?.progresso;
  if (!progresso?.escritas?.length) return TEXTO_FALHA_SEM_GRAVACAO;

  const conferencia = progresso.conferencias?.length
    ? `\n\n📋 Já gravado:\n${progresso.conferencias.join("\n\n")}`
    : `\n\nGravado: ${progresso.escritas.join(", ")}.`;

  return (
    TEXTO_FALHA_APOS_GRAVACAO +
    conferencia +
    "\n\nConfira antes de repetir o pedido — repetir agora duplicaria o registro."
  );
}

// [FIX #11] Fecha o turno no histórico quando ele aborta por exceção (crédito da API
// esgotado, banco fora do ar, timeout). Sem isso o histórico guarda a mensagem do
// usuário sem nenhuma resposta: nas conversas seguintes o modelo lê aquilo como um
// pedido ainda pendente e pode executá-lo por conta própria — enquanto o usuário, que
// só viu o aviso de erro, repete o pedido achando que não foi feito. As duas coisas
// juntas duplicam o registro.
async function registrarFalhaNoHistorico(telefone, err) {
  const motivo = (err?.message ?? "erro desconhecido").slice(0, 200);
  const escritas = err?.progresso?.escritas ?? [];

  const nota = escritas.length
    ? `[registro do sistema: o turno falhou (${motivo}) DEPOIS de gravar → ${escritas.join(", ")}. ` +
      `Esses registros EXISTEM no banco. Se o usuário repetir o pedido, avise que já está gravado ` +
      `e confirme com ele antes de gravar de novo.]`
    : `[registro do sistema: o turno falhou (${motivo}) e NADA foi gravado. Este pedido não foi ` +
      `atendido e o usuário recebeu apenas um aviso de erro. Não o execute por conta própria — ` +
      `espere ele pedir de novo, e então atenda uma única vez.]`;

  try {
    await registrarMensagem(telefone, "assistant", `${textoDeFalha(err)}\n\n${nota}`);
  } catch (errHistorico) {
    // Não pode mascarar o erro original — só registra e segue.
    console.error("[agent] falha ao registrar o erro no histórico:", errHistorico);
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

  // [FIX #11] Vive fora do try para que o catch saiba o que já tinha ido para o banco
  // quando o turno abortou no meio.
  const progresso = { escritas: [], conferencias: [] };

  try {
    return await rodarTurno(telefone, progresso);
  } catch (err) {
    const erro = err instanceof Error ? err : new Error(String(err));
    erro.progresso = progresso;
    await registrarFalhaNoHistorico(telefone, erro);
    throw erro;
  }
}

async function rodarTurno(telefone, progresso) {
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
  let escreveuNoTurno = false; // [FIX #8] alguma ferramenta de escrita executou com sucesso neste turno
  let guardRetries = 0;
  // Gravações reais do turno (nome #id) — anexadas ao histórico para que o modelo
  // veja, nas conversas futuras, que confirmações verdadeiras vêm acompanhadas de
  // ferramentas executadas (sem isso o histórico ensina que texto sozinho grava).
  // [FIX #11] Moram em `progresso` para sobreviverem a uma exceção no meio do turno.
  const escritasExecutadas = progresso.escritas;
  // [FIX #9] Linhas de conferência (geradas pelo código) de cada escrita bem-sucedida.
  const conferencias = progresso.conferencias;

  for (let iteracao = 0; iteracao < MAX_ITERACOES; iteracao++) {
    const resposta = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
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

    if (resposta.stop_reason !== "tool_use") {
      // [FIX #8] Bloqueia confirmação de gravação sem ferramenta de escrita.
      if (
        !escreveuNoTurno &&
        guardRetries < MAX_GUARD_RETRIES &&
        PADRAO_CONFIRMACAO_ESCRITA.test(respostaFinal)
      ) {
        guardRetries++;
        console.warn(
          `[agent] GUARD: resposta afirma gravação sem ferramenta de escrita neste turno — reinjetando (tentativa ${guardRetries})`,
        );
        mensagens = [
          ...mensagens,
          { role: "assistant", content: resposta.content },
          { role: "user", content: AVISO_GUARD },
        ];
        continue;
      }
      break;
    }

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
    const { resultados: resultadosFerramentas, recuperaveis } =
      await executarFerramentasSequencial(blocosFerramenta);

    // [FIX #8/#9] Marca o turno e monta a conferência só para blocos que realmente
    // gravaram — um erro recuperável no mesmo lote não conta como sucesso.
    // [FIX #12] Roda ANTES do tratamento de erro: uma escrita que deu certo no mesmo
    // lote da que falhou também precisa contar, senão ela some do aviso ao usuário e
    // do histórico, e o usuário repete o pedido sem saber que já está gravada.
    for (const bloco of blocosFerramenta) {
      if (!isFerramentaEscrita(bloco.name)) continue;
      const resultado = resultadosFerramentas.find((r) => r.tool_use_id === bloco.id);
      if (resultado?.is_error) continue;
      escreveuNoTurno = true;
      let parsed;
      try {
        parsed = JSON.parse(resultado?.content);
      } catch {
        // resultado sem JSON parseável — registra só o nome
      }
      escritasExecutadas.push(
        parsed?.id != null ? `${bloco.name} #${parsed.id}` : bloco.name,
      );
      const linha = formatarConferencia(bloco.name, parsed);
      if (linha) conferencias.push(linha);
    }

    // [FIX #7] Se alguma ferramenta de escrita retornou erro NÃO recuperável,
    // interrompe o loop e avisa o usuário — evita que o modelo confirme uma
    // operação que falhou de forma irrecuperável (ex: banco fora do ar).
    const erroEscrita = resultadosFerramentas.find(
      (r) =>
        r.is_error &&
        blocosFerramenta.find(
          (b) => b.id === r.tool_use_id && isFerramentaEscrita(b.name),
        ),
    );

    if (erroEscrita && !recuperaveis.has(erroEscrita.tool_use_id)) {
      const nomeBloco = blocosFerramenta.find(
        (b) => b.id === erroEscrita.tool_use_id,
      )?.name;
      console.error(
        `[agent] interrompendo loop: erro em ferramenta de escrita "${nomeBloco}"`,
      );
      // [FIX #12] Antes este texto dizia "Nada foi registrado" sempre — inclusive quando
      // escritas anteriores do mesmo turno já tinham ido para o banco. O usuário lia que
      // nada foi salvo, repetia o pedido e duplicava o registro.
      respostaFinal = escritasExecutadas.length
        ? `Ocorreu um erro ao tentar salvar os dados (${nomeBloco}) e o pedido não foi concluído. ` +
          `ATENÇÃO: parte do que veio antes JÁ foi gravada — confira abaixo antes de repetir, ` +
          `para não duplicar.`
        : `Ocorreu um erro ao tentar salvar os dados (${nomeBloco}). ` +
          `Nada foi registrado. Por favor, tente novamente ou verifique com o suporte.`;
      return finalizarTurno(telefone, respostaFinal, progresso);
    }

    if (erroEscrita) {
      // [FIX #9] Erro recuperável (ID inexistente) — o tool_result já contém a lista
      // de opções válidas. O loop continua e o modelo tem a chance de se corrigir.
      console.warn(
        `[agent] erro recuperável em ferramenta de escrita — devolvendo ao modelo para autocorreção: ${erroEscrita.content}`,
      );
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

  return finalizarTurno(telefone, respostaFinal, progresso);
}

// [FIX #12] Fecha o turno de forma uniforme nos três pontos de saída (fim normal,
// limite de iterações e erro de escrita). Antes cada um montava a resposta por conta
// própria e eles divergiram: o caminho de erro afirmava "nada foi registrado" e ainda
// assim anexava a conferência do que tinha sido gravado, e não deixava no histórico o
// marcador de gravações que o FIX #8 usa como referência.
async function finalizarTurno(telefone, respostaFinal, progresso) {
  const { escritas, conferencias } = progresso;

  // [FIX #9] Conferência automática — sempre pelo código, nunca pelo texto do modelo.
  const texto = conferencias.length
    ? `${respostaFinal}\n\n📋 Conferência automática (gravado no banco):\n${conferencias.join("\n\n")}`
    : respostaFinal;

  // O marcador vai só para o histórico (não para o usuário): nas próximas conversas
  // o modelo vê que confirmações reais têm gravações associadas.
  const marcador = escritas.length
    ? `\n\n[registro do sistema: gravações executadas neste turno → ${escritas.join(", ")}]`
    : "";

  await registrarMensagem(telefone, "assistant", texto + marcador);
  return texto;
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

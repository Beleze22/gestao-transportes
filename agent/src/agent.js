import Anthropic from "@anthropic-ai/sdk";
import { definicoes, executar } from "./tools.js";
import { buscarHistorico, registrarMensagem } from "./services/history.js";
import * as catalogo from "./services/catalogo.js";
import { ReferenciaInvalidaError } from "./erros.js";

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

function normalizar(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .trim()
    .toLowerCase();
}

// [FIX #10] Rótulos usados pelo próprio prompt no resumo de confirmação (ver
// SYSTEM_PROMPT_BASE) — "Cliente: **NOME**", "Motorista: **NOME**", etc.
// Usados para extrair o nome que o MODELO disse em texto, antes de comparar
// contra o ID que ele está prestes a enviar à ferramenta de escrita.
const CAMPOS_VERIFICAVEIS = [
  {
    campo: "motorista_id",
    rotulo: /Motorista:\s*\*\*([^*]+?)\*\*/i,
    listar: () => catalogo.listarMotoristas(),
    corresponde: (item, nome) =>
      normalizar(item.nome) === normalizar(nome) ||
      item.apelidos?.some((a) => normalizar(a) === normalizar(nome)),
    exibir: (item) => item.nome,
  },
  {
    campo: "cliente_id",
    rotulo: /Cliente:\s*\*\*([^*]+?)\*\*/i,
    listar: () => catalogo.listarClientes(),
    corresponde: (item, nome) => normalizar(item.nome) === normalizar(nome),
    exibir: (item) => item.nome,
  },
  {
    campo: "caminhao_id",
    rotulo: /Caminhão:\s*\*\*([^*]+?)\*\*/i,
    listar: () => catalogo.listarCaminhoes(),
    corresponde: (item, nome) =>
      normalizar(item.placa).replace(/-/g, "") === normalizar(nome).replace(/-/g, ""),
    exibir: (item) => item.placa,
  },
];

// Varre as mensagens da conversa (mais recente primeiro) atrás do resumo mais
// recente que cite o rótulo em questão — funciona tanto para mensagens do
// histórico (content é string) quanto para a resposta corrente do modelo
// nesta mesma chamada (content é um array de blocos).
function extrairNomeCitado(mensagens, regex) {
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const msg = mensagens[i];
    if (msg.role !== "assistant") continue;
    const texto =
      typeof msg.content === "string"
        ? msg.content
        : msg.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n");
    const match = texto.match(regex);
    if (match) return match[1].trim();
  }
  return null;
}

// [FIX #10] Cruza o nome que o modelo escreveu no resumo (texto livre) contra
// o ID que ele está enviando à ferramenta de escrita — pega o caso em que o
// texto está certo ("Motorista: **BEBETO**" → Geovane) mas o parâmetro da tool
// call aponta para outra pessoa/registro que também existe de verdade (ex:
// motorista_id de um motorista diferente). Validação de existência (FK) sozinha
// não pega esse tipo de erro, já que o ID é válido — só está associado à
// entidade errada.
async function verificarCoerenciaNomeId(mensagens, input) {
  const divergencias = [];
  for (const cfg of CAMPOS_VERIFICAVEIS) {
    const idEnviado = input[cfg.campo];
    if (idEnviado == null) continue;

    const nomeCitado = extrairNomeCitado(mensagens, cfg.rotulo);
    if (!nomeCitado) continue; // resumo não mencionou esse campo — nada a cruzar

    const lista = await cfg.listar();
    const candidato = lista.find((item) => cfg.corresponde(item, nomeCitado));
    if (!candidato) continue; // não conseguiu resolver o nome citado — não bloqueia por ambiguidade

    if (candidato.id !== Number(idEnviado)) {
      const enviado = lista.find((item) => item.id === Number(idEnviado));
      divergencias.push(
        `${cfg.campo}=${idEnviado} (${enviado ? cfg.exibir(enviado) : "id desconhecido"}) não corresponde a "${nomeCitado}" citado no resumo — isso é ${cfg.exibir(candidato)} (#${candidato.id}).`,
      );
    }
  }
  return divergencias;
}

// [FIX #1] Execução sequencial de ferramentas para evitar race conditions
// em operações de escrita dependentes entre si.
// O comportamento externo é idêntico — apenas garante ordem de execução.
const FERRAMENTAS_COM_VERIFICACAO_NOME = new Set(["criar_viagem_rascunho", "atualizar_viagem"]);

async function executarFerramentasSequencial(blocosFerramenta, mensagens) {
  const resultados = [];
  const recuperaveis = new Set();
  for (const bloco of blocosFerramenta) {
    try {
      // [FIX #10] Antes de gravar, confere se o ID enviado bate com o nome que
      // o próprio modelo citou no resumo mais recente.
      if (FERRAMENTAS_COM_VERIFICACAO_NOME.has(bloco.name)) {
        const divergencias = await verificarCoerenciaNomeId(mensagens, bloco.input);
        if (divergencias.length) {
          throw new ReferenciaInvalidaError(
            `Divergência entre o resumo apresentado e os dados enviados à ferramenta: ${divergencias.join(" | ")} ` +
              `Confira o cadastro (listar_motoristas/listar_clientes/listar_caminhoes) e corrija antes de tentar gravar de novo.`,
          );
        }
      }

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
  let escreveuNoTurno = false; // [FIX #8] alguma ferramenta de escrita executou com sucesso neste turno
  let guardRetries = 0;
  // Gravações reais do turno (nome #id) — anexadas ao histórico para que o modelo
  // veja, nas conversas futuras, que confirmações verdadeiras vêm acompanhadas de
  // ferramentas executadas (sem isso o histórico ensina que texto sozinho grava).
  const escritasExecutadas = [];
  // [FIX #9] Linhas de conferência (geradas pelo código) de cada escrita bem-sucedida.
  const conferencias = [];

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
    // [FIX #10] Passa `mensagens` (já inclui a resposta atual) para a verificação
    // de coerência nome↔ID poder localizar o resumo mais recente.
    const { resultados: resultadosFerramentas, recuperaveis } =
      await executarFerramentasSequencial(blocosFerramenta, mensagens);

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
      respostaFinal =
        `Ocorreu um erro ao tentar salvar os dados (${nomeBloco}). ` +
        `Nada foi registrado. Por favor, tente novamente ou verifique com o suporte.`;
      if (conferencias.length) {
        respostaFinal += `\n\n📋 Conferência automática (gravado no banco):\n${conferencias.join("\n\n")}`;
      }
      await registrarMensagem(telefone, "assistant", respostaFinal);
      return respostaFinal;
    }

    if (erroEscrita) {
      // [FIX #9] Erro recuperável (ID inexistente) — o tool_result já contém a lista
      // de opções válidas. O loop continua e o modelo tem a chance de se corrigir.
      console.warn(
        `[agent] erro recuperável em ferramenta de escrita — devolvendo ao modelo para autocorreção: ${erroEscrita.content}`,
      );
    }

    // [FIX #8/#9] Marca o turno e monta a conferência só para blocos que realmente
    // gravaram — um erro recuperável no mesmo lote não conta como sucesso.
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

  // [FIX #9] Conferência automática — sempre pelo código, nunca pelo texto do modelo.
  if (conferencias.length) {
    respostaFinal += `\n\n📋 Conferência automática (gravado no banco):\n${conferencias.join("\n\n")}`;
  }

  // O marcador vai só para o histórico (não para o usuário): nas próximas conversas
  // o modelo vê que confirmações reais têm gravações associadas.
  const marcadorEscritas = escritasExecutadas.length
    ? `\n\n[registro do sistema: gravações executadas neste turno → ${escritasExecutadas.join(", ")}]`
    : "";
  await registrarMensagem(telefone, "assistant", respostaFinal + marcadorEscritas);
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

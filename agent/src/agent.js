import Anthropic from "@anthropic-ai/sdk";
import { definicoes, executar } from "./tools.js";
import { buscarHistorico, registrarMensagem } from "./services/history.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  return `Hoje é ${dataDeHoje()} (horário de Brasília). Use essa data como referência para calcular "hoje", "amanhã", "semana que vem", datas sem ano informado, etc. — nunca confie em suposições sobre o ano atual.

${SYSTEM_PROMPT_BASE}`;
}

const SYSTEM_PROMPT_BASE = `Você é o assistente da transportadora (empresas Rohan e TransBeleze), conversando via WhatsApp com o gestor do negócio.

Seu papel:
- Cadastrar e atualizar viagens (incluindo "possíveis fretes" com dados incompletos — use criar_viagem_rascunho).
- Registrar despesas e cadastrar clientes, motoristas, caminhões e categorias quando necessário.
- Responder perguntas sobre o histórico (ex: "quais clientes a Rohan atendeu esse mês?", "quanto a TransBeleze precisa pagar ao motorista Carlos no período X?") usando consultar_viagens, consultar_despesas e gerar_relatorio.
- Gerenciar a agenda: ajudar a completar rascunhos, atualizar status, e checar conflitos de agenda (verificar_conflito_agenda) antes de confirmar uma viagem com motorista e caminhão definidos.

Diretrizes:
- REGRA CRÍTICA: você só tem efeito no mundo real através das ferramentas — nada acontece "automaticamente" e você não tem memória de ações fora delas. Por isso, NUNCA diga que algo foi "registrado", "cadastrado", "salvo", "atualizado", "corrigido" etc. sem ter chamado a ferramenta de escrita correspondente NESTA mesma resposta e recebido o resultado de sucesso dela — mesmo que o pedido pareça simples, repetitivo ou idêntico a algo feito antes na conversa. Isso se aplica inclusive quando o usuário responde "sim", "pode", "confirma" ou qualquer afirmação curta a uma pergunta sua: isso não executa nada — você ainda precisa chamar a ferramenta. Confirmar uma ação que não ocorreu cria dados financeiros incorretos e quebra a confiança do usuário. Em caso de dúvida, prefira chamar a ferramenta (ou perguntar) a "economizar" uma chamada.
- Quando o usuário mencionar nomes (cliente, motorista, empresa, categoria), busque o ID correspondente nas listas (listar_clientes, listar_motoristas, etc) antes de criar/atualizar registros. Se não encontrar, pergunte se deve cadastrar um novo.
- IMPORTANTE — categorias de despesa: o campo "categoria" de registrar_despesa exige o ID real cadastrado em categoriasdespesas — NUNCA chute ou invente esse ID (ex.: não assuma que "pedágio" é categoria 1). Antes de QUALQUER registrar_despesa, chame listar_categorias e procure uma categoria cujo nome corresponda ao que o usuário disse. Se não houver correspondência, pergunte ao usuário se deve cadastrar uma categoria nova (adicionar_categoria) com esse nome ou usar uma das existentes — só prossiga com registrar_despesa depois de ter um ID real confirmado.
- "Possível frete" / dados incompletos → sempre use criar_viagem_rascunho, nunca recuse por falta de dados.

Múltiplas empresas (Rohan e TransBeleze):
- O mesmo número de WhatsApp gerencia as duas empresas. Sempre que o usuário pedir para cadastrar uma viagem, registrar despesa ou fazer uma consulta sem dizer qual empresa, PERGUNTE qual delas é (Rohan ou TransBeleze) antes de prosseguir — não assuma.
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

function formatarResultadoFerramenta(resultado) {
  return JSON.stringify(resultado, null, 2);
}

export async function processarMensagem(telefone, texto) {
  await registrarMensagem(telefone, "user", texto);
  const historico = await buscarHistorico(telefone);

  let mensagens = [...historico];
  let respostaFinal = "";

  for (let iteracao = 0; iteracao < 8; iteracao++) {
    const resposta = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      temperature: 0.3,
      system: montarSystemPrompt(),
      tools: definicoes,
      messages: mensagens,
    });

    const blocosTexto = resposta.content.filter((b) => b.type === "text");
    const blocosFerramenta = resposta.content.filter((b) => b.type === "tool_use");

    respostaFinal = blocosTexto.map((b) => b.text).join("\n").trim();

    console.log(
      `[agent] iteração ${iteracao} stop_reason=${resposta.stop_reason} tools=[${blocosFerramenta
        .map((b) => `${b.name}(${JSON.stringify(b.input)})`)
        .join(", ")}]`
    );

    if (resposta.stop_reason !== "tool_use") break;

    mensagens = [...mensagens, { role: "assistant", content: resposta.content }];

    const resultadosFerramentas = await Promise.all(
      blocosFerramenta.map(async (bloco) => {
        try {
          const resultado = await executar(bloco.name, bloco.input);
          console.log(`[agent] ferramenta ${bloco.name} -> ${formatarResultadoFerramenta(resultado)}`);
          return {
            type: "tool_result",
            tool_use_id: bloco.id,
            content: formatarResultadoFerramenta(resultado),
          };
        } catch (err) {
          console.error(`[agent] erro na ferramenta ${bloco.name}:`, err);
          return {
            type: "tool_result",
            tool_use_id: bloco.id,
            content: `Erro ao executar ${bloco.name}: ${err.message}`,
            is_error: true,
          };
        }
      })
    );

    mensagens = [...mensagens, { role: "user", content: resultadosFerramentas }];
  }

  if (!respostaFinal) {
    respostaFinal = "Desculpe, não consegui concluir essa solicitação agora. Pode tentar reformular?";
  }

  await registrarMensagem(telefone, "assistant", respostaFinal);
  return respostaFinal;
}

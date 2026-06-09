import { supabase } from "../supabaseClient.js";
import { enviarMensagem } from "../telegram.js";

// Respostas com confirmação de escrita abaixo desse tempo são suspeitas.
// Empiricamente: respostas reais (com tool calls) levam 10-25s; fabricadas chegam em < 5s.
const LIMIAR_SEGUNDOS = 7;

const AUDITORIA_CHAT_ID = process.env.AUDITORIA_CHAT_ID || "8235887752";

const REGEX_CONFIRMACAO = /✅.{0,60}(cadastrad|registrad|salv|atualizad|criou|criada)/i;

export async function rodarAuditoriaDiaria() {
  const agora = new Date();
  const inicio = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: mensagens, error } = await supabase
    .from("conversas")
    .select("telefone, role, content, created_at")
    .gte("created_at", inicio)
    .order("created_at", { ascending: true });

  if (error) throw error;

  // Pares user→assistant onde o agente confirmou uma escrita
  const confirmacoesSuspeitas = [];
  let totalConfirmacoes = 0;

  for (let i = 0; i < mensagens.length - 1; i++) {
    const user = mensagens[i];
    const bot = mensagens[i + 1];

    if (
      user.role !== "user" ||
      bot.role !== "assistant" ||
      user.telefone !== bot.telefone ||
      !REGEX_CONFIRMACAO.test(bot.content)
    ) {
      continue;
    }

    totalConfirmacoes++;
    const diffSeg = (new Date(bot.created_at) - new Date(user.created_at)) / 1000;

    if (diffSeg < LIMIAR_SEGUNDOS) {
      confirmacoesSuspeitas.push({
        horario: bot.created_at,
        diffSeg: diffSeg.toFixed(1),
        pedido: user.content.slice(0, 100).replace(/\n/g, " "),
        resposta: bot.content.slice(0, 150).replace(/\n/g, " "),
      });
    }
  }

  // Escritas reais no banco nas últimas 24h
  const [{ count: viagensNovas }, { count: despesasNovas }] = await Promise.all([
    supabase.from("viagens").select("*", { count: "exact", head: true }).gte("criado_em", inicio),
    supabase.from("despesas").select("*", { count: "exact", head: true }).gte("criado_em", inicio),
  ]);

  // Sem atividade — não incomoda
  if (totalConfirmacoes === 0 && viagensNovas === 0 && despesasNovas === 0) return;

  const dataHoje = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  let texto = `📊 Auditoria diária — ${dataHoje}\n\n`;
  texto += `Confirmações do agente: ${totalConfirmacoes}\n`;
  texto += `Registros criados no banco: ${viagensNovas} viagen(s), ${despesasNovas} despesa(s)\n`;

  if (confirmacoesSuspeitas.length === 0) {
    texto += `\n✅ Nenhuma confirmação suspeita. Tudo parece correto.`;
  } else {
    texto += `\n⚠️ ${confirmacoesSuspeitas.length} confirmação(ões) SUSPEITA(S) — resposta muito rápida (< ${LIMIAR_SEGUNDOS}s), provável fabricação:\n`;
    for (const s of confirmacoesSuspeitas) {
      const hora = new Date(s.horario).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
      texto += `\n• ${hora} (${s.diffSeg}s)\n  Pedido: "${s.pedido}"\n`;
    }
    texto += `\nVerifique se esses registros existem no banco antes de confiar nos dados.`;
  }

  await enviarMensagem(AUDITORIA_CHAT_ID, texto);
}

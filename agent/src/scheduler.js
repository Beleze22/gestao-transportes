import cron from "node-cron";
import { listarConfigNotificacoes, viagensDoDia, rascunhosProximosDias, viagensComValorPendente } from "./services/agenda.js";
import { enviarDigestManha, enviarDigestNoite } from "./services/notify.js";
import { rodarAuditoriaDiaria } from "./services/auditoria.js";

// [FIX #18] A passagem diária de "confirmada" para "concluida"/"realizada_pendente" não
// mora mais aqui: é a função marcar_viagens_realizadas(), chamada de hora em hora pelo
// pg_cron do Supabase (migration 008). Quando o Railway pausou o agente em nov/2026,
// viagens já feitas ficaram "confirmada" e sumiram do "A faturar" — uma regra que vale
// para a web não pode depender deste processo estar de pé.

function horaAtual() {
  return new Date().toLocaleTimeString("pt-BR", {
    timeZone: process.env.TZ || "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function rodarDigestManha(config) {
  const viagens = await viagensDoDia(config.empresa_padrao);
  await enviarDigestManha(config.telefone, viagens);
}

async function rodarDigestNoite(config) {
  const [rascunhos, pendentesValor] = await Promise.all([
    rascunhosProximosDias(config.empresa_padrao, config.dias_antecedencia),
    viagensComValorPendente(config.empresa_padrao),
  ]);
  await enviarDigestNoite(config.telefone, { rascunhos, pendentesValor }, config.dias_antecedencia);
}

async function tick() {
  const agora = horaAtual();
  const configs = await listarConfigNotificacoes();

  for (const config of configs) {
    const horaManha = config.horario_manha?.slice(0, 5);
    const horaNoite = config.horario_noite?.slice(0, 5);

    if (agora === horaManha) {
      await rodarDigestManha(config).catch((err) =>
        console.error(`[scheduler] erro no digest matinal de ${config.telefone}:`, err.message)
      );
    }
    if (agora === horaNoite) {
      await rodarDigestNoite(config).catch((err) =>
        console.error(`[scheduler] erro no digest noturno de ${config.telefone}:`, err.message)
      );
    }
  }
}

export function iniciarScheduler() {
  // Roda a cada minuto e dispara os digests cujo horário configurado bate com o horário atual.
  cron.schedule("* * * * *", () => {
    tick().catch((err) => console.error("[scheduler] erro no tick:", err.message));
  });

  // Auditoria de integridade diária às 23h — compara confirmações do agente vs registros reais no banco.
  cron.schedule("0 23 * * *", () => {
    rodarAuditoriaDiaria().catch((err) => console.error("[auditoria] erro:", err.message));
  });

  console.log("[scheduler] iniciado — checando horários de notificação a cada minuto");
}

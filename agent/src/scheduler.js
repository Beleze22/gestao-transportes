import cron from "node-cron";
import { listarConfigNotificacoes, viagensDoDia, rascunhosProximosDias, viagensComValorPendente } from "./services/agenda.js";
import { enviarDigestManha, enviarDigestNoite } from "./services/notify.js";
import { marcarRealizadasPendentes } from "./services/viagens.js";
import { rodarAuditoriaDiaria } from "./services/auditoria.js";

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

  // Vira viagens "confirmada" cuja data já passou para "realizada_pendente" (à meia-noite).
  cron.schedule("0 0 * * *", () => {
    marcarRealizadasPendentes()
      .then((alteradas) => {
        if (alteradas.length) console.log(`[scheduler] ${alteradas.length} viagem(ns) marcada(s) como realizada_pendente`);
      })
      .catch((err) => console.error("[scheduler] erro ao marcar viagens pendentes:", err.message));
  });

  // Auditoria de integridade diária às 23h — compara confirmações do agente vs registros reais no banco.
  cron.schedule("0 23 * * *", () => {
    rodarAuditoriaDiaria().catch((err) => console.error("[auditoria] erro:", err.message));
  });

  console.log("[scheduler] iniciado — checando horários de notificação a cada minuto");
}

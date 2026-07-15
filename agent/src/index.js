import "dotenv/config";
import express from "express";
import { extrairMensagemRecebida, enviarMensagem, transcreverAudio } from "./telegram.js";
import { processarMensagem } from "./agent.js";
import { iniciarScheduler } from "./scheduler.js";
import { listarConfigNotificacoes, viagensDoDia, rascunhosProximosDias, viagensComValorPendente } from "./services/agenda.js";
import { enviarDigestManha, enviarDigestNoite } from "./services/notify.js";

const app = express();
app.use(express.json());

const whitelist = (process.env.TELEGRAM_ALLOWED_IDS || "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";

// Secret obrigatório para os endpoints /test — sem a env var eles ficam desabilitados,
// evitando que qualquer pessoa com a URL pública injete comandos de escrita no agente.
const testSecret = process.env.TEST_ENDPOINT_SECRET || "";

// Fila por chat: mensagens do mesmo usuário processam em série, nunca em paralelo —
// evita histórico intercalado e gravação dupla quando duas mensagens chegam juntas.
const filasPorChat = new Map();

function enfileirarPorChat(chatId, tarefa) {
  const anterior = filasPorChat.get(chatId) ?? Promise.resolve();
  const atual = anterior.then(tarefa, tarefa);
  filasPorChat.set(chatId, atual);
  atual.finally(() => {
    if (filasPorChat.get(chatId) === atual) filasPorChat.delete(chatId);
  });
  return atual;
}

// Dedup de update_id — o Telegram pode reenviar o mesmo update (ex: timeout de rede).
const MAX_UPDATES_VISTOS = 1000;
const updatesVistos = new Set();

function updateJaProcessado(updateId) {
  if (updateId == null) return false;
  if (updatesVistos.has(updateId)) return true;
  updatesVistos.add(updateId);
  if (updatesVistos.size > MAX_UPDATES_VISTOS) {
    updatesVistos.delete(updatesVistos.values().next().value);
  }
  return false;
}

function exigirTestSecret(req, res, next) {
  if (!testSecret) {
    return res.status(403).json({ erro: "endpoints de teste desabilitados (defina TEST_ENDPOINT_SECRET)" });
  }
  if (req.headers["x-test-secret"] !== testSecret) {
    return res.status(403).json({ erro: "secret inválido" });
  }
  next();
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "local" })
);

app.post("/webhook/telegram", async (req, res) => {
  // Valida o secret token que o Telegram envia no header (configurado no setWebhook).
  if (webhookSecret && req.headers["x-telegram-bot-api-secret-token"] !== webhookSecret) {
    return res.status(403).end();
  }

  // Responde imediatamente — o processamento acontece de forma assíncrona.
  res.status(200).end();

  if (updateJaProcessado(req.body?.update_id)) {
    console.log(`[webhook] update duplicado ignorado: ${req.body.update_id}`);
    return;
  }

  const mensagem = extrairMensagemRecebida(req.body);
  if (!mensagem) return;

  const { chatId, audioFileId } = mensagem;
  let { texto } = mensagem;

  if (whitelist.length && !whitelist.includes(chatId)) {
    console.log(`[webhook] mensagem ignorada — chat_id fora da whitelist: ${chatId}`);
    return;
  }

  await enfileirarPorChat(chatId, async () => {
    try {
      if (audioFileId) {
        try {
          texto = await transcreverAudio(audioFileId);
          console.log(`[webhook] áudio transcrito (${chatId}): ${texto}`);
        } catch (err) {
          console.error("[webhook] erro na transcrição:", err);
          await enviarMensagem(chatId, "Não consegui entender o áudio. Pode mandar em texto?");
          return;
        }
      }

      const resposta = await processarMensagem(chatId, texto);
      await enviarMensagem(chatId, resposta);
    } catch (err) {
      console.error("[webhook] erro ao processar mensagem:", err);
      // Avisa o usuário — sem isso ele fica no vácuo e pode achar que a mensagem foi processada.
      try {
        await enviarMensagem(
          chatId,
          "⚠️ Ocorreu um erro ao processar sua mensagem — nada foi gravado. Pode tentar novamente?",
        );
      } catch (errEnvio) {
        console.error("[webhook] falha também ao enviar aviso de erro:", errEnvio);
      }
    }
  });
});

// Endpoint de teste: aciona o agente via HTTP em vez do Telegram.
app.post("/test/mensagem", exigirTestSecret, async (req, res) => {
  const { chatId, texto } = req.body || {};
  if (!chatId || !texto) {
    return res.status(400).json({ erro: "informe chatId e texto" });
  }
  if (whitelist.length && !whitelist.includes(String(chatId))) {
    return res.status(403).json({ erro: "chatId fora da whitelist" });
  }

  try {
    const resposta = await processarMensagem(String(chatId), texto);
    res.json({ resposta });
  } catch (err) {
    console.error("[test/mensagem] erro:", err);
    res.status(500).json({ erro: err.message });
  }
});

app.post("/test/digest-manha", exigirTestSecret, async (_req, res) => {
  try {
    const configs = await listarConfigNotificacoes();
    for (const config of configs) {
      const viagens = await viagensDoDia(config.empresa_padrao);
      await enviarDigestManha(config.telefone, viagens);
    }
    res.json({ ok: true, enviado_para: configs.map((c) => c.telefone) });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/test/digest-noite", exigirTestSecret, async (_req, res) => {
  try {
    const configs = await listarConfigNotificacoes();
    for (const config of configs) {
      const [rascunhos, pendentesValor] = await Promise.all([
        rascunhosProximosDias(config.empresa_padrao, config.dias_antecedencia),
        viagensComValorPendente(config.empresa_padrao),
      ]);
      await enviarDigestNoite(config.telefone, { rascunhos, pendentesValor }, config.dias_antecedencia);
    }
    res.json({ ok: true, enviado_para: configs.map((c) => c.telefone) });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`[server] agente ouvindo na porta ${port}`);
  iniciarScheduler();
});

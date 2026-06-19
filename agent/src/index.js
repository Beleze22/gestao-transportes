import "dotenv/config";
import express from "express";
import { extrairMensagemRecebida, enviarMensagem } from "./telegram.js";
import { transcreverAudio } from "./services/transcricao.js";
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

  try {
    const mensagem = extrairMensagemRecebida(req.body);
    if (!mensagem) return;

    const { chatId, tipo } = mensagem;

    if (whitelist.length && !whitelist.includes(chatId)) {
      console.log(`[webhook] mensagem ignorada — chat_id fora da whitelist: ${chatId}`);
      return;
    }

    let texto;
    if (tipo === "audio") {
      console.log(`[webhook] áudio recebido de ${chatId}, transcrevendo...`);
      texto = await transcreverAudio(mensagem.fileId);
      if (!texto) {
        await enviarMensagem(chatId, "Não consegui entender o áudio. Pode tentar novamente ou enviar por texto?");
        return;
      }
    } else {
      texto = mensagem.texto;
    }

    const resposta = await processarMensagem(chatId, texto);
    await enviarMensagem(chatId, resposta);
  } catch (err) {
    console.error("[webhook] erro ao processar mensagem:", err);
    try {
      const msg = extrairMensagemRecebida(req.body);
      if (msg?.chatId) {
        await enviarMensagem(msg.chatId, "Ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.");
      }
    } catch (_) {}
  }
});

// Endpoint de teste: aciona o agente via HTTP em vez do Telegram.
app.post("/test/mensagem", async (req, res) => {
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

app.post("/test/digest-manha", async (_req, res) => {
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

app.post("/test/digest-noite", async (_req, res) => {
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

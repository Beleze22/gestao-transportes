import "dotenv/config";
import express from "express";
import { extrairMensagemRecebida, enviarMensagem } from "./telegram.js";
import { processarMensagem } from "./agent.js";
import { iniciarScheduler } from "./scheduler.js";

const app = express();
app.use(express.json());

const whitelist = (process.env.TELEGRAM_ALLOWED_IDS || "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";

app.get("/health", (_req, res) => res.json({ ok: true }));

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

    const { chatId, texto } = mensagem;

    if (whitelist.length && !whitelist.includes(chatId)) {
      console.log(`[webhook] mensagem ignorada — chat_id fora da whitelist: ${chatId}`);
      return;
    }

    const resposta = await processarMensagem(chatId, texto);
    await enviarMensagem(chatId, resposta);
  } catch (err) {
    console.error("[webhook] erro ao processar mensagem:", err);
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`[server] agente ouvindo na porta ${port}`);
  iniciarScheduler();
});

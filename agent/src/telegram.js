const BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function enviarMensagem(chatId, texto) {
  const resp = await fetch(`${BASE()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Telegram sendMessage falhou (${resp.status}): ${err}`);
  }
}

export function extrairMensagemRecebida(update) {
  const msg = update?.message;
  if (!msg?.text) return null;
  return {
    chatId: String(msg.chat.id),
    texto: msg.text,
  };
}

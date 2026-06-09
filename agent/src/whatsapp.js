import axios from "axios";

const api = axios.create({
  baseURL: process.env.EVOLUTION_API_URL,
  headers: { apikey: process.env.EVOLUTION_API_KEY },
});

const instance = process.env.EVOLUTION_INSTANCE_NAME;

export async function enviarMensagem(telefone, texto) {
  await api.post(`/message/sendText/${instance}`, {
    number: telefone,
    text: texto,
  });
}

export function extrairMensagemRecebida(payload) {
  const msg = payload?.data;
  if (!msg || msg.key?.fromMe) return null;

  const telefone = msg.key?.remoteJid?.replace(/@s\.whatsapp\.net$/, "");
  const texto =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    null;

  if (!telefone || !texto) return null;
  return { telefone, texto };
}

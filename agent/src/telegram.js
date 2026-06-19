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
  if (!msg) return null;

  if (msg.text) {
    return { chatId: String(msg.chat.id), texto: msg.text, audioFileId: null };
  }

  if (msg.voice) {
    return { chatId: String(msg.chat.id), texto: null, audioFileId: msg.voice.file_id };
  }

  return null;
}

export async function transcreverAudio(fileId) {
  // 1. Obtém o caminho do arquivo no servidor do Telegram
  const fileResp = await fetch(`${BASE()}/getFile?file_id=${fileId}`);
  if (!fileResp.ok) throw new Error(`Telegram getFile falhou (${fileResp.status})`);
  const fileData = await fileResp.json();
  const filePath = fileData.result?.file_path;
  if (!filePath) throw new Error("Telegram getFile não retornou file_path");

  // 2. Baixa o arquivo de áudio
  const audioResp = await fetch(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`,
  );
  if (!audioResp.ok) throw new Error(`Download do áudio falhou (${audioResp.status})`);
  const audioBuffer = await audioResp.arrayBuffer();

  // 3. Envia para o Groq Whisper
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "audio.ogg");
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "pt");

  const groqResp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  if (!groqResp.ok) {
    const err = await groqResp.text();
    throw new Error(`Groq transcrição falhou (${groqResp.status}): ${err}`);
  }

  const result = await groqResp.json();
  return result.text;
}

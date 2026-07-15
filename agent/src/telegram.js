const BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Limite oficial do Telegram é 4096 chars; margem para não cortar no limite exato.
const MAX_CHARS_MENSAGEM = 4000;

function dividirTexto(texto) {
  if (texto.length <= MAX_CHARS_MENSAGEM) return [texto];
  const partes = [];
  let restante = texto;
  while (restante.length > MAX_CHARS_MENSAGEM) {
    // Prefere quebrar em fim de linha para não cortar frases no meio.
    let corte = restante.lastIndexOf("\n", MAX_CHARS_MENSAGEM);
    if (corte < MAX_CHARS_MENSAGEM / 2) corte = MAX_CHARS_MENSAGEM;
    partes.push(restante.slice(0, corte));
    restante = restante.slice(corte).replace(/^\n+/, "");
  }
  if (restante) partes.push(restante);
  return partes;
}

async function enviarParte(chatId, texto) {
  // Tenta com Markdown (renderiza os **negritos** do agente); se o parse falhar
  // (caractere não escapado), reenvia como texto puro em vez de perder a mensagem.
  let resp = await fetch(`${BASE()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "Markdown" }),
  });
  if (resp.status === 400) {
    resp = await fetch(`${BASE()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    });
  }
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Telegram sendMessage falhou (${resp.status}): ${err}`);
  }
}

export async function enviarMensagem(chatId, texto) {
  for (const parte of dividirTexto(texto)) {
    await enviarParte(chatId, parte);
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

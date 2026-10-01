const BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Limite oficial do Telegram é 4096 chars; margem para não cortar no limite exato.
const MAX_CHARS_MENSAGEM = 4000;

// [FIX #16] Tentativas para falha de CONEXÃO com a api.telegram.org.
const TENTATIVAS_ENVIO = 3;
const ESPERA_BASE_MS = 500;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

// [FIX #16] Falha de CONEXÃO não é falha de requisição. Quando o fetch rejeita
// (TypeError: fetch failed, com ETIMEDOUT em internalConnectMultiple), não existe status
// para inspecionar: a conexão com a api.telegram.org nem se estabeleceu e o Telegram não
// recebeu nada. Antes isso estourava na primeira tentativa, e a resposta do turno era
// perdida — aconteceu duas vezes seguidas em 01/10/2026, com a saída de rede do Railway
// falhando em ~1s e voltando a funcionar no segundo seguinte (o aviso de erro, enviado
// por esta mesma função, chegou).
//
// Repetir é seguro aqui porque a falha é na fase de conexão: nada foi entregue. O risco
// teórico é uma falha de rede DEPOIS de o corpo ter sido enviado, que duplicaria a
// mensagem — o Telegram não tem chave de idempotência para evitar isso. Mensagem repetida
// é incômodo visual; resposta perdida é o gerente sem saber se a viagem foi gravada.
//
// Fora do escopo de propósito: 429 e 5xx. Eles chegam COM status e resposta, e o 429
// traz retry_after — repetir sem respeitar esse valor piora o bloqueio.
async function postSendMessage(corpo) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS_ENVIO; tentativa++) {
    try {
      return await fetch(`${BASE()}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
    } catch (err) {
      ultimoErro = err;
      console.warn(
        `[telegram] falha de conexão na tentativa ${tentativa}/${TENTATIVAS_ENVIO}: ${err.message}`,
      );
      if (tentativa < TENTATIVAS_ENVIO) await esperar(ESPERA_BASE_MS * tentativa);
    }
  }
  throw ultimoErro;
}

async function enviarParte(chatId, texto) {
  // Tenta com Markdown (renderiza os **negritos** do agente); se o parse falhar
  // (caractere não escapado), reenvia como texto puro em vez de perder a mensagem.
  let resp = await postSendMessage({ chat_id: chatId, text: texto, parse_mode: "Markdown" });
  if (resp.status === 400) {
    resp = await postSendMessage({ chat_id: chatId, text: texto });
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

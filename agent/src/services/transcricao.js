const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const BASE_TELEGRAM = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function transcreverAudio(fileId) {
  // 1. Obtém o caminho do arquivo no Telegram
  const infoResp = await fetch(`${BASE_TELEGRAM()}/getFile?file_id=${fileId}`);
  if (!infoResp.ok) throw new Error(`Telegram getFile falhou (${infoResp.status})`);
  const { result } = await infoResp.json();

  // 2. Baixa o arquivo de áudio
  const audioResp = await fetch(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${result.file_path}`
  );
  if (!audioResp.ok) throw new Error(`Download do áudio falhou (${audioResp.status})`);
  const audioBuffer = await audioResp.arrayBuffer();

  // 3. Envia para o Groq Whisper
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "audio.ogg");
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "pt");
  form.append("response_format", "text");

  const groqResp = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });

  if (!groqResp.ok) {
    const err = await groqResp.text();
    throw new Error(`Groq transcrição falhou (${groqResp.status}): ${err}`);
  }

  const texto = (await groqResp.text()).trim();
  console.log(`[transcricao] áudio transcrito: "${texto}"`);
  return texto;
}

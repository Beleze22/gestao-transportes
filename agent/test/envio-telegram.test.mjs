// FIX #16 — falha de conexão com a api.telegram.org não pode custar a resposta do turno.
// Em 01/10/2026 duas respostas seguidas se perderam com `TypeError: fetch failed`
// (ETIMEDOUT na fase de conexão): o fetch rejeita, não há status para inspecionar, e o
// único retry que existia só cobria status 400. Nos dois casos o aviso de erro, enviado
// pela mesma função um segundo depois, chegou — ou seja, repetir resolvia.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = "token-de-teste";

const { enviarMensagem } = await import(new URL("../src/telegram.js", import.meta.url).href);

const fetchOriginal = globalThis.fetch;

// Cada entrada de `respostas` é o que a n-ésima chamada faz: um Error para simular queda
// de conexão (o fetch REJEITA, não devolve status), ou um objeto de resposta.
function instalarFetch(respostas) {
  const chamadas = [];
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push(JSON.parse(opcoes.body));
    const programada = respostas[chamadas.length - 1];
    if (programada instanceof Error) throw programada;
    return programada;
  };
  return chamadas;
}

const ok = { ok: true, status: 200, text: async () => "" };
const resposta = (status) => ({
  ok: status < 400,
  status,
  text: async () => `{"error_code":${status}}`,
});
const quedaDeConexao = () => {
  const err = new TypeError("fetch failed");
  err.cause = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
  return err;
};

test.afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

test("queda de conexão é repetida, e a resposta não se perde", async () => {
  const chamadas = instalarFetch([quedaDeConexao(), ok]);

  await enviarMensagem("999", "Despesa #88 registrada");

  assert.equal(chamadas.length, 2, "tem de tentar de novo depois da queda");
  assert.equal(chamadas[1].text, "Despesa #88 registrada");
  assert.equal(chamadas[1].parse_mode, "Markdown", "a repetição mantém o Markdown");
});

test("esgotadas as tentativas, propaga o erro de conexão original", async () => {
  const chamadas = instalarFetch([quedaDeConexao(), quedaDeConexao(), quedaDeConexao()]);

  await assert.rejects(() => enviarMensagem("999", "qualquer coisa"), /fetch failed/);

  assert.equal(chamadas.length, 3, "três tentativas, nem mais nem menos");
});

test("erro 400 continua caindo para texto puro, sem contar como queda", async () => {
  const chamadas = instalarFetch([resposta(400), ok]);

  await enviarMensagem("999", "texto com [marcador não fechado");

  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].parse_mode, "Markdown");
  assert.equal(chamadas[1].parse_mode, undefined, "a segunda vai sem parse_mode");
});

// 429 e 5xx chegam COM status e resposta — repetir sem respeitar o retry_after do 429
// piora o bloqueio, então o retry do FIX #16 cobre só falha de conexão.
test("status que não é 400 falha na primeira, sem repetição", async () => {
  const chamadas = instalarFetch([resposta(500), ok, ok]);

  await assert.rejects(() => enviarMensagem("999", "qualquer coisa"), /falhou \(500\)/);

  assert.equal(chamadas.length, 1);
});

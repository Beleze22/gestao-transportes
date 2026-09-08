// FIX #11 — um turno que aborta (crédito da API esgotado, timeout, banco fora) não
// pode deixar a mensagem do usuário órfã no histórico: nas conversas seguintes o modelo
// leria aquilo como pedido pendente e poderia executá-lo sozinho, enquanto o usuário,
// que só viu o aviso de erro, repete o pedido. As duas coisas juntas duplicam registro.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const SRC = new URL("../src/", import.meta.url).href;

// Servidor local no lugar da API da Anthropic, respondendo como uma conta sem crédito.
const servidor = http.createServer((_req, res) => {
  res.writeHead(400, { "content-type": "application/json" });
  res.end(JSON.stringify({
    type: "error",
    error: { type: "invalid_request_error", message: "Your credit balance is too low." },
  }));
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));

process.env.ANTHROPIC_API_KEY = "sk-ant-test";
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${servidor.address().port}`;
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_KEY = "test";

const gravadas = [];
mock.module(`${SRC}services/history.js`, {
  namedExports: {
    buscarHistorico: async () => gravadas.map(({ role, content }) => ({ role, content })),
    registrarMensagem: async (telefone, role, content) => { gravadas.push({ telefone, role, content }); },
  },
});

const { processarMensagem, textoDeFalha } = await import(`${SRC}agent.js`);

test("turno que aborta na API fecha o turno no histórico", async () => {
  await assert.rejects(() => processarMensagem("999", "cadastra um frete pro cliente X dia 10"));

  assert.equal(gravadas.length, 2, "grava a mensagem do usuário E o fechamento do turno");
  assert.equal(gravadas[0].role, "user");
  assert.equal(gravadas[1].role, "assistant");
  assert.match(gravadas[1].content, /NADA foi gravado/);
  assert.match(gravadas[1].content, /Não o execute por conta própria/);
});

test("textoDeFalha não afirma 'nada foi gravado' quando algo foi", () => {
  assert.match(textoDeFalha(new Error("boom")), /nada foi gravado/i);

  const err = new Error("boom");
  err.progresso = {
    escritas: ["criar_viagem_rascunho #488"],
    conferencias: ["Viagem #488 — Rohan, 10/09/2026"],
  };
  const com = textoDeFalha(err);
  assert.doesNotMatch(com, /nada foi gravado/i, "não pode mentir que nada foi salvo");
  assert.match(com, /JÁ foi gravada/);
  assert.match(com, /Viagem #488/);
  assert.match(com, /duplicaria o registro/);
});

test.after(() => servidor.close());

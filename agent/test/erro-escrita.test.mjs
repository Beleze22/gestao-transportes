// FIX #12 — quando uma escrita falha de forma não recuperável, o aviso não pode
// afirmar "nada foi registrado" se outra escrita do mesmo turno já foi para o banco.
// O usuário leria que nada foi salvo, repetiria o pedido e duplicaria o registro.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const SRC = new URL("../src/", import.meta.url).href;

// O modelo pede duas escritas no mesmo turno: a primeira dá certo, a segunda falha.
const servidor = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-4-5",
    content: [
      { type: "tool_use", id: "t1", name: "adicionar_cliente", input: { nome: "NOVO CLIENTE" } },
      { type: "tool_use", id: "t2", name: "criar_viagem_rascunho", input: { data: "2026-09-10" } },
    ],
    stop_reason: "tool_use", stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
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

mock.module(`${SRC}tools.js`, {
  namedExports: {
    definicoes: [],
    executar: async (nome) => {
      if (nome === "adicionar_cliente") return { id: 99, nome: "NOVO CLIENTE" };
      throw new Error("banco fora do ar"); // sem .recuperavel -> não recuperável
    },
  },
});

const { processarMensagem } = await import(`${SRC}agent.js`);

test("erro de escrita não mente sobre o que já foi gravado", async () => {
  const resposta = await processarMensagem("999", "cadastra o cliente NOVO CLIENTE e uma viagem dia 10");

  assert.doesNotMatch(resposta, /Nada foi registrado/i,
    "adicionar_cliente #99 foi gravado — não pode dizer que nada foi");
  assert.match(resposta, /JÁ foi gravada/);
  assert.match(resposta, /não duplicar/);

  const ultima = gravadas.at(-1);
  assert.equal(ultima.role, "assistant");
  assert.match(ultima.content, /gravações executadas neste turno → adicionar_cliente #99/,
    "o histórico precisa manter o marcador que o FIX #8 usa como referência");
});

test.after(() => servidor.close());

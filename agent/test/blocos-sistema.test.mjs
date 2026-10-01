// FIX #17 — a conferência automática e o marcador de gravações são produzidos só pelo
// código. O modelo os vê no histórico (`finalizarTurno` grava `texto + marcador`) e passou
// a escrevê-los: em 01/10/2026, a despesa #88 saiu com os dois DUPLICADOS, e a cópia do
// modelo inventava "Obs: teste", campo que o código não gera.
//
// O sintoma leve é a resposta duplicada. O grave é o marcador poder ser escrito pelo
// modelo: ele existe para que, nas conversas seguintes, confirmação real venha acompanhada
// de gravação — se é falsificável, deixa de ser prova.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const SRC = new URL("../src/", import.meta.url).href;

// O modelo grava a despesa na primeira iteração e, na segunda, responde imitando os
// blocos do sistema — exatamente o texto do caso real de 01/10/2026.
const RESPOSTA_IMITADA =
  "✅ **Despesa #88 registrada!**\n\n" +
  "**Rohan - DIESEL - R$ 1,00** em 01/10/2026  \nObservação: teste\n\n" +
  "📋 Conferência automática (gravado no banco):\n" +
  "Despesa #88 — Rohan, 01/10/2026\n" +
  "Categoria: DIESEL | Valor: R$ 1,00 | Obs: teste\n\n" +
  "[registro do sistema: gravações executadas neste turno → registrar_despesa #88]";

// Resposta do modelo quando ele escreve SÓ a imitação, sem texto próprio nenhum.
const SO_IMITACAO =
  "📋 Conferência automática (gravado no banco):\nDespesa #88 — Rohan, 01/10/2026";

// O servidor decide pelo CONTEÚDO da requisição, não por um contador de chamadas: o
// histórico é compartilhado entre os testes deste arquivo, e um contador global faria o
// segundo teste receber a resposta da segunda iteração do primeiro.
const servidor = http.createServer(async (req, res) => {
  const bruto = await new Promise((r) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => r(b));
  });
  const { messages } = JSON.parse(bruto);

  // Primeira iteração do turno: ainda não há tool_result no contexto.
  const jaGravou = messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result"),
  );
  // O pedido do turno atual é a última mensagem de usuário em texto (as de tool_result
  // são array). Olhar a última, e não qualquer uma, evita pegar o pedido de outro teste.
  const pedido = [...messages]
    .reverse()
    .find((m) => m.role === "user" && typeof m.content === "string");
  const soImitacao = pedido?.content.includes("SO-IMITACAO") ?? false;

  res.writeHead(200, { "content-type": "application/json" });
  const corpo = jaGravou
    ? {
        content: [{ type: "text", text: soImitacao ? SO_IMITACAO : RESPOSTA_IMITADA }],
        stop_reason: "end_turn",
      }
    : {
        content: [{
          type: "tool_use", id: "t1", name: "registrar_despesa",
          input: { empresa: "Rohan", data: "2026-10-01", valor: 1 },
        }],
        stop_reason: "tool_use",
      };
  res.end(JSON.stringify({
    id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-4-5",
    stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
    ...corpo,
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
    executar: async () => ({
      id: 88, empresa: "Rohan", data: "2026-10-01", valor: 1,
      categoriasdespesas: { categoria: "DIESEL" },
    }),
  },
});

const { processarMensagem, limparBlocosDeSistema } = await import(`${SRC}agent.js`);

const CONFERENCIA = /📋 Conferência automática/g;
const MARCADOR = /\[registro do sistema:/g;

test("o marcador do sistema é removido do texto do modelo", () => {
  const limpo = limparBlocosDeSistema(
    "Pronto!\n\n[registro do sistema: gravações executadas neste turno → registrar_despesa #88]",
  );
  assert.equal(limpo, "Pronto!");
});

test("a conferência imitada é cortada, e com ela tudo que vem depois", () => {
  assert.equal(limparBlocosDeSistema(RESPOSTA_IMITADA).match(CONFERENCIA), null);
  assert.equal(limparBlocosDeSistema(RESPOSTA_IMITADA).match(MARCADOR), null);
  assert.match(limparBlocosDeSistema(RESPOSTA_IMITADA), /^✅ \*\*Despesa #88 registrada!\*\*/);
});

test("tolera paráfrase e negrito na imitação", () => {
  assert.equal(limparBlocosDeSistema("Feito.\n\n📋 **Conferencia automatica**\nDespesa #88"), "Feito.");
});

test("texto legítimo passa intacto", () => {
  const texto = "Faturamento de setembro: R$ 20.360,00\n\nQuer o detalhamento por cliente?";
  assert.equal(limparBlocosDeSistema(texto), texto);
});

test("resposta que era só imitação não vira mensagem vazia", async () => {
  // Texto vazio é recusado pelo Telegram com 400, e a resposta inteira se perderia por
  // causa da limpeza — o oposto do que o FIX #17 quer.
  assert.equal(limparBlocosDeSistema(SO_IMITACAO), "");

  const resposta = await processarMensagem("999", "SO-IMITACAO: registra 1 real de diesel");

  assert.notEqual(resposta.trim(), "");
  assert.match(resposta, /^Pronto\./);
  assert.match(resposta, /Despesa #88 — Rohan, 01\/10\/2026/, "a conferência do código fica");
});

test("a resposta final tem uma conferência e nenhum marcador", async () => {
  const resposta = await processarMensagem("999", "registra 1 real de diesel pra Rohan");

  assert.equal(resposta.match(CONFERENCIA)?.length, 1, "uma conferência, a do código");
  assert.equal(resposta.match(MARCADOR), null, "o marcador nunca vai para o usuário");
  // A conferência do código não tem campo de observação; a do modelo inventava um.
  assert.match(resposta, /Categoria: DIESEL \| Valor: R\$ 1,00$/);
  assert.doesNotMatch(resposta, /Obs: teste/);
});

test("o histórico guarda exatamente um marcador, o do código", async () => {
  await processarMensagem("999", "registra 1 real de diesel pra Rohan");

  const ultima = gravadas.at(-1);
  assert.equal(ultima.role, "assistant");
  assert.equal(ultima.content.match(MARCADOR)?.length, 1);
  assert.match(ultima.content, /gravações executadas neste turno → registrar_despesa #88\]$/);
});

test.after(() => servidor.close());

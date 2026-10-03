// Spec 02 — viagem que está numa ordem fechada não muda de valor. A trava vive no banco
// (SQLSTATE TRV01, migration 005) porque o agente usa a chave secreta e ignora RLS.
//
// O que este teste protege: a mensagem do banco chegar ao usuário INTEIRA, e o turno
// terminar ali. O caminho antigo de erro de escrita (FIX #12) trocava qualquer falha pelo
// texto genérico "Ocorreu um erro ao tentar salvar os dados" — que esconderia justamente a
// instrução de reabrir a ordem na web. E o risco maior não é a mensagem feia: é o modelo
// tentar contornar o bloqueio criando uma viagem nova com o valor corrigido, duplicando o
// faturamento.
//
// O erro é simulado no serviço, não na ferramenta, para o teste passar pela conversão real
// que mora no tools.js.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const SRC = new URL("../src/", import.meta.url).href;

const MENSAGEM_DO_BANCO =
  "Viagem #530 está na ordem #12 (fechada). Para alterar valor, empresa ou cliente, " +
  "reabra a ordem na web.";

// O modelo pede a alteração; na iteração seguinte tentaria responder.
let chamadas = 0;
const servidor = http.createServer((_req, res) => {
  chamadas++;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-4-5",
    stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
    content: [{
      type: "tool_use", id: "t1", name: "atualizar_viagem",
      input: { id: 530, valor_frete: 1200 },
    }],
    stop_reason: "tool_use",
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

// A conferência nome↔ID (FIX #13) bateria no banco; aqui ela sai do caminho.
mock.module(`${SRC}services/referencias.js`, {
  namedExports: {
    conferirReferencias: async () => {},
    semCamposDeConferencia: (input) => input,
  },
});

// O erro é o que o PostgREST devolve quando a trigger levanta TRV01: objeto simples, com
// `code` e `message` — não uma instância de Error.
let tentativasDeEscrita = 0;
mock.module(`${SRC}services/viagens.js`, {
  namedExports: {
    atualizarViagem: async () => {
      tentativasDeEscrita++;
      throw { code: "TRV01", message: MENSAGEM_DO_BANCO, details: null, hint: null };
    },
    criarViagemRascunho: async () => { tentativasDeEscrita++; return { id: 999 }; },
    consultarViagens: async () => [],
  },
});

const { processarMensagem } = await import(`${SRC}agent.js`);

test("a mensagem da trava chega ao usuário inteira", async () => {
  const resposta = await processarMensagem("999", "muda o frete da viagem 530 para 1200");

  assert.equal(resposta, MENSAGEM_DO_BANCO,
    "a resposta é a mensagem do banco, sem envelope nem texto genérico por cima");
  assert.doesNotMatch(resposta, /Ocorreu um erro ao tentar salvar/,
    "o texto genérico do FIX #12 esconderia a instrução de reabrir a ordem");
});

test("o turno termina na trava, sem tentar outro caminho", async () => {
  tentativasDeEscrita = 0;
  const chamadasAntes = chamadas;

  await processarMensagem("999", "muda o frete da viagem 530 para 1200");

  assert.equal(tentativasDeEscrita, 1,
    "uma tentativa e só: contornar a trava com outra gravação duplicaria o faturamento");
  assert.equal(chamadas - chamadasAntes, 1,
    "o loop não volta ao modelo depois da trava — ela não é recuperável");
});

test("o histórico registra que a viagem não foi alterada", async () => {
  await processarMensagem("999", "muda o frete da viagem 530 para 1200");

  const ultima = gravadas.at(-1);
  assert.equal(ultima.role, "assistant");
  assert.match(ultima.content, /ordem #12 \(fechada\)/);
  assert.doesNotMatch(ultima.content, /registro do sistema: gravações executadas/,
    "nada foi gravado neste turno, então não existe marcador de gravação");
});

test.after(() => servidor.close());

// FIX #14 — editar uma viagem cancelada não pode ressuscitá-la. Sem a guarda, o
// status caía no statusPorCompletude e voltava para "confirmada", devolvendo a viagem
// a todos os totais financeiros sem ninguém ter pedido.
//
// Também cobre a preservação do ciclo de vida (realizada_pendente / concluida), que é
// a regressão mais provável de qualquer mexida nessa regra.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).href;

process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_KEY = "test";

// Linha atual e captura do update. Trocadas a cada teste.
let linhaAtual = null;
let updateRecebido = null;

// Stub encadeável do supabase-js, só com o que o atualizarViagem usa:
//   .from(t).select(c).eq(k,v).single()
//   .from(t).update(campos).eq(k,v).select(c).single()
const supabase = {
  from() {
    const encadeado = {
      select: () => encadeado,
      eq: () => encadeado,
      single: async () => ({ data: linhaAtual, error: null }),
      update(campos) {
        updateRecebido = campos;
        return encadeado;
      },
    };
    return encadeado;
  },
};

mock.module(`${SRC}supabaseClient.js`, { namedExports: { supabase } });

const { atualizarViagem } = await import(`${SRC}services/viagens.js`);

const COMPLETA = {
  id: 1, empresa: "Rohan", cliente_id: 3, motorista_id: 1, caminhao_id: 2,
  valor_frete: 900, valor_motorista: 300,
};

async function statusApos(statusAtual, campos = {}) {
  linhaAtual = { ...COMPLETA, status: statusAtual };
  updateRecebido = null;
  await atualizarViagem(1, campos);
  return updateRecebido.status;
}

test("editar uma viagem cancelada NÃO a ressuscita", async () => {
  assert.equal(await statusApos("cancelada", { valor_frete: 950 }), "cancelada");
});

test("descancelar continua possível quando o status vem explícito", async () => {
  linhaAtual = { ...COMPLETA, status: "cancelada" };
  updateRecebido = null;
  await atualizarViagem(1, { status: "confirmada" });
  assert.equal(updateRecebido.status, "confirmada");
});

test("concluida sobrevive a uma edição que mantém os valores", async () => {
  assert.equal(await statusApos("concluida", { observacoes: "nota" }), "concluida");
});

test("concluida cai para realizada_pendente se um valor é apagado", async () => {
  assert.equal(await statusApos("concluida", { valor_motorista: null }), "realizada_pendente");
});

test("realizada_pendente vira concluida quando os valores são preenchidos", async () => {
  assert.equal(await statusApos("realizada_pendente", { valor_motorista: 300 }), "concluida");
});

test("confirmada perde o valor e vira confirmada_sem_valor", async () => {
  assert.equal(await statusApos("confirmada", { valor_frete: null }), "confirmada_sem_valor");
});

test("faltando um dado básico volta a rascunho", async () => {
  assert.equal(await statusApos("confirmada", { motorista_id: null }), "rascunho");
});

// FIX #15 — o status precisa considerar a data. Lançar hoje uma viagem que já aconteceu
// não pode marcá-la como "confirmada" (= agendada, vai acontecer) e esperar o cron da
// meia-noite arrumar.
const { statusParaViagem } = await import(`${SRC}services/viagens.js`);

const ONTEM = "2020-01-01";
const FUTURO = "2999-12-31";

test("viagem passada e completa já nasce concluida", () => {
  assert.equal(
    statusParaViagem({ ...COMPLETA, data: ONTEM }),
    "concluida",
  );
});

test("viagem passada sem valores nasce realizada_pendente", () => {
  assert.equal(
    statusParaViagem({ ...COMPLETA, data: ONTEM, valor_frete: null, valor_motorista: null }),
    "realizada_pendente",
  );
});

test("viagem futura continua confirmada", () => {
  assert.equal(statusParaViagem({ ...COMPLETA, data: FUTURO }), "confirmada");
});

test("viagem incompleta continua rascunho, mesmo no passado", () => {
  assert.equal(
    statusParaViagem({ ...COMPLETA, data: ONTEM, motorista_id: null }),
    "rascunho",
  );
});

test("sem data não aplica a regra de data", () => {
  assert.equal(statusParaViagem({ ...COMPLETA, data: null }), "confirmada");
});

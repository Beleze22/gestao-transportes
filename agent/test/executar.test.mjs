// FIX #13 ponta a ponta em executar(): a conferência roda antes de gravar, e os campos
// de conferência NÃO podem chegar ao insert — eles não são colunas, e se vazassem toda
// gravação quebraria em produção.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).href;

process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_KEY = "test";

const gravado = [];

mock.module(`${SRC}services/catalogo.js`, {
  namedExports: {
    listarClientes:   async () => [{ id: 3, nome: "PROJETECH" }],
    listarMotoristas: async () => [
      { id: 1, nome: "GEOVANE", apelidos: ["bebeto"] },
      { id: 12, nome: "CARLOS", apelidos: [] },
    ],
    listarCaminhoes:  async () => [{ id: 2, placa: "PGB-9E80" }],
    listarCategorias: async () => [{ id: 1, categoria: "DIESEL" }],
    registrarDespesa: async (d) => { gravado.push(["despesa", d]); return { id: 80, ...d }; },
    registrarApelidoMotorista: async (apelido, motorista_id) => {
      gravado.push(["apelido", { apelido, motorista_id }]);
      return { apelido, motorista_id };
    },
  },
});

mock.module(`${SRC}services/viagens.js`, {
  namedExports: {
    criarViagemRascunho: async (d) => { gravado.push(["viagem", d]); return { id: 500, ...d }; },
    atualizarViagem: async (id, campos) => { gravado.push(["update", { id, ...campos }]); return { id, ...campos }; },
    consultarViagens: async () => [],
  },
});

const { executar } = await import(`${SRC}tools.js`);

test("criar_viagem_rascunho grava sem os campos de conferência", async () => {
  gravado.length = 0;
  await executar("criar_viagem_rascunho", {
    data: "2026-09-10", empresa: "Rohan",
    cliente_id: 3, cliente_nome: "PROJETECH",
    motorista_id: 1, motorista_nome: "BEBETO",
    caminhao_id: 2, caminhao_placa: "PGB-9E80",
    valor_frete: 900,
  });

  const [, payload] = gravado[0];
  for (const campo of ["cliente_nome", "motorista_nome", "caminhao_placa"]) {
    assert.ok(!(campo in payload), `${campo} não pode chegar ao insert — não é coluna`);
  }
  assert.equal(payload.motorista_id, 1);
  assert.equal(payload.valor_frete, 900);
});

test("atualizar_viagem também limpa o payload e preserva o id", async () => {
  gravado.length = 0;
  await executar("atualizar_viagem", {
    id: "500", motorista_id: 12, motorista_nome: "CARLOS", valor_motorista: 150,
  });

  const [, payload] = gravado[0];
  assert.equal(payload.id, "500");
  assert.ok(!("motorista_nome" in payload));
  assert.equal(payload.valor_motorista, 150);
});

test("registrar_despesa exige e confere categoria_nome", async () => {
  gravado.length = 0;
  await executar("registrar_despesa", {
    empresa: "Rohan", data: "2026-09-10", categoria: 1, categoria_nome: "DIESEL", valor: 300,
  });
  assert.ok(!("categoria_nome" in gravado[0][1]));

  await assert.rejects(
    () => executar("registrar_despesa", {
      empresa: "Rohan", data: "2026-09-10", categoria: 1, valor: 300,
    }),
    /sem "categoria_nome"/,
  );
});

test("executar bloqueia a gravação quando o ID não bate com o nome", async () => {
  gravado.length = 0;
  await assert.rejects(
    () => executar("criar_viagem_rascunho", {
      data: "2026-09-10", motorista_id: 12, motorista_nome: "BEBETO",
    }),
    /motorista_id=12 é CARLOS/,
  );
  assert.equal(gravado.length, 0, "nada pode ter sido gravado");
});

test("apelido só é associado se o nome bater com o ID", async () => {
  gravado.length = 0;
  await executar("registrar_apelido_motorista", {
    apelido: "nego", motorista_id: 1, motorista_nome: "GEOVANE",
  });
  assert.deepEqual(gravado[0], ["apelido", { apelido: "nego", motorista_id: 1 }]);

  // Associar o apelido ao motorista errado envenena toda resolução futura de nome.
  await assert.rejects(
    () => executar("registrar_apelido_motorista", {
      apelido: "nego", motorista_id: 12, motorista_nome: "GEOVANE",
    }),
    /motorista_id=12 é CARLOS/,
  );
  assert.equal(gravado.length, 1, "a associação errada não pode ter sido gravada");
});

test("ferramenta sem referência não é afetada", async () => {
  assert.deepEqual(await executar("consultar_viagens", { empresa: "Rohan" }), []);
});

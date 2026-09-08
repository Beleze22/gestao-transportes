// FIX #13 — a conferência nome↔ID é estrutural (campo da ferramenta) e falha FECHADA.
// A versão anterior extraía o nome do resumo em texto livre com regex; como o prompt
// nunca exigiu aquele formato, ela quase nunca casava e passava reto em silêncio.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).href;

process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_KEY = "test";

mock.module(`${SRC}services/catalogo.js`, {
  namedExports: {
    listarClientes:   async () => [{ id: 3, nome: "PROJETECH" }, { id: 5, nome: "MW" }],
    listarMotoristas: async () => [
      { id: 1,  nome: "GEOVANE", apelidos: ["bebeto"] },
      { id: 12, nome: "CARLOS",  apelidos: [] },
    ],
    listarCaminhoes:  async () => [{ id: 2, placa: "PGB-9E80" }],
    listarCategorias: async () => [{ id: 1, categoria: "DIESEL" }, { id: 4, categoria: "PEDÁGIO" }],
  },
});

const { conferirReferencias, semCamposDeConferencia } =
  await import(`${SRC}services/referencias.js`);

test("ID e nome coerentes passam", async () => {
  await conferirReferencias({
    cliente_id: 3,   cliente_nome: "PROJETECH",
    motorista_id: 1, motorista_nome: "GEOVANE",
    caminhao_id: 2,  caminhao_placa: "PGB-9E80",
  });
});

test("apelido conta como nome válido do motorista", async () => {
  await conferirReferencias({ motorista_id: 1, motorista_nome: "Bebeto" });
});

test("placa é comparada sem hífen e sem caixa", async () => {
  await conferirReferencias({ caminhao_id: 2, caminhao_placa: "pgb9e80" });
});

test("acento não impede a correspondência da categoria", async () => {
  await conferirReferencias({ categoria: 4, categoria_nome: "pedagio" });
});

test("ID válido apontando para OUTRO registro é recusado", async () => {
  // O erro caro: o modelo diz BEBETO (=#1) mas manda o ID do CARLOS (=#12). Existe,
  // passa por chave estrangeira, e geraria pagamento para a pessoa errada.
  await assert.rejects(
    () => conferirReferencias({ motorista_id: 12, motorista_nome: "BEBETO" }),
    (err) => {
      assert.equal(err.recuperavel, true, "precisa ser recuperável para o modelo se corrigir");
      assert.match(err.message, /motorista_id=12 é CARLOS/);
      assert.match(err.message, /GEOVANE é o #1/, "deve apontar o ID correto");
      return true;
    },
  );
});

test("ID sem o campo de nome é recusado (falha fechada)", async () => {
  // Era exatamente aqui que a versão por regex passava reto sem log nenhum.
  await assert.rejects(
    () => conferirReferencias({ cliente_id: 3 }),
    (err) => {
      assert.match(err.message, /sem "cliente_nome"/);
      assert.equal(err.recuperavel, true);
      return true;
    },
  );
});

test("nome vazio conta como ausente", async () => {
  await assert.rejects(
    () => conferirReferencias({ cliente_id: 3, cliente_nome: "   " }),
    /sem "cliente_nome"/);
});

test("ID inexistente lista as opções válidas", async () => {
  await assert.rejects(
    () => conferirReferencias({ motorista_id: 99, motorista_nome: "QUEMQUER" }),
    /motorista_id=99 não existe.*GEOVANE \(apelidos: bebeto\)\(#1\)/s,
  );
});

test("campos ausentes não são conferidos", async () => {
  await conferirReferencias({ empresa: "Rohan", data: "2026-09-10" });
});

test("os campos de conferência não vazam para o insert", async () => {
  const limpo = semCamposDeConferencia({
    data: "2026-09-10", cliente_id: 3, cliente_nome: "PROJETECH",
    motorista_id: 1, motorista_nome: "GEOVANE",
    caminhao_id: 2, caminhao_placa: "PGB-9E80", categoria_nome: "DIESEL",
  });
  assert.deepEqual(Object.keys(limpo).sort(), ["caminhao_id", "cliente_id", "data", "motorista_id"]);
});

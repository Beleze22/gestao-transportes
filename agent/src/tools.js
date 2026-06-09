import * as viagensService from "./services/viagens.js";
import * as catalogo from "./services/catalogo.js";
import { detectarConflitos } from "./services/conflicts.js";

const dataParam = { type: "string", description: "Data no formato YYYY-MM-DD" };

export const definicoes = [
  // --- Leitura / catálogo ---
  {
    name: "listar_clientes",
    description: "Lista todos os clientes cadastrados (id e nome).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "listar_motoristas",
    description: "Lista todos os motoristas cadastrados (id e nome).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "listar_caminhoes",
    description: "Lista todos os caminhões cadastrados (id, placa e modelo).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "listar_categorias",
    description: "Lista as categorias de despesas cadastradas.",
    input_schema: { type: "object", properties: {} },
  },

  // --- Consultas ---
  {
    name: "consultar_viagens",
    description:
      "Busca viagens com filtros opcionais. Use para responder perguntas como 'quais clientes a transportadora X atendeu esse mês', 'viagens do motorista Y', etc.",
    input_schema: {
      type: "object",
      properties: {
        empresa: { type: "string", description: "'Rohan' ou 'TransBeleze'" },
        status: {
          type: "string",
          enum: ["rascunho", "confirmada", "confirmada_sem_valor", "realizada_pendente", "concluida", "cancelada"],
        },
        cliente_id: { type: "string" },
        motorista_id: { type: "string" },
        data_inicio: dataParam,
        data_fim: dataParam,
      },
    },
  },
  {
    name: "consultar_despesas",
    description: "Busca despesas registradas com filtros opcionais de empresa e período.",
    input_schema: {
      type: "object",
      properties: {
        empresa: { type: "string" },
        data_inicio: dataParam,
        data_fim: dataParam,
      },
    },
  },
  {
    name: "gerar_relatorio",
    description:
      "Gera relatório financeiro (faturamento, pagamentos a motoristas, despesas, lucro líquido) agregado por cliente, motorista e categoria. Use para perguntas como 'quanto a transportadora Y precisa pagar ao motorista Z no período A'.",
    input_schema: {
      type: "object",
      properties: {
        empresa: { type: "string" },
        data_inicio: dataParam,
        data_fim: dataParam,
      },
    },
  },

  // --- Escrita: viagens ---
  {
    name: "criar_viagem_rascunho",
    description:
      "Cadastra uma viagem na agenda, mesmo com dados incompletos (ex: 'possível frete para a empresa X no dia Y', ou até mesmo 'tenho um possível frete para o cliente X no dia Y' sem ainda saber qual empresa vai atender). O status é calculado automaticamente conforme os campos preenchidos — sem 'empresa' definida, a viagem fica como rascunho até ser atualizada.",
    input_schema: {
      type: "object",
      properties: {
        empresa: { type: "string", description: "'Rohan' ou 'TransBeleze' — opcional; pode ser definida depois com atualizar_viagem" },
        data: dataParam,
        cliente_id: { type: "string" },
        motorista_id: { type: "string" },
        caminhao_id: { type: "string" },
        valor_frete: { type: "number" },
        valor_motorista: { type: "number" },
        local_carregamento: { type: "string" },
        local_descarregamento: { type: "string" },
        horario_carregamento: { type: "string", description: "HH:MM" },
        horario_descarregamento: { type: "string", description: "HH:MM" },
        observacoes: { type: "string" },
      },
      required: ["data"],
    },
  },
  {
    name: "atualizar_viagem",
    description:
      "Atualiza campos de uma viagem existente (preencher motorista/caminhão/valores de um rascunho, corrigir dados, definir valor de viagem realizada, cancelar, etc). O status é recalculado automaticamente, a menos que seja informado explicitamente.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID da viagem a atualizar" },
        empresa: { type: "string" },
        data: dataParam,
        cliente_id: { type: "string" },
        motorista_id: { type: "string" },
        caminhao_id: { type: "string" },
        valor_frete: { type: "number" },
        valor_motorista: { type: "number" },
        local_carregamento: { type: "string" },
        local_descarregamento: { type: "string" },
        horario_carregamento: { type: "string", description: "HH:MM" },
        horario_descarregamento: { type: "string", description: "HH:MM" },
        observacoes: { type: "string" },
        status: {
          type: "string",
          enum: ["rascunho", "confirmada", "confirmada_sem_valor", "realizada_pendente", "concluida", "cancelada"],
        },
      },
      required: ["id"],
    },
  },
  {
    name: "verificar_conflito_agenda",
    description:
      "Verifica se já existe outra viagem confirmada no mesmo dia para o motorista e/ou caminhão informados. Use ANTES de confirmar uma viagem com motorista/caminhão definidos para avisar o usuário sobre possíveis conflitos.",
    input_schema: {
      type: "object",
      properties: {
        data: dataParam,
        motorista_id: { type: "string" },
        caminhao_id: { type: "string" },
        ignorar_id: { type: "string", description: "ID da própria viagem, para ignorar ao editar" },
      },
      required: ["data"],
    },
  },

  // --- Escrita: despesas e cadastros ---
  {
    name: "registrar_despesa",
    description: "Registra uma nova despesa.",
    input_schema: {
      type: "object",
      properties: {
        empresa: { type: "string" },
        data: dataParam,
        categoria: { type: "string", description: "ID da categoria de despesa" },
        descricao: { type: "string" },
        valor: { type: "number" },
      },
      required: ["empresa", "data", "categoria", "valor"],
    },
  },
  {
    name: "adicionar_cliente",
    description: "Cadastra um novo cliente.",
    input_schema: {
      type: "object",
      properties: { nome: { type: "string" } },
      required: ["nome"],
    },
  },
  {
    name: "adicionar_motorista",
    description: "Cadastra um novo motorista. Só use depois de confirmar com o usuário que não se trata de apelido de alguém já cadastrado.",
    input_schema: {
      type: "object",
      properties: { nome: { type: "string" } },
      required: ["nome"],
    },
  },
  {
    name: "registrar_apelido_motorista",
    description:
      "Salva um apelido como referência a um motorista já cadastrado, para reconhecer automaticamente esse apelido em conversas futuras. Use depois que o usuário confirmar que um nome mencionado é apelido de um motorista existente (retornado por listar_motoristas, campo 'apelidos').",
    input_schema: {
      type: "object",
      properties: {
        apelido: { type: "string", description: "O apelido mencionado pelo usuário" },
        motorista_id: { type: "string", description: "ID do motorista já cadastrado a quem esse apelido se refere" },
      },
      required: ["apelido", "motorista_id"],
    },
  },
  {
    name: "adicionar_caminhao",
    description: "Cadastra um novo caminhão.",
    input_schema: {
      type: "object",
      properties: { placa: { type: "string" }, modelo: { type: "string" } },
      required: ["placa"],
    },
  },
  {
    name: "adicionar_categoria",
    description: "Cadastra uma nova categoria de despesa.",
    input_schema: {
      type: "object",
      properties: { categoria: { type: "string" } },
      required: ["categoria"],
    },
  },
];

export async function executar(nome, input) {
  switch (nome) {
    case "listar_clientes":
      return catalogo.listarClientes();
    case "listar_motoristas":
      return catalogo.listarMotoristas();
    case "listar_caminhoes":
      return catalogo.listarCaminhoes();
    case "listar_categorias":
      return catalogo.listarCategorias();

    case "consultar_viagens":
      return viagensService.consultarViagens(input);
    case "consultar_despesas":
      return catalogo.consultarDespesas(input);
    case "gerar_relatorio":
      return catalogo.gerarRelatorio(input);

    case "criar_viagem_rascunho":
      return viagensService.criarViagemRascunho(input);
    case "atualizar_viagem":
      return viagensService.atualizarViagem(input.id, omitir(input, "id"));
    case "verificar_conflito_agenda":
      return detectarConflitos(input);

    case "registrar_despesa":
      return catalogo.registrarDespesa(input);
    case "adicionar_cliente":
      return catalogo.adicionarCliente(input.nome);
    case "adicionar_motorista":
      return catalogo.adicionarMotorista(input.nome);
    case "registrar_apelido_motorista":
      return catalogo.registrarApelidoMotorista(input.apelido, input.motorista_id);
    case "adicionar_caminhao":
      return catalogo.adicionarCaminhao(input.placa, input.modelo);
    case "adicionar_categoria":
      return catalogo.adicionarCategoria(input.categoria);

    default:
      throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}

function omitir(obj, chave) {
  const { [chave]: _omitido, ...resto } = obj;
  return resto;
}

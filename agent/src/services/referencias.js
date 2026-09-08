import { ReferenciaInvalidaError } from "../erros.js";
import {
  listarClientes,
  listarMotoristas,
  listarCaminhoes,
  listarCategorias,
} from "./catalogo.js";

// Conferência de referências por ID.
//
// Um ID inventado que por acaso existe passa por qualquer checagem de existência: o
// Postgres só rejeita chave estrangeira inexistente, não "existe mas é outra pessoa".
// Esse é o erro caro — lançar um frete no motorista errado gera pagamento errado.
//
// A versão anterior tentava pegar isso lendo o nome que o modelo tinha escrito no
// resumo em texto livre ("Motorista: **BEBETO**") com uma regex. O prompt nunca exigiu
// esse formato, então a regex quase nunca casava e a checagem passava reto em silêncio.
//
// Agora o nome é um parâmetro da própria ferramenta: o modelo declara ID e nome, e o
// código confere os dois contra o banco. Não depende de formatação, e a ausência do
// campo é erro — a conferência falha fechada.

// Remove acentos e caixa para comparar nomes digitados/transcritos.
export function normalizar(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

const REFERENCIAS = {
  cliente_id: {
    campoNome: "cliente_nome",
    rotulo: "cliente",
    listar: listarClientes,
    exibir: (r) => r.nome,
    bate: (r, alvo) => normalizar(r.nome) === alvo,
  },
  motorista_id: {
    campoNome: "motorista_nome",
    rotulo: "motorista",
    listar: listarMotoristas,
    exibir: (r) => r.nome,
    // Apelidos contam como nome válido — é assim que "nego" resolve para o cadastro.
    bate: (r, alvo) =>
      normalizar(r.nome) === alvo || (r.apelidos ?? []).some((a) => normalizar(a) === alvo),
    exibirOpcao: (r) =>
      r.apelidos?.length ? `${r.nome} (apelidos: ${r.apelidos.join(", ")})` : r.nome,
  },
  caminhao_id: {
    campoNome: "caminhao_placa",
    rotulo: "caminhão",
    listar: listarCaminhoes,
    exibir: (r) => r.placa,
    // Placa é comparada sem hífen: "PGB-9E80" e "PGB9E80" são a mesma.
    bate: (r, alvo) => normalizar(r.placa).replace(/-/g, "") === alvo.replace(/-/g, ""),
  },
  categoria: {
    campoNome: "categoria_nome",
    rotulo: "categoria de despesa",
    listar: listarCategorias,
    exibir: (r) => r.categoria,
    bate: (r, alvo) => normalizar(r.categoria) === alvo,
  },
};

// Campos que existem só para a conferência — não são colunas e precisam sair do
// payload antes do insert/update.
export const CAMPOS_DE_CONFERENCIA = Object.values(REFERENCIAS).map((r) => r.campoNome);

export function semCamposDeConferencia(dados) {
  const limpo = { ...dados };
  for (const campo of CAMPOS_DE_CONFERENCIA) delete limpo[campo];
  return limpo;
}

function opcoes(cfg, lista) {
  const exibir = cfg.exibirOpcao ?? cfg.exibir;
  return `Cadastrados: ${lista.map((r) => `${exibir(r)}(#${r.id})`).join(", ")}`;
}

// Lança ReferenciaInvalidaError (recuperável) com a lista de opções válidas, para o
// modelo se corrigir na mesma conversa em vez de abortar o pedido do usuário.
export async function conferirReferencias(dados) {
  const problemas = [];

  for (const [campoId, cfg] of Object.entries(REFERENCIAS)) {
    const id = dados?.[campoId];
    if (id == null) continue;

    const lista = await cfg.listar();
    const registro = lista.find((r) => r.id === Number(id));

    if (!registro) {
      problemas.push(`${campoId}=${id} não existe. ${opcoes(cfg, lista)}`);
      continue;
    }

    const declarado = dados[cfg.campoNome];
    if (declarado == null || String(declarado).trim() === "") {
      problemas.push(
        `${campoId}=${id} foi enviado sem "${cfg.campoNome}". Reenvie incluindo ` +
          `"${cfg.campoNome}" com o ${cfg.rotulo} exatamente como aparece na ferramenta de ` +
          `listagem — o sistema precisa conferir que o ID corresponde a quem você quis dizer.`,
      );
      continue;
    }

    if (cfg.bate(registro, normalizar(declarado))) continue;

    const pretendido = lista.find((r) => cfg.bate(r, normalizar(declarado)));
    problemas.push(
      `${campoId}=${id} é ${cfg.exibir(registro)}, mas você declarou ` +
        `${cfg.campoNome}="${declarado}". ` +
        (pretendido
          ? `${cfg.exibir(pretendido)} é o #${pretendido.id}. Corrija o ID (ou o nome, se ` +
            `foi o nome que saiu errado) e confirme com o usuário antes de gravar.`
          : `Nenhum ${cfg.rotulo} com esse nome está cadastrado. ${opcoes(cfg, lista)}`),
    );
  }

  if (problemas.length) throw new ReferenciaInvalidaError(problemas.join(" | "));
}

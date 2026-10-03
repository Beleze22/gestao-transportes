import { dataBR, dataCurta } from "@/lib/formato";
import { hojeISO } from "@/lib/campos";

// Regras DERIVADAS de ordem de pagamento. Nada aqui grava nem valida: quem recusa uma
// operação é o banco, pelas triggers da migration 005/006, com SQLSTATE TRV01 e mensagem
// pronta para a tela. Estas funções existem para a interface mostrar a situação certa e
// não oferecer um botão que o banco vai recusar.
//
// Por isso este arquivo NÃO tem par no agente, ao contrário de lib/viagem.js: o agente não
// lê situação financeira. O que vale para os dois lados está no banco, que é o único ponto
// que a chave secreta não contorna.

export const EMPRESAS = ["Rohan", "TransBeleze"];

// Os dois status operacionais que o banco aceita numa ordem. Espelha a trigger
// `trv_viagem_em_ordem` — se mudar lá, muda aqui, e o teste de verdade é o
// docs/specs/02-ordens-testes.sql.
const STATUS_ELEGIVEL = new Set(["concluida", "realizada_pendente"]);

export function elegivelParaOrdem(viagem) {
  return (
    STATUS_ELEGIVEL.has(viagem.status) &&
    Boolean(viagem.empresa) &&
    viagem.valor_frete != null
  );
}

export const ehDoLegado = (viagem, inicioControle) =>
  Boolean(inicioControle) && viagem.data < inicioControle;

export const SITUACAO = {
  A_FATURAR: "a_faturar",
  LEGADO_A_CONFERIR: "legado_a_conferir",
  QUITADA_NO_LEGADO: "quitada_no_legado",
  EM_ORDEM_ABERTA: "em_ordem_aberta",
  FATURADA: "faturada",
  RECEBIDA: "recebida",
};

// A situação financeira da viagem, para a coluna do Painel. `ordem` é a ordem dela (ou
// null), e vem de quem chama — assim esta função não precisa conhecer a lista inteira.
//
// Devolve null para viagem que não pode ser faturada (rascunho, cancelada, sem valor):
// "a faturar" seria mentira, porque ela não aparece em A faturar enquanto estiver assim.
// A tabela mostra "—" nesse caso.
export function situacaoFinanceira(viagem, ordem, inicioControle) {
  if (!viagem.ordem_id) {
    if (!elegivelParaOrdem(viagem)) return null;
    return ehDoLegado(viagem, inicioControle)
      ? { chave: SITUACAO.LEGADO_A_CONFERIR, rotulo: "Legado a conferir" }
      : { chave: SITUACAO.A_FATURAR, rotulo: "A faturar" };
  }

  // Viagem com ordem_id mas sem a ordem carregada: não invente situação.
  if (!ordem) return null;

  if (ordem.legado) {
    return { chave: SITUACAO.QUITADA_NO_LEGADO, rotulo: "Quitada no legado" };
  }
  if (ordem.status === "aberta") {
    return { chave: SITUACAO.EM_ORDEM_ABERTA, rotulo: `Em ordem aberta #${ordem.id}` };
  }
  if (ordem.status === "fechada") {
    return { chave: SITUACAO.FATURADA, rotulo: `Faturada #${ordem.id}` };
  }
  return { chave: SITUACAO.RECEBIDA, rotulo: `Recebida #${ordem.id}` };
}

// Ordem fechada cujo vencimento passou. Aberta não vence (não foi enviada ao cliente) e
// recebida não vence mais (o dinheiro entrou).
export function estaVencida(ordem, hoje = hojeISO()) {
  return ordem.status === "fechada" && Boolean(ordem.vencimento) && ordem.vencimento < hoje;
}

export function diasDeAtraso(ordem, hoje = hojeISO()) {
  if (!estaVencida(ordem, hoje)) return 0;
  const umDia = 24 * 60 * 60 * 1000;
  return Math.round(
    (new Date(`${hoje}T12:00:00`) - new Date(`${ordem.vencimento}T12:00:00`)) / umDia,
  );
}

// O texto da etiqueta de situação, que é o que a pessoa lê na lista. A cor sai de
// EtiquetaSituacao; aqui só o texto, porque cor nunca é a única informação (design.md).
export function rotuloSituacao(ordem, hoje = hojeISO()) {
  if (ordem.legado) return "Quitação de legado";
  if (ordem.status === "aberta") return "Aberta";
  if (ordem.status === "recebida") {
    return ordem.recebida_em ? `Recebida em ${dataCurta(ordem.recebida_em)}` : "Recebida";
  }
  if (estaVencida(ordem, hoje)) {
    const dias = diasDeAtraso(ordem, hoje);
    return dias === 1 ? "Vencida há 1 dia" : `Vencida há ${dias} dias`;
  }
  return "Fechada";
}

// Como a nota aparece na lista de ordens: "Rohan, nº 431", "TransBeleze", "Sem nota".
export function rotuloNota(ordem) {
  if (!ordem.com_nota) return "Sem nota";
  const partes = [ordem.empresa_nota, ordem.numero_nota && `nº ${ordem.numero_nota}`];
  return partes.filter(Boolean).join(", ") || "Com nota";
}

// Soma de frete por empresa. O total de uma ordem nunca é gravado — é sempre esta soma,
// e a view `ordens_resumo` faz a mesma conta no banco para as listas.
export function totaisPorEmpresa(viagens) {
  const t = { Rohan: 0, TransBeleze: 0, total: 0 };
  for (const v of viagens) {
    const valor = v.valor_frete || 0;
    if (v.empresa === "Rohan" || v.empresa === "TransBeleze") t[v.empresa] += valor;
    t.total += valor;
  }
  return t;
}

// Agrupa viagens por cliente, para as telas A faturar e Legado — as duas são a mesma
// estrutura no protótipo: um cartão por cliente, com total e divisão por empresa.
export function agruparPorCliente(viagens) {
  const porCliente = new Map();
  for (const v of viagens) {
    const id = v.cliente_id ?? 0;
    if (!porCliente.has(id)) {
      porCliente.set(id, { clienteId: id, nome: v.clientes?.nome ?? "Sem cliente", viagens: [] });
    }
    porCliente.get(id).viagens.push(v);
  }
  return [...porCliente.values()]
    .map((g) => ({ ...g, totais: totaisPorEmpresa(g.viagens) }))
    .sort((a, b) => b.totais.total - a.totais.total);
}

// Texto do aviso de reabertura. A nota já emitida é o ponto: ela saiu fora do sistema e
// vai precisar de correção manual, então o aviso cita o número.
export function avisoDeReabertura(ordem) {
  if (ordem.com_nota && ordem.numero_nota) {
    return `Reabrir devolve a ordem para aberta e pede um motivo. A nota nº ${ordem.numero_nota}, já emitida, terá de ser corrigida fora do sistema.`;
  }
  return "Reabrir devolve a ordem para aberta e pede um motivo.";
}

// Para o detalhe da ordem: as datas que já aconteceram, em dd/mm/aaaa.
export function linhaDoTempo(ordem) {
  return [
    ["Enviada em", ordem.fechada_em ? dataBR(ordem.fechada_em) : "Não enviada"],
    ["Vencimento", dataBR(ordem.vencimento)],
    ["Recebida em", dataBR(ordem.recebida_em)],
  ];
}

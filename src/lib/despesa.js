import { texto, numero, hojeISO } from "./campos.js";

// Ponte entre o formulário de despesa e o banco. Mais simples que o de viagem: os
// nomes dos campos já batem com as colunas e não há regra de status — só tipagem.

// Função, e não constante: uma constante de módulo congelaria a data no momento em que
// o arquivo carrega. Uma aba deixada aberta durante a virada do dia continuaria
// oferecendo ontem, e o reset depois de salvar repetiria a data velha em quem lança
// várias despesas seguidas.
//
// 65% das despesas são lançadas no mesmo dia em que acontecem — hoje é o palpite certo
// com folga, e é o mesmo que o agente do Telegram já assume para despesa sem data.
export function despesaVazia() {
  return {
    empresa: "",
    data: hojeISO(),
    categoria: "",
    descricao: "",
    valor: "",
  };
}

export function linhaParaFormularioDespesa(row) {
  return {
    empresa: texto(row.empresa),
    data: texto(row.data),
    // O Select compara por identidade de string (value={String(c.id)}); sem o String()
    // ele abre em branco mesmo com a categoria preenchida.
    categoria: row.categoria != null ? String(row.categoria) : "",
    descricao: texto(row.descricao),
    valor: row.valor != null ? String(row.valor) : "",
  };
}

export function formularioParaPayloadDespesa(form) {
  return {
    empresa: form.empresa,
    data: form.data,
    categoria: numero(form.categoria),
    descricao: form.descricao || null,
    valor: numero(form.valor),
  };
}

export function validarDespesa(form) {
  if (!form.empresa || !form.data || !form.categoria) {
    throw new Error("Preencha os campos obrigatórios.");
  }
  if (numero(form.valor) == null) {
    throw new Error("Informe o valor da despesa.");
  }
}

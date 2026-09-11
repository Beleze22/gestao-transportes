import { texto, numero } from "./campos.js";

// Ponte entre o formulário de despesa e o banco. Mais simples que o de viagem: os
// nomes dos campos já batem com as colunas e não há regra de status — só tipagem.

export const DESPESA_VAZIA = {
  empresa: "",
  data: "",
  categoria: "",
  descricao: "",
  valor: "",
};

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

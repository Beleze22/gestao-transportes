import { texto, numero, horaCurta, hojeISO } from "./campos.js";

// Ponte entre o formulário e o banco, mais a regra de status.
//
// O ViagemForm usa camelCase e guarda tudo como string; a tabela usa snake_case e
// tipos reais. Essa conversão vivia embutida no handleSalvarViagem. Foi extraída
// porque o caminho de edição precisa exatamente da mesma tradução — e duas cópias
// da mesma regra divergem com o tempo (foi o que aconteceu no agente, FIX #7/#12).

export const VIAGEM_VAZIA = {
  empresa: "",
  data: "",
  cliente_id: "",
  motorista_id: "",
  caminhao_id: "",
  valorFrete: "",
  valorMotorista: "",
  localCarregamento: "",
  horarioCarregamento: "",
  localDescarregamento: "",
  horarioDescarregamento: "",
  observacoes: "",
};

// Linha do banco -> estado do formulário. Tudo sai como string: um null num input
// controlado faz o React trocar o campo para não-controlado no meio da vida dele.
export function linhaParaFormulario(row) {
  return {
    empresa: texto(row.empresa),
    data: texto(row.data),
    // Os Select comparam por identidade de string (value={String(c.id)}); sem o
    // String() aqui eles abrem em branco mesmo com o registro preenchido.
    cliente_id: row.cliente_id != null ? String(row.cliente_id) : "",
    motorista_id: row.motorista_id != null ? String(row.motorista_id) : "",
    caminhao_id: row.caminhao_id != null ? String(row.caminhao_id) : "",
    valorFrete: row.valor_frete != null ? String(row.valor_frete) : "",
    valorMotorista: row.valor_motorista != null ? String(row.valor_motorista) : "",
    localCarregamento: texto(row.local_carregamento),
    horarioCarregamento: horaCurta(row.horario_carregamento),
    localDescarregamento: texto(row.local_descarregamento),
    horarioDescarregamento: horaCurta(row.horario_descarregamento),
    observacoes: texto(row.observacoes),
  };
}

// Estado do formulário -> colunas. Sem `id` e sem `status`: o status é decisão de
// quem chama (criar usa statusPorCompletude, editar usa statusAposEdicao).
export function formularioParaPayload(form) {
  return {
    empresa: form.empresa || null,
    data: form.data,
    cliente_id: numero(form.cliente_id),
    motorista_id: numero(form.motorista_id),
    caminhao_id: numero(form.caminhao_id),
    valor_frete: numero(form.valorFrete),
    valor_motorista: numero(form.valorMotorista),
    local_carregamento: form.localCarregamento || null,
    horario_carregamento: form.horarioCarregamento || null,
    local_descarregamento: form.localDescarregamento || null,
    horario_descarregamento: form.horarioDescarregamento || null,
    observacoes: form.observacoes || null,
  };
}

// Espelha agent/src/services/viagens.js — a mesma regra dos dois lados.
export function statusPorCompletude(p) {
  const temBasico = p.empresa && p.cliente_id && p.motorista_id && p.caminhao_id;
  const temValores = p.valor_frete != null && p.valor_motorista != null;
  if (!temBasico) return "rascunho";
  if (!temValores) return "confirmada_sem_valor";
  return "confirmada";
}

// Status considerando também a data. statusPorCompletude é cego a ela: uma viagem
// completa vira "confirmada", que significa "agendada, vai acontecer". Para uma viagem
// lançada depois do fato — o caso normal de quem registra o dia no fim do expediente —
// isso está errado, e só era corrigido pelo cron `marcarRealizadasPendentes` na
// meia-noite seguinte. Aqui a mesma regra é aplicada na hora.
export function statusParaViagem(payload, hoje = hojeISO()) {
  const base = statusPorCompletude(payload);
  if (base === "rascunho") return base;          // incompleta continua rascunho
  if (!payload.data || payload.data >= hoje) return base; // hoje ou futura: agendada
  return base === "confirmada" ? "concluida" : "realizada_pendente";
}

// Status depois de uma edição, preservando o ciclo de vida.
//
// A guarda de "cancelada" NÃO existe no agente: lá, editar uma viagem cancelada cai
// no statusPorCompletude e a ressuscita para "confirmada", devolvendo-a a todos os
// totais financeiros. Aqui a edição nunca descancela — para reativar existe uma ação
// própria e explícita.
export function statusAposEdicao(statusAtual, payload) {
  if (statusAtual === "cancelada") return "cancelada";

  if (statusAtual === "realizada_pendente" || statusAtual === "concluida") {
    return payload.valor_frete != null && payload.valor_motorista != null
      ? "concluida"
      : "realizada_pendente";
  }

  return statusParaViagem(payload);
}

export function validarViagem(form) {
  if (!form.empresa || !form.cliente_id || !form.motorista_id || !form.caminhao_id) {
    throw new Error("Preencha todos os campos obrigatórios.");
  }
  if (!form.data) throw new Error("Informe a data da viagem.");
}

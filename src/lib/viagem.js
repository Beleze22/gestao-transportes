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

// O Postgres devolve colunas `time` como "09:00:00". Um <input type="time"> com o
// step padrão recusa o componente de segundos e renderiza VAZIO — o horário salvo
// sumiria da tela e seria apagado na primeira gravação.
const horaCurta = (t) => (t ? String(t).slice(0, 5) : "");

const texto = (v) => (v == null ? "" : String(v));

// Número a partir do campo de texto. O teste explícito contra "" existe porque
// existem viagens com valor 0 no banco (ex: #75 tem frete e pagamento zerados) e
// um teste de veracidade transformaria esse 0 legítimo em null.
function numero(v) {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

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

  return statusPorCompletude(payload);
}

export function validarViagem(form) {
  if (!form.empresa || !form.cliente_id || !form.motorista_id || !form.caminhao_id) {
    throw new Error("Preencha todos os campos obrigatórios.");
  }
  if (!form.data) throw new Error("Informe a data da viagem.");
}

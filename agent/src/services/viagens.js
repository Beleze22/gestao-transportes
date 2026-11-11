import { supabase } from "../supabaseClient.js";
import { hojeISO } from "../datas.js";

// [FIX #13] A validação das referências (o ID existe? aponta para quem o modelo
// declarou?) vive em services/referencias.js e roda em tools.js/executar, antes de
// qualquer escrita. Ficava duplicada aqui — duas cópias da mesma regra divergem com
// o tempo, e o banco já tem foreign key em cliente_id, motorista_id e caminhao_id.

const SELECT_COMPLETO = `
  id, empresa, data, status, valor_frete, valor_motorista,
  local_carregamento, local_descarregamento,
  horario_carregamento, horario_descarregamento, observacoes,
  cliente_id, motorista_id, caminhao_id,
  clientes(id, nome), motoristas(id, nome), caminhoes(id, placa, modelo)
`;

function statusPorCompletude(v) {
  const temDadosBasicos = v.empresa && v.cliente_id && v.motorista_id && v.caminhao_id;
  const temValores = v.valor_frete != null && v.valor_motorista != null;
  if (!temDadosBasicos) return "rascunho";
  if (!temValores) return "confirmada_sem_valor";
  return "confirmada";
}

// [FIX #15] Status considerando também a data. statusPorCompletude é cego a ela: uma
// viagem completa vira "confirmada", que significa "agendada, vai acontecer". Quando o
// lançamento é feito depois do fato — o caso normal de quem registra o dia no fim do
// expediente — isso ficaria errado até a virada do dia ser tratada pela tarefa agendada
// no banco (marcar_viagens_realizadas, migration 008). Aqui a mesma regra é aplicada na
// hora da gravação.
export function statusParaViagem(v) {
  const base = statusPorCompletude(v);
  if (base === "rascunho") return base;             // incompleta continua rascunho
  if (!v.data || v.data >= hojeISO()) return base;  // hoje ou futura: agendada
  return base === "confirmada" ? "concluida" : "realizada_pendente";
}

export async function criarViagemRascunho(dados) {
  const status = statusParaViagem(dados);
  const { data, error } = await supabase
    .from("viagens")
    .insert({ ...dados, status })
    .select(SELECT_COMPLETO)
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarViagem(id, campos) {
  const { data: atual, error: errAtual } = await supabase
    .from("viagens")
    .select("*")
    .eq("id", id)
    .single();
  if (errAtual) throw errAtual;

  const mesclado = { ...atual, ...campos };
  if (!campos.status) {
    // [FIX #14] "cancelada" precisa estar aqui: sem a guarda, editar uma viagem
    // cancelada caía no statusPorCompletude e a ressuscitava para "confirmada",
    // devolvendo-a a todos os totais financeiros sem ninguém pedir. Para descancelar,
    // o status tem que vir explícito em `campos`.
    mesclado.status =
      atual.status === "cancelada"
        ? "cancelada"
        : atual.status === "realizada_pendente" || atual.status === "concluida"
          ? mesclado.valor_frete != null && mesclado.valor_motorista != null
            ? "concluida"
            : "realizada_pendente"
          : statusParaViagem(mesclado);
  }

  const { data, error } = await supabase
    .from("viagens")
    .update({ ...campos, status: mesclado.status })
    .eq("id", id)
    .select(SELECT_COMPLETO)
    .single();
  if (error) throw error;
  return data;
}

export async function consultarViagens(filtros = {}) {
  let query = supabase.from("viagens").select(SELECT_COMPLETO);

  if (filtros.empresa) query = query.eq("empresa", filtros.empresa);
  if (filtros.status) query = query.eq("status", filtros.status);
  if (filtros.cliente_id) query = query.eq("cliente_id", filtros.cliente_id);
  if (filtros.motorista_id) query = query.eq("motorista_id", filtros.motorista_id);
  if (filtros.data_inicio) query = query.gte("data", filtros.data_inicio);
  if (filtros.data_fim) query = query.lte("data", filtros.data_fim);

  query = query.order("data", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// [FIX #18] marcarRealizadasPendentes saiu daqui: a passagem diária do status é a função
// marcar_viagens_realizadas() no banco, agendada pelo pg_cron (migration 008).

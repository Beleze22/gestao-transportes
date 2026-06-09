import { supabase } from "../supabaseClient.js";

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

export async function criarViagemRascunho(dados) {
  const status = statusPorCompletude(dados);
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
    mesclado.status =
      atual.status === "realizada_pendente" || atual.status === "concluida"
        ? mesclado.valor_frete != null && mesclado.valor_motorista != null
          ? "concluida"
          : "realizada_pendente"
        : statusPorCompletude(mesclado);
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

export async function marcarRealizadasPendentes() {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("viagens")
    .update({ status: "realizada_pendente" })
    .eq("status", "confirmada")
    .lt("data", hoje)
    .select("id");
  if (error) throw error;
  return data;
}

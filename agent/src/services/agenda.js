import { supabase } from "../supabaseClient.js";
import { hojeISO } from "../datas.js";

const SELECT_DIGEST = `
  id, empresa, data, status, valor_frete, valor_motorista,
  local_carregamento, local_descarregamento,
  horario_carregamento, horario_descarregamento,
  clientes(nome), motoristas(nome), caminhoes(placa)
`;

export async function viagensDoDia(empresa) {
  let query = supabase
    .from("viagens")
    .select(SELECT_DIGEST)
    .eq("data", hojeISO(0))
    .in("status", ["confirmada", "confirmada_sem_valor", "rascunho"])
    .order("horario_carregamento", { ascending: true, nullsFirst: false });

  if (empresa) query = query.or(`empresa.eq.${empresa},empresa.is.null`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function rascunhosProximosDias(empresa, diasAntecedencia = 3) {
  let query = supabase
    .from("viagens")
    .select(SELECT_DIGEST)
    .eq("status", "rascunho")
    .gte("data", hojeISO(1))
    .lte("data", hojeISO(diasAntecedencia))
    .order("data", { ascending: true });

  if (empresa) query = query.or(`empresa.eq.${empresa},empresa.is.null`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function viagensComValorPendente(empresa) {
  let query = supabase
    .from("viagens")
    .select(SELECT_DIGEST)
    .in("status", ["realizada_pendente", "confirmada_sem_valor"])
    .or("valor_frete.is.null,valor_motorista.is.null")
    .order("data", { ascending: true });

  if (empresa) query = query.or(`empresa.eq.${empresa},empresa.is.null`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listarConfigNotificacoes() {
  const { data, error } = await supabase
    .from("config_notificacoes")
    .select("*")
    .eq("ativo", true);
  if (error) throw error;
  return data;
}

import { supabase } from "../supabaseClient.js";

export async function detectarConflitos({ data, motorista_id, caminhao_id, ignorar_id }) {
  if (!data || (!motorista_id && !caminhao_id)) return [];

  let query = supabase
    .from("viagens")
    .select("id, empresa, data, horario_carregamento, motorista_id, caminhao_id, motoristas(nome), caminhoes(placa)")
    .eq("data", data)
    .in("status", ["confirmada", "confirmada_sem_valor"]);

  if (ignorar_id) query = query.neq("id", ignorar_id);

  const { data: candidatas, error } = await query;
  if (error) throw error;

  return candidatas.filter(
    (v) =>
      (motorista_id && v.motorista_id === motorista_id) ||
      (caminhao_id && v.caminhao_id === caminhao_id)
  );
}

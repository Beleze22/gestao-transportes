import { supabase } from "../supabaseClient.js";

export async function detectarConflitos({ data, motorista_id, caminhao_id, ignorar_id }) {
  if (!data || (!motorista_id && !caminhao_id)) return [];

  // O banco retorna IDs como number, mas o modelo pode enviar string ("1").
  // Sem normalizar, "1" === 1 é false e o conflito nunca seria detectado.
  const motoristaId = motorista_id != null ? Number(motorista_id) : null;
  const caminhaoId = caminhao_id != null ? Number(caminhao_id) : null;

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
      (motoristaId != null && v.motorista_id === motoristaId) ||
      (caminhaoId != null && v.caminhao_id === caminhaoId)
  );
}

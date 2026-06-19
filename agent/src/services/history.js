import { supabase } from "../supabaseClient.js";

const LIMITE_CONTEXTO = 20;

export async function buscarHistorico(telefone) {
  const { data, error } = await supabase
    .from("conversas")
    .select("role, content")
    .eq("telefone", telefone)
    .order("created_at", { ascending: false })
    .limit(LIMITE_CONTEXTO);
  if (error) throw error;
  return data.reverse().map(({ role, content }) => ({ role, content }));
}

export async function registrarMensagem(telefone, role, content) {
  const { error } = await supabase.from("conversas").insert({ telefone, role, content });
  if (error) throw error;
  // Histórico completo mantido no banco para auditoria — sem truncamento.
}

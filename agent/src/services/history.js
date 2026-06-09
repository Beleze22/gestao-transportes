import { supabase } from "../supabaseClient.js";

const LIMITE_MENSAGENS = 20;

export async function buscarHistorico(telefone) {
  const { data, error } = await supabase
    .from("conversas")
    .select("role, content, created_at")
    .eq("telefone", telefone)
    .order("created_at", { ascending: true })
    .limit(LIMITE_MENSAGENS);
  if (error) throw error;
  return data.map(({ role, content }) => ({ role, content }));
}

export async function registrarMensagem(telefone, role, content) {
  const { error } = await supabase.from("conversas").insert({ telefone, role, content });
  if (error) throw error;
  await truncarHistorico(telefone);
}

async function truncarHistorico(telefone) {
  const { data, error } = await supabase
    .from("conversas")
    .select("id, created_at")
    .eq("telefone", telefone)
    .order("created_at", { ascending: false })
    .range(LIMITE_MENSAGENS, LIMITE_MENSAGENS + 50);
  if (error) throw error;
  if (!data.length) return;

  const idsAntigos = data.map((m) => m.id);
  await supabase.from("conversas").delete().in("id", idsAntigos);
}

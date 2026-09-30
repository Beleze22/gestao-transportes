import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// Esta é a chave publishable, e ela vai embutida no bundle — qualquer pessoa que abra o
// site a enxerga. Depois da migration 004 ela sozinha não abre nada: as seis tabelas só
// têm policy para o papel `authenticated`, então é a sessão do login que dá acesso.
//
// persistSession e autoRefreshToken são o padrão da biblioteca, escritos aqui porque o
// sistema depende deles: o primeiro guarda a sessão no localStorage (é o que faz a recarga
// da página não cair no login), o segundo renova o token antes de expirar. Se a renovação
// falhar, a lib emite SIGNED_OUT — e o portão de sessão devolve a tela de login em vez de
// deixar o app lendo listas vazias.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

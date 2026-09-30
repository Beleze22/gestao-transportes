import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Traduz o erro do Supabase Auth. As mensagens vêm em inglês e algumas são técnicas; o que
// aparece na tela precisa dizer o que fazer.
function mensagemDeErro(erro) {
  const texto = String(erro?.message ?? erro ?? "");

  if (/invalid login credentials/i.test(texto)) {
    return "E-mail ou senha incorretos.";
  }
  if (/email not confirmed/i.test(texto)) {
    return "Este usuário ainda não foi confirmado. Peça a confirmação ao administrador.";
  }
  if (/signups? not allowed|disabled/i.test(texto)) {
    return "Cadastro desabilitado. Peça um usuário ao administrador.";
  }
  if (/rate limit|too many/i.test(texto)) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  // Falha de rede não vem com mensagem útil ("Failed to fetch", "Load failed").
  if (/failed to fetch|load failed|network/i.test(texto)) {
    return "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";
  }
  return texto || "Não foi possível entrar. Tente de novo.";
}

// A sessão do Supabase Auth, com o estado que o portão precisa para decidir o que mostrar.
//
// `carregando` cobre a primeira leitura do localStorage: enquanto ela não termina não se
// sabe se há sessão, e mostrar o login nesse intervalo faria a tela piscar a cada recarga.
export default function useSessao() {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState(null);

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSessao(data?.session ?? null);
      setCarregando(false);
    });

    // O callback é deliberadamente síncrono. A biblioteca o executa segurando um lock
    // interno de autenticação: chamar dentro dele qualquer outra função async do
    // supabase-js (getSession, from().select()) trava esperando o próprio lock.
    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      if (!ativo) return;
      setSessao(novaSessao ?? null);
      setCarregando(false);
    });

    return () => {
      ativo = false;
      inscricao?.subscription?.unsubscribe();
    };
  }, []);

  // Devolve a mensagem de erro em português, ou null em caso de sucesso. Quem entra é o
  // onAuthStateChange: não dá para confiar no retorno daqui para trocar de tela, porque a
  // sessão também pode chegar por renovação de token, por outra aba ou pelo signOut.
  const entrar = async (email, senha) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    return error ? mensagemDeErro(error) : null;
  };

  // `scope: "local"` derruba a sessão deste navegador e não as outras. Um erro aqui não
  // deve prender o gerente na tela: a lib limpa o armazenamento local de todo modo, e o
  // SIGNED_OUT chega junto.
  const sair = async () => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) console.error("[sair]", error);
    setSessao(null);
  };

  return { carregando, sessao, entrar, sair };
}

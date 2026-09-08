import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import {
  VIAGEM_VAZIA,
  formularioParaPayload,
  statusAposEdicao,
  statusPorCompletude,
  validarViagem,
} from "@/lib/viagem";

// Mesmo shape que o buscarDados usa — sem os joins, a linha devolvida por um update
// perde clientes.nome/motoristas.nome e a tabela do Dashboard passa a mostrar "—".
const SELECT_VIAGEM = `*, clientes(nome), motoristas(nome), caminhoes(placa)`;

// Um update/delete barrado por RLS não vem como erro: o PostgREST responde 200 com
// lista vazia e error null. Sem esta checagem o app diria "salvo!" sem ter salvo nada.
function exigirUmaLinha(data, error, acao) {
  if (error) throw error;
  if (!data) {
    throw new Error(
      `Não foi possível ${acao} — a viagem pode ter sido removida, ou o banco não permite esta operação.`,
    );
  }
  return data;
}

export default function useTransporteData() {
  const [loading, setLoading] = useState(true);

  const [viagem, setViagem] = useState(VIAGEM_VAZIA);

  const [despesa, setDespesa] = useState({
    empresa: "",
    data: "",
    categoria: "",
    descricao: "",
    valor: "",
  });

  const [listaClientes, setListaClientes] = useState([]);
  const [listaMotoristas, setListaMotoristas] = useState([]);
  const [listaCaminhoes, setListaCaminhoes] = useState([]);
  const [listaViagens, setListaViagens] = useState([]);
  const [listaDespesas, setListaDespesas] = useState([]);
  const [listaCategorias, setListaCategorias] = useState([]);

  // `silencioso` evita o spinner de tela cheia do App.jsx. Sem ele, qualquer regravação
  // desmonta a árvore inteira: as Tabs são não-controladas e voltam para "Viagem", e os
  // filtros do Dashboard (que são estado local dele) se perdem. Só a carga inicial deve
  // mostrar o spinner.
  const buscarDados = async ({ silencioso = false } = {}) => {
    if (!silencioso) setLoading(true);
    const [cli, mot, cam, cat, via, desp] = await Promise.all([
      supabase.from("clientes").select("*"),
      supabase.from("motoristas").select("*"),
      supabase.from("caminhoes").select("*"),
      supabase.from("categoriasdespesas").select("*"),
      supabase.from("viagens").select(`*, clientes(nome), motoristas(nome), caminhoes(placa)`).order("data", { ascending: false }),
      supabase.from("despesas").select(`*, categoriasdespesas(categoria)`).order("data", { ascending: false }),
    ]);
    if (cli.data) setListaClientes(cli.data);
    if (mot.data) setListaMotoristas(mot.data);
    if (cam.data) setListaCaminhoes(cam.data);
    if (cat.data) setListaCategorias(cat.data);
    if (via.data) setListaViagens(via.data);
    if (desp.data) setListaDespesas(desp.data);
    if (!silencioso) setLoading(false);
  };

  // Substitui uma viagem na lista sem refazer a consulta — mantém o scroll da tabela,
  // os filtros e a aba atual.
  const trocarViagemNaLista = (atualizada) =>
    setListaViagens((prev) => prev.map((v) => (v.id === atualizada.id ? atualizada : v)));

  useEffect(() => { buscarDados(); }, []);

  const adicionarCliente = async (nome) => {
    const { data, error } = await supabase.from("clientes").insert([{ nome }]).select();
    if (error) throw error;
    setListaClientes((prev) => [...prev, data[0]]);
  };

  const adicionarMotorista = async (nome) => {
    const { data, error } = await supabase.from("motoristas").insert([{ nome }]).select();
    if (error) throw error;
    setListaMotoristas((prev) => [...prev, data[0]]);
  };

  const adicionarCaminhao = async (placa, modelo) => {
    const { data, error } = await supabase.from("caminhoes").insert([{ placa, modelo }]).select();
    if (error) throw error;
    setListaCaminhoes((prev) => [...prev, data[0]]);
  };

  const adicionarCategoria = async (nome) => {
    const { data, error } = await supabase.from("categoriasdespesas").insert([{ categoria: nome }]).select();
    if (error) throw error;
    const nova = data[0];
    setListaCategorias((prev) => [...prev, nova]);
    setDespesa((prev) => ({ ...prev, categoria: String(nova.id) }));
  };

  const handleSalvarViagem = async (e) => {
    e.preventDefault();
    validarViagem(viagem);
    // A conversão e a regra de status vivem em lib/viagem.js, compartilhadas com a
    // edição — sem isso o default do banco ('rascunho') marcaria como incompleta uma
    // viagem totalmente preenchida, e as duas cópias divergiriam com o tempo.
    const payload = formularioParaPayload(viagem);
    const { error } = await supabase
      .from("viagens")
      .insert([{ ...payload, status: statusPorCompletude(payload) }]);
    if (error) throw error;
    await buscarDados({ silencioso: true });
    setViagem(VIAGEM_VAZIA);
  };

  // --- Edição de viagens ---

  const handleAtualizarViagem = async (id, formulario) => {
    validarViagem(formulario);
    const payload = formularioParaPayload(formulario);

    // O status atual vem do banco, não da lista em memória: o agente do Telegram pode
    // ter alterado a viagem desde que a página carregou, e o cron da meia-noite reescreve
    // status em massa — um modal aberto atravessando a virada do dia calcularia por cima
    // de um status velho.
    const { data: atual, error: erroLeitura } = await supabase
      .from("viagens").select("status").eq("id", id).maybeSingle();
    if (erroLeitura) throw erroLeitura;
    if (!atual) throw new Error("Viagem não encontrada — ela pode ter sido removida.");

    const { data, error } = await supabase
      .from("viagens")
      .update({ ...payload, status: statusAposEdicao(atual.status, payload) })
      .eq("id", id)
      .select(SELECT_VIAGEM)
      .maybeSingle();

    trocarViagemNaLista(exigirUmaLinha(data, error, "salvar a viagem"));
  };

  const cancelarViagem = async (id) => {
    const { data, error } = await supabase
      .from("viagens").update({ status: "cancelada" }).eq("id", id)
      .select(SELECT_VIAGEM).maybeSingle();
    trocarViagemNaLista(exigirUmaLinha(data, error, "cancelar a viagem"));
  };

  // A outra metade do "cancelamento é reversível": o formulário não tem campo de status,
  // então sem esta ação não haveria como desfazer.
  const reativarViagem = async (id) => {
    const { data: atual, error: erroLeitura } = await supabase
      .from("viagens").select("*").eq("id", id).maybeSingle();
    if (erroLeitura) throw erroLeitura;
    if (!atual) throw new Error("Viagem não encontrada — ela pode ter sido removida.");

    const { data, error } = await supabase
      .from("viagens").update({ status: statusPorCompletude(atual) }).eq("id", id)
      .select(SELECT_VIAGEM).maybeSingle();
    trocarViagemNaLista(exigirUmaLinha(data, error, "reativar a viagem"));
  };

  const excluirViagem = async (id) => {
    const { data, error } = await supabase
      .from("viagens").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) {
      throw new Error(
        "Não foi possível excluir — a viagem pode já ter sido removida, ou o banco não permite esta operação.",
      );
    }
    setListaViagens((prev) => prev.filter((v) => v.id !== id));
  };

  const handleSalvarDespesa = async (e) => {
    e.preventDefault();
    if (!despesa.empresa || !despesa.data || !despesa.valor || !despesa.categoria) {
      throw new Error("Preencha os campos obrigatórios.");
    }
    const { error } = await supabase.from("despesas").insert([{
      empresa: despesa.empresa,
      data: despesa.data,
      categoria: despesa.categoria,
      descricao: despesa.descricao,
      valor: parseFloat(despesa.valor),
    }]);
    if (error) throw error;
    await buscarDados({ silencioso: true });
    setDespesa({ empresa: "", data: "", categoria: "", valor: "", descricao: "" });
  };

  return {
    loading,
    viagem, setViagem,
    despesa, setDespesa,
    listaClientes, listaMotoristas, listaCaminhoes,
    listaViagens, listaDespesas, listaCategorias,
    handleSalvarViagem, handleSalvarDespesa,
    handleAtualizarViagem, cancelarViagem, reativarViagem, excluirViagem,
    adicionarCliente, adicionarMotorista, adicionarCaminhao, adicionarCategoria,
  };
}

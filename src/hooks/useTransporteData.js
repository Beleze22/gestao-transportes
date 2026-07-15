import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

export default function useTransporteData() {
  const [loading, setLoading] = useState(true);

  const [viagem, setViagem] = useState({
    empresa: "",
    data: "",
    cliente_id: "",
    motorista_id: "",
    caminhao_id: "",
    valorFrete: "",
    valorMotorista: "",
    localCarregamento: "",
    horarioCarregamento: "",
    localDescarregamento: "",
    horarioDescarregamento: "",
    observacoes: "",
  });

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

  const buscarDados = async () => {
    setLoading(true);
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
    setLoading(false);
  };

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

  const VIAGEM_VAZIA = {
    empresa: "", data: "", cliente_id: "", motorista_id: "", caminhao_id: "",
    valorFrete: "", valorMotorista: "", localCarregamento: "", horarioCarregamento: "",
    localDescarregamento: "", horarioDescarregamento: "", observacoes: "",
  };

  const handleSalvarViagem = async (e) => {
    e.preventDefault();
    if (!viagem.empresa || !viagem.cliente_id || !viagem.motorista_id || !viagem.caminhao_id) {
      throw new Error("Preencha todos os campos obrigatórios.");
    }
    // Espelha statusPorCompletude do agente — sem isso o default do banco ('rascunho')
    // marcaria como incompleta uma viagem totalmente preenchida.
    const temValores = !!viagem.valorFrete && !!viagem.valorMotorista;
    const { error } = await supabase.from("viagens").insert([{
      empresa: viagem.empresa,
      data: viagem.data,
      cliente_id: parseInt(viagem.cliente_id),
      motorista_id: parseInt(viagem.motorista_id),
      caminhao_id: parseInt(viagem.caminhao_id),
      status: temValores ? "confirmada" : "confirmada_sem_valor",
      valor_frete: viagem.valorFrete ? parseFloat(viagem.valorFrete) : null,
      valor_motorista: viagem.valorMotorista ? parseFloat(viagem.valorMotorista) : null,
      local_carregamento: viagem.localCarregamento || null,
      horario_carregamento: viagem.horarioCarregamento || null,
      local_descarregamento: viagem.localDescarregamento || null,
      horario_descarregamento: viagem.horarioDescarregamento || null,
      observacoes: viagem.observacoes || null,
    }]);
    if (error) throw error;
    await buscarDados();
    setViagem(VIAGEM_VAZIA);
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
    await buscarDados();
    setDespesa({ empresa: "", data: "", categoria: "", valor: "", descricao: "" });
  };

  return {
    loading,
    viagem, setViagem,
    despesa, setDespesa,
    listaClientes, listaMotoristas, listaCaminhoes,
    listaViagens, listaDespesas, listaCategorias,
    handleSalvarViagem, handleSalvarDespesa,
    adicionarCliente, adicionarMotorista, adicionarCaminhao, adicionarCategoria,
  };
}

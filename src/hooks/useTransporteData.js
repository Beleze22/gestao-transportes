import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

export default function useTransporteData() {
  const [modo, setModo] = useState("viagem");

  const [viagem, setViagem] = useState({
    empresa: "",
    data: "",
    cliente_id: "",
    motorista_id: "",
    caminhao_id: "",
    valorFrete: "",
    valorMotorista: "",
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

  const [filtro, setFiltro] = useState({
    dataInicio: "",
    dataFim: "",
    empresa: "",
  });

  const [relatorio, setRelatorio] = useState({
    totalFaturamento: 0,
    totalPagoMotoristas: 0,
    totalDespesas: 0,
    lucroLiquido: 0,
    porCliente: {},
    porMotorista: {},
    porCategoriaDespesa: {},
  });

  const buscarDados = async () => {
    const { data: cli } = await supabase.from("clientes").select("*");
    if (cli) setListaClientes(cli);
    const { data: mot } = await supabase.from("motoristas").select("*");
    if (mot) setListaMotoristas(mot);
    const { data: cam } = await supabase.from("caminhoes").select("*");
    if (cam) setListaCaminhoes(cam);
    const { data: cat } = await supabase.from("categoriasdespesas").select("*");
    if (cat) setListaCategorias(cat);

    const { data: via } = await supabase
      .from("viagens")
      .select(`*, clientes(nome), motoristas(nome), caminhoes(placa)`)
      .order("data", { ascending: false });
    if (via) setListaViagens(via);

    const { data: desp } = await supabase
      .from("despesas")
      .select(`*, categoriasdespesas (categoria)`)
      .order("data", { ascending: false });
    if (desp) setListaDespesas(desp);
  };

  useEffect(() => {
    buscarDados();
  }, []);

  const adicionarCliente = async () => {
    const nome = prompt("Nome do novo Cliente:");
    if (!nome) return;
    const { data, error } = await supabase
      .from("clientes")
      .insert([{ nome }])
      .select();
    if (!error) {
      setListaClientes((prev) => [...prev, data[0]]);
      alert("Cliente adicionado!");
    }
  };

  const adicionarMotorista = async () => {
    const nome = prompt("Nome do novo Motorista:");
    if (!nome) return;
    const { data, error } = await supabase
      .from("motoristas")
      .insert([{ nome }])
      .select();
    if (!error) {
      setListaMotoristas((prev) => [...prev, data[0]]);
      alert("Motorista adicionado!");
    }
  };

  const adicionarCaminhao = async () => {
    const placa = prompt("Placa do Caminhão:");
    if (!placa) return;
    const modelo = prompt("Modelo:");
    const { data, error } = await supabase
      .from("caminhoes")
      .insert([{ placa, modelo }])
      .select();
    if (!error) {
      setListaCaminhoes((prev) => [...prev, data[0]]);
      alert("Caminhão adicionado!");
    }
  };

  const adicionarCategoria = () => {
    const nova = prompt("Nova Categoria de Despesa:");
    if (nova) {
      setListaCategorias((prev) => [...prev, nova]);
      setDespesa((prev) => ({ ...prev, categoria: nova }));
    }
  };

  const handleSalvarViagem = async (e) => {
    e.preventDefault();
    if (
      !viagem.empresa ||
      !viagem.cliente_id ||
      !viagem.motorista_id ||
      !viagem.caminhao_id
    ) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }
    try {
      const { error } = await supabase.from("viagens").insert([
        {
          empresa: viagem.empresa,
          data: viagem.data,
          cliente_id: viagem.cliente_id,
          motorista_id: viagem.motorista_id,
          caminhao_id: viagem.caminhao_id,
          valor_frete: parseFloat(viagem.valorFrete),
          valor_motorista: parseFloat(viagem.valorMotorista),
        },
      ]);
      if (error) throw error;
      alert("Viagem salva! 🚀");
      buscarDados();
      setViagem({
        empresa: "",
        data: "",
        cliente_id: "",
        motorista_id: "",
        caminhao_id: "",
        valorFrete: "",
        valorMotorista: "",
      });
    } catch (err) {
      alert("Erro: " + err.message);
    }
  };

  const handleSalvarDespesa = async (e) => {
    e.preventDefault();
    if (!despesa.empresa || !despesa.data || !despesa.valor || !despesa.categoria) {
      alert("Preencha os campos obrigatórios.");
      return;
    }
    try {
      const { error } = await supabase.from("despesas").insert([
        {
          empresa: despesa.empresa,
          data: despesa.data,
          categoria: despesa.categoria,
          descricao: despesa.descricao,
          valor: parseFloat(despesa.valor),
        },
      ]);
      if (error) throw error;
      alert("Despesa registrada! 💸");
      buscarDados();
      setDespesa({
        empresa: "",
        data: "",
        categoria: "",
        valor: "",
        descricao: "",
      });
    } catch (err) {
      alert("Erro: " + err.message);
    }
  };

  const gerarRelatorio = () => {
    let totalFrete = 0;
    let totalMot = 0;
    let totalGastos = 0;
    let clienteMap = {};
    let motoristaMap = {};
    let categoriaMap = {};

    listaViagens.forEach((v) => {
      if (filtro.empresa && v.empresa !== filtro.empresa) return;
      if (filtro.dataInicio && v.data < filtro.dataInicio) return;
      if (filtro.dataFim && v.data > filtro.dataFim) return;

      totalFrete += v.valor_frete;
      totalMot += v.valor_motorista;

      const nomeCli = v.clientes?.nome || "Outros";
      if (!clienteMap[nomeCli]) clienteMap[nomeCli] = 0;
      clienteMap[nomeCli] += v.valor_frete;

      const nomeMot = v.motoristas?.nome || "Outros";
      if (!motoristaMap[nomeMot]) motoristaMap[nomeMot] = 0;
      motoristaMap[nomeMot] += v.valor_motorista;
    });

    listaDespesas.forEach((d) => {
      if (filtro.empresa && d.empresa !== filtro.empresa) return;
      if (filtro.dataInicio && d.data < filtro.dataInicio) return;
      if (filtro.dataFim && d.data > filtro.dataFim) return;

      totalGastos += d.valor;

      const nomeCategoria = d.categoriasdespesas?.categoria || "Sem Categoria";
      if (!categoriaMap[nomeCategoria]) categoriaMap[nomeCategoria] = 0;
      categoriaMap[nomeCategoria] += d.valor;
    });

    setRelatorio({
      totalFaturamento: totalFrete,
      totalPagoMotoristas: totalMot,
      totalDespesas: totalGastos,
      lucroLiquido: totalFrete - totalMot - totalGastos,
      porCliente: clienteMap,
      porMotorista: motoristaMap,
      porCategoriaDespesa: categoriaMap,
    });
  };

  return {
    modo,
    setModo,
    viagem,
    setViagem,
    despesa,
    setDespesa,
    filtro,
    setFiltro,
    relatorio,
    listaClientes,
    listaMotoristas,
    listaCaminhoes,
    listaViagens,
    listaDespesas,
    listaCategorias,
    handleSalvarViagem,
    handleSalvarDespesa,
    adicionarCliente,
    adicionarMotorista,
    adicionarCaminhao,
    adicionarCategoria,
    gerarRelatorio,
  };
}

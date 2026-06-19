import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

export default function useTransporteData() {
  const [modo, setModo] = useState("viagem");
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
    setLoading(true);
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
    setLoading(false);
  };

  useEffect(() => {
    buscarDados();
  }, []);

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
    const { data, error } = await supabase
      .from("caminhoes")
      .insert([{ placa, modelo }])
      .select();
    if (error) throw error;
    setListaCaminhoes((prev) => [...prev, data[0]]);
  };

  const adicionarCategoria = async (nome) => {
    const { data, error } = await supabase
      .from("categoriasdespesas")
      .insert([{ categoria: nome }])
      .select();
    if (error) throw error;
    const nova = data[0];
    setListaCategorias((prev) => [...prev, nova]);
    setDespesa((prev) => ({ ...prev, categoria: String(nova.id) }));
  };

  const handleSalvarViagem = async (e) => {
    e.preventDefault();
    if (!viagem.empresa || !viagem.cliente_id || !viagem.motorista_id || !viagem.caminhao_id) {
      throw new Error("Preencha todos os campos obrigatórios.");
    }
    const { error } = await supabase.from("viagens").insert([
      {
        empresa: viagem.empresa,
        data: viagem.data,
        cliente_id: viagem.cliente_id,
        motorista_id: viagem.motorista_id,
        caminhao_id: viagem.caminhao_id,
        valor_frete: viagem.valorFrete ? parseFloat(viagem.valorFrete) : null,
        valor_motorista: viagem.valorMotorista ? parseFloat(viagem.valorMotorista) : null,
        local_carregamento: viagem.localCarregamento || null,
        horario_carregamento: viagem.horarioCarregamento || null,
        local_descarregamento: viagem.localDescarregamento || null,
        horario_descarregamento: viagem.horarioDescarregamento || null,
        observacoes: viagem.observacoes || null,
      },
    ]);
    if (error) throw error;
    await buscarDados();
    setViagem({
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
  };

  const handleSalvarDespesa = async (e) => {
    e.preventDefault();
    if (!despesa.empresa || !despesa.data || !despesa.valor || !despesa.categoria) {
      throw new Error("Preencha os campos obrigatórios.");
    }
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
    await buscarDados();
    setDespesa({ empresa: "", data: "", categoria: "", valor: "", descricao: "" });
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

      totalFrete += v.valor_frete || 0;
      totalMot += v.valor_motorista || 0;

      const nomeCli = v.clientes?.nome || "Outros";
      if (!clienteMap[nomeCli]) clienteMap[nomeCli] = 0;
      clienteMap[nomeCli] += v.valor_frete || 0;

      const nomeMot = v.motoristas?.nome || "Outros";
      if (!motoristaMap[nomeMot]) motoristaMap[nomeMot] = 0;
      motoristaMap[nomeMot] += v.valor_motorista || 0;
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
    loading,
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

import { supabase } from "../supabaseClient.js";

// [FIX #13] As conferências de referência ficam em services/referencias.js, chamadas
// por tools.js/executar antes da escrita — ver a nota em viagens.js.

async function listar(tabela, colunas = "*") {
  const { data, error } = await supabase.from(tabela).select(colunas);
  if (error) throw error;
  return data;
}

async function inserirRetornando(tabela, valores) {
  const { data, error } = await supabase.from(tabela).insert(valores).select().single();
  if (error) throw error;
  return data;
}

export const listarClientes = () => listar("clientes");
export const listarCaminhoes = () => listar("caminhoes");
export const listarCategorias = () => listar("categoriasdespesas");

export async function listarMotoristas() {
  const [{ data: motoristas, error: errM }, { data: apelidos, error: errA }] = await Promise.all([
    supabase.from("motoristas").select("*"),
    supabase.from("motoristas_apelidos").select("apelido, motorista_id"),
  ]);
  if (errM) throw errM;
  if (errA) throw errA;

  return motoristas.map((m) => ({
    ...m,
    apelidos: apelidos.filter((a) => a.motorista_id === m.id).map((a) => a.apelido),
  }));
}

export async function registrarApelidoMotorista(apelido, motorista_id) {
  const { data, error } = await supabase
    .from("motoristas_apelidos")
    .upsert({ apelido, motorista_id }, { onConflict: "apelido" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export const adicionarCliente = (nome) => inserirRetornando("clientes", { nome });
export const adicionarMotorista = (nome) => inserirRetornando("motoristas", { nome });
export const adicionarCaminhao = (placa, modelo) =>
  inserirRetornando("caminhoes", { placa, modelo });
export const adicionarCategoria = (categoria) =>
  inserirRetornando("categoriasdespesas", { categoria });

export async function registrarDespesa({ empresa, data, categoria, descricao, valor }) {
  const { data: registro, error } = await supabase
    .from("despesas")
    .insert({ empresa, data, categoria, descricao, valor })
    .select(`*, categoriasdespesas (categoria)`)
    .single();
  if (error) throw error;
  return registro;
}

export async function consultarDespesas(filtros = {}) {
  let query = supabase.from("despesas").select(`*, categoriasdespesas (categoria)`);
  if (filtros.empresa) query = query.eq("empresa", filtros.empresa);
  if (filtros.data_inicio) query = query.gte("data", filtros.data_inicio);
  if (filtros.data_fim) query = query.lte("data", filtros.data_fim);
  query = query.order("data", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function gerarRelatorio({ empresa, data_inicio, data_fim } = {}) {
  let queryViagens = supabase
    .from("viagens")
    .select(`valor_frete, valor_motorista, empresa, data, clientes(nome), motoristas(nome)`)
    .neq("status", "cancelada")
    .not("valor_frete", "is", null)
    .not("valor_motorista", "is", null);
  let queryDespesas = supabase
    .from("despesas")
    .select(`valor, empresa, data, categoriasdespesas (categoria)`);

  if (empresa) {
    queryViagens = queryViagens.eq("empresa", empresa);
    queryDespesas = queryDespesas.eq("empresa", empresa);
  }
  if (data_inicio) {
    queryViagens = queryViagens.gte("data", data_inicio);
    queryDespesas = queryDespesas.gte("data", data_inicio);
  }
  if (data_fim) {
    queryViagens = queryViagens.lte("data", data_fim);
    queryDespesas = queryDespesas.lte("data", data_fim);
  }

  const [{ data: viagens, error: errV }, { data: despesas, error: errD }] = await Promise.all([
    queryViagens,
    queryDespesas,
  ]);
  if (errV) throw errV;
  if (errD) throw errD;

  let totalFrete = 0;
  let totalMotorista = 0;
  let totalDespesas = 0;
  const porCliente = {};
  const porMotorista = {};
  const porCategoriaDespesa = {};

  for (const v of viagens) {
    totalFrete += v.valor_frete;
    totalMotorista += v.valor_motorista;
    const cliente = v.clientes?.nome || "Outros";
    const motorista = v.motoristas?.nome || "Outros";
    porCliente[cliente] = (porCliente[cliente] || 0) + v.valor_frete;
    porMotorista[motorista] = (porMotorista[motorista] || 0) + v.valor_motorista;
  }

  for (const d of despesas) {
    totalDespesas += d.valor;
    const categoria = d.categoriasdespesas?.categoria || "Sem Categoria";
    porCategoriaDespesa[categoria] = (porCategoriaDespesa[categoria] || 0) + d.valor;
  }

  return {
    totalFaturamento: totalFrete,
    totalPagoMotoristas: totalMotorista,
    totalDespesas,
    lucroLiquido: totalFrete - totalMotorista - totalDespesas,
    porCliente,
    porMotorista,
    porCategoriaDespesa,
  };
}

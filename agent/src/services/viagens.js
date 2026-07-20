import { supabase } from "../supabaseClient.js";
import { hojeISO } from "../datas.js";
import { listarClientes, listarMotoristas, listarCaminhoes } from "./catalogo.js";
import { ReferenciaInvalidaError } from "../erros.js";

const SELECT_COMPLETO = `
  id, empresa, data, status, valor_frete, valor_motorista,
  local_carregamento, local_descarregamento,
  horario_carregamento, horario_descarregamento, observacoes,
  cliente_id, motorista_id, caminhao_id,
  clientes(id, nome), motoristas(id, nome), caminhoes(id, placa, modelo)
`;

function statusPorCompletude(v) {
  const temDadosBasicos = v.empresa && v.cliente_id && v.motorista_id && v.caminhao_id;
  const temValores = v.valor_frete != null && v.valor_motorista != null;
  if (!temDadosBasicos) return "rascunho";
  if (!temValores) return "confirmada_sem_valor";
  return "confirmada";
}

// Confere que os IDs enviados pelo modelo existem de fato — sem isso, um ID
// inventado que por acaso coincide com um registro real (ex: motorista errado)
// seria gravado silenciosamente, já que o Postgres só rejeita IDs inexistentes.
// A mensagem de erro já traz a lista de opções válidas (com apelidos, quando
// houver) para o modelo se corrigir sem precisar de uma chamada extra.
async function validarReferencias({ cliente_id, motorista_id, caminhao_id }) {
  if (cliente_id == null && motorista_id == null && caminhao_id == null) return;

  const [clientes, motoristas, caminhoes] = await Promise.all([
    listarClientes(),
    listarMotoristas(),
    listarCaminhoes(),
  ]);

  const problemas = [];
  if (cliente_id != null && !clientes.some((c) => c.id === Number(cliente_id))) {
    problemas.push(
      `cliente_id=${cliente_id} não existe. Clientes cadastrados: ${clientes.map((c) => `${c.nome}(#${c.id})`).join(", ")}`,
    );
  }
  if (motorista_id != null && !motoristas.some((m) => m.id === Number(motorista_id))) {
    problemas.push(
      `motorista_id=${motorista_id} não existe. Motoristas cadastrados: ${motoristas.map((m) => `${m.nome}${m.apelidos?.length ? ` (apelido: ${m.apelidos.join(", ")})` : ""}(#${m.id})`).join(", ")}`,
    );
  }
  if (caminhao_id != null && !caminhoes.some((c) => c.id === Number(caminhao_id))) {
    problemas.push(
      `caminhao_id=${caminhao_id} não existe. Caminhões cadastrados: ${caminhoes.map((c) => `${c.placa}(#${c.id})`).join(", ")}`,
    );
  }
  if (problemas.length) throw new ReferenciaInvalidaError(problemas.join(" | "));
}

export async function criarViagemRascunho(dados) {
  await validarReferencias(dados);
  const status = statusPorCompletude(dados);
  const { data, error } = await supabase
    .from("viagens")
    .insert({ ...dados, status })
    .select(SELECT_COMPLETO)
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarViagem(id, campos) {
  await validarReferencias(campos);
  const { data: atual, error: errAtual } = await supabase
    .from("viagens")
    .select("*")
    .eq("id", id)
    .single();
  if (errAtual) throw errAtual;

  const mesclado = { ...atual, ...campos };
  if (!campos.status) {
    mesclado.status =
      atual.status === "realizada_pendente" || atual.status === "concluida"
        ? mesclado.valor_frete != null && mesclado.valor_motorista != null
          ? "concluida"
          : "realizada_pendente"
        : statusPorCompletude(mesclado);
  }

  const { data, error } = await supabase
    .from("viagens")
    .update({ ...campos, status: mesclado.status })
    .eq("id", id)
    .select(SELECT_COMPLETO)
    .single();
  if (error) throw error;
  return data;
}

export async function consultarViagens(filtros = {}) {
  let query = supabase.from("viagens").select(SELECT_COMPLETO);

  if (filtros.empresa) query = query.eq("empresa", filtros.empresa);
  if (filtros.status) query = query.eq("status", filtros.status);
  if (filtros.cliente_id) query = query.eq("cliente_id", filtros.cliente_id);
  if (filtros.motorista_id) query = query.eq("motorista_id", filtros.motorista_id);
  if (filtros.data_inicio) query = query.gte("data", filtros.data_inicio);
  if (filtros.data_fim) query = query.lte("data", filtros.data_fim);

  query = query.order("data", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function marcarRealizadasPendentes() {
  const hoje = hojeISO();

  // Viagens com valores definidos → concluida direto
  const { data: concluidas, error: err1 } = await supabase
    .from("viagens")
    .update({ status: "concluida" })
    .eq("status", "confirmada")
    .lt("data", hoje)
    .not("valor_frete", "is", null)
    .not("valor_motorista", "is", null)
    .select("id");
  if (err1) throw err1;

  // Viagens sem valores → realizada_pendente para cobrança.
  // Inclui confirmada_sem_valor — sem isso elas ficariam presas nesse status para sempre.
  const { data: pendentes, error: err2 } = await supabase
    .from("viagens")
    .update({ status: "realizada_pendente" })
    .in("status", ["confirmada", "confirmada_sem_valor"])
    .lt("data", hoje)
    .select("id");
  if (err2) throw err2;

  return [...(concluidas ?? []), ...(pendentes ?? [])];
}

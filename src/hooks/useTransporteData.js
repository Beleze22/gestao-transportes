import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import {
  viagemVazia,
  formularioParaPayload,
  statusAposEdicao,
  statusParaViagem,
  validarViagem,
} from "@/lib/viagem";
import {
  despesaVazia,
  formularioParaPayloadDespesa,
  validarDespesa,
} from "@/lib/despesa";

// Mesmo shape que o buscarDados usa — sem os joins, a linha devolvida por um update
// perde clientes.nome/motoristas.nome e a tabela do Dashboard passa a mostrar "—".
const SELECT_VIAGEM = `*, clientes(nome), motoristas(nome), caminhoes(placa)`;
const SELECT_DESPESA = `*, categoriasdespesas(categoria)`;

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

  const [viagem, setViagem] = useState(viagemVazia);

  const [despesa, setDespesa] = useState(despesaVazia);

  const [listaClientes, setListaClientes] = useState([]);
  const [listaMotoristas, setListaMotoristas] = useState([]);
  const [listaCaminhoes, setListaCaminhoes] = useState([]);
  const [listaViagens, setListaViagens] = useState([]);
  const [listaDespesas, setListaDespesas] = useState([]);
  const [listaCategorias, setListaCategorias] = useState([]);
  // Spec 02. As ordens entram na carga inicial, junto com o resto, e não ao abrir cada
  // tela financeira: é o que mantém o critério 9 da spec 04 — trocar de tela não dispara
  // consulta nova. Custa três requisições na abertura.
  const [listaOrdens, setListaOrdens] = useState([]);
  const [resumoOrdens, setResumoOrdens] = useState({});
  const [inicioControle, setInicioControle] = useState(null);
  // Spec 03. `saldoEntreEmpresas` é sempre no sentido TransBeleze -> Rohan: positivo, a
  // TransBeleze deve; negativo, o contrário. O sentido fixo vem da view.
  const [aliquotas, setAliquotas] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [devidos, setDevidos] = useState([]);
  const [saldoEntreEmpresas, setSaldoEntreEmpresas] = useState(0);

  // `silencioso` evita o spinner de tela cheia do App.jsx. Sem ele, qualquer regravação
  // desmonta a árvore inteira: as Tabs são não-controladas e voltam para "Viagem", e os
  // filtros do Dashboard (que são estado local dele) se perdem. Só a carga inicial deve
  // mostrar o spinner.
  const buscarDados = async ({ silencioso = false } = {}) => {
    if (!silencioso) setLoading(true);
    const [cli, mot, cam, cat, via, desp, ord, res, cfg, aliq, mov, dev, sal] = await Promise.all([
      supabase.from("clientes").select("*"),
      supabase.from("motoristas").select("*"),
      supabase.from("caminhoes").select("*"),
      supabase.from("categoriasdespesas").select("*"),
      supabase.from("viagens").select(`*, clientes(nome), motoristas(nome), caminhoes(placa)`).order("data", { ascending: false }),
      supabase.from("despesas").select(`*, categoriasdespesas(categoria)`).order("data", { ascending: false }),
      supabase.from("ordens_pagamento").select(`*, clientes(nome)`).order("id", { ascending: false }),
      supabase.from("ordens_resumo").select("*"),
      supabase.from("configuracao_financeira").select("inicio_controle").maybeSingle(),
      supabase.from("aliquotas_repasse").select("*").order("empresa"),
      supabase.from("movimentos_entre_empresas").select("*").order("data", { ascending: false }),
      supabase.from("devidos_entre_empresas").select("*"),
      supabase.from("saldo_entre_empresas").select("saldo_tb_para_rohan").maybeSingle(),
    ]);
    if (cli.data) setListaClientes(cli.data);
    if (mot.data) setListaMotoristas(mot.data);
    if (cam.data) setListaCaminhoes(cam.data);
    if (cat.data) setListaCategorias(cat.data);
    if (via.data) setListaViagens(via.data);
    if (desp.data) setListaDespesas(desp.data);
    if (ord.data) setListaOrdens(ord.data);
    // Indexado por ordem_id: as telas pedem o resumo de uma ordem por vez, e uma busca
    // linear por ordem numa lista que cresce sem teto não se justifica.
    if (res.data) {
      setResumoOrdens(Object.fromEntries(res.data.map((r) => [r.ordem_id, r])));
    }
    if (cfg.data) setInicioControle(cfg.data.inicio_controle);
    if (aliq.data) setAliquotas(aliq.data);
    if (mov.data) setMovimentos(mov.data);
    if (dev.data) setDevidos(dev.data);
    // `numeric` do Postgres pode chegar como string no JSON — e um saldo em string
    // compararia errado no `> 0` que decide quem deve a quem.
    if (sal.data) setSaldoEntreEmpresas(Number(sal.data.saldo_tb_para_rohan ?? 0));
    if (!silencioso) setLoading(false);
  };

  // Toda ação de ordem termina recarregando: o total da ordem não é gravado (é a soma das
  // viagens dela) e o banco grava sozinho fechada_em, reaberta_em e a limpeza do
  // recebimento. Recalcular em memória seria manter uma segunda versão dessas regras.
  const recarregar = () => buscarDados({ silencioso: true });

  function exigirSucesso(error) {
    // O erro de trava do banco (SQLSTATE TRV01) já vem com mensagem escrita para a tela.
    // Repassada como está, é ela que o toast mostra.
    if (error) throw new Error(error.message);
  }

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
      .insert([{ ...payload, status: statusParaViagem(payload) }]);
    if (error) throw error;
    await buscarDados({ silencioso: true });
    setViagem(viagemVazia());
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
      .from("viagens").update({ status: statusParaViagem(atual) }).eq("id", id)
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
    validarDespesa(despesa);
    const { error } = await supabase
      .from("despesas")
      .insert([formularioParaPayloadDespesa(despesa)]);
    if (error) throw error;
    await buscarDados({ silencioso: true });
    setDespesa(despesaVazia());
  };

  // --- Edição de despesas ---

  const trocarDespesaNaLista = (atualizada) =>
    setListaDespesas((prev) => prev.map((d) => (d.id === atualizada.id ? atualizada : d)));

  const handleAtualizarDespesa = async (id, formulario) => {
    validarDespesa(formulario);
    const { data, error } = await supabase
      .from("despesas")
      .update(formularioParaPayloadDespesa(formulario))
      .eq("id", id)
      .select(SELECT_DESPESA)
      .maybeSingle();
    trocarDespesaNaLista(exigirUmaLinha(data, error, "salvar a despesa"));
  };

  // Despesa não tem status, então não existe o meio-termo do cancelamento — excluir é
  // a única forma de remover, e é definitiva.
  const excluirDespesa = async (id) => {
    const { data, error } = await supabase
      .from("despesas").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) {
      throw new Error(
        "Não foi possível excluir — a despesa pode já ter sido removida, ou o banco não permite esta operação.",
      );
    }
    setListaDespesas((prev) => prev.filter((d) => d.id !== id));
  };

  // --- Ordens de pagamento (spec 02) ---
  //
  // Nenhuma destas funções valida: quem recusa é o banco, pelas triggers da 005/006, e a
  // mensagem dele vai direto para o toast. A tela só evita oferecer o que será recusado.

  const moverViagensParaOrdem = async (ordemId, idsViagens) => {
    const { error } = await supabase
      .from("viagens")
      .update({ ordem_id: ordemId })
      .in("id", idsViagens);
    exigirSucesso(error);
  };

  // Criar ordem e mover viagens são dois comandos, e o segundo pode ser recusado pela
  // trava. Sem a limpeza abaixo, uma recusa deixaria uma ordem aberta e vazia no banco —
  // aparecendo na lista de Ordens como se o gerente a tivesse criado de propósito.
  const criarOrdemComViagens = async (clienteId, idsViagens) => {
    const { data, error } = await supabase
      .from("ordens_pagamento")
      .insert([{ cliente_id: clienteId }])
      .select()
      .single();
    exigirSucesso(error);

    try {
      await moverViagensParaOrdem(data.id, idsViagens);
    } catch (err) {
      // A ordem nasceu aberta, então o banco permite excluí-la. Se nem isso der certo,
      // o erro original é o que importa para o usuário.
      await supabase.from("ordens_pagamento").delete().eq("id", data.id);
      throw err;
    }
    await recarregar();
    return data;
  };

  const incluirViagensNaOrdem = async (ordemId, idsViagens) => {
    await moverViagensParaOrdem(ordemId, idsViagens);
    await recarregar();
  };

  const tirarViagemDaOrdem = async (viagemId) => {
    const { error } = await supabase
      .from("viagens")
      .update({ ordem_id: null })
      .eq("id", viagemId);
    exigirSucesso(error);
    await recarregar();
  };

  const alterarOrdem = async (ordemId, campos) => {
    const { error } = await supabase
      .from("ordens_pagamento")
      .update(campos)
      .eq("id", ordemId);
    exigirSucesso(error);
    await recarregar();
  };

  const fecharOrdem = (ordemId, dados) =>
    alterarOrdem(ordemId, { ...dados, status: "fechada" });

  const receberOrdem = (ordemId, { recebida_em, empresa_recebedora }) =>
    alterarOrdem(ordemId, { status: "recebida", recebida_em, empresa_recebedora });

  const reabrirOrdem = (ordemId, motivo) =>
    alterarOrdem(ordemId, { status: "aberta", motivo_reabertura: motivo });

  // Não manda recebida_em nem empresa_recebedora: a trigger limpa os dois. Mandar null
  // daqui funcionaria igual, mas duplicaria a regra em dois lugares.
  const desfazerRecebimento = (ordemId) => alterarOrdem(ordemId, { status: "fechada" });

  const editarNota = (ordemId, { numero_nota, data_nota }) =>
    alterarOrdem(ordemId, { numero_nota, data_nota });

  const excluirOrdem = async (ordemId) => {
    const { error } = await supabase.from("ordens_pagamento").delete().eq("id", ordemId);
    exigirSucesso(error);
    // As viagens voltam para "a faturar" pela cascata `on delete set null` da 005.
    await recarregar();
  };

  // Quitação de legado: há no máximo uma por cliente, então ou se usa a que existe ou se
  // cria. A corrida entre dois cliques é coberta pelo índice único do banco, que devolve
  // TRV01 com a ordem existente na mensagem.
  const quitarNoLegado = async (clienteId, idsViagens) => {
    const existente = listaOrdens.find((o) => o.legado && o.cliente_id === clienteId);
    if (existente) {
      await moverViagensParaOrdem(existente.id, idsViagens);
      await recarregar();
      return existente;
    }

    const { data, error } = await supabase
      .from("ordens_pagamento")
      .insert([{ cliente_id: clienteId, legado: true, status: "recebida" }])
      .select()
      .single();
    exigirSucesso(error);

    // Ao contrário de criarOrdemComViagens, aqui não há limpeza se o movimento falhar: a
    // quitação de legado NÃO pode ser excluída (nasce recebida, e o banco só exclui ordem
    // aberta). Ela fica vazia e será reaproveitada na próxima quitação deste cliente, que
    // é o que a mensagem da 006 orienta. O erro sobe sozinho para o toast.
    await moverViagensParaOrdem(data.id, idsViagens);
    await recarregar();
    return data;
  };

  // --- Repasses entre empresas (spec 03) ---

  const salvarMovimento = async (campos) => {
    const { error } = await supabase.from("movimentos_entre_empresas").insert([campos]);
    exigirSucesso(error);
    await recarregar();
  };

  const editarMovimento = async (movimentoId, campos) => {
    const { error } = await supabase
      .from("movimentos_entre_empresas")
      .update(campos)
      .eq("id", movimentoId);
    exigirSucesso(error);
    await recarregar();
  };

  const excluirMovimento = async (movimentoId) => {
    const { error } = await supabase
      .from("movimentos_entre_empresas")
      .delete()
      .eq("id", movimentoId);
    exigirSucesso(error);
    await recarregar();
  };

  // `atualizada_em` vai junto, sempre: é essa data que o aviso de alíquota vencida usa, e
  // deixá-la para um default do banco faria uma correção de digitação parecer atualização.
  const salvarAliquota = async (empresa, aliquota) => {
    const { error } = await supabase
      .from("aliquotas_repasse")
      .update({ aliquota, atualizada_em: new Date().toISOString() })
      .eq("empresa", empresa);
    exigirSucesso(error);
    await recarregar();
  };

  return {
    loading,
    viagem, setViagem,
    despesa, setDespesa,
    listaClientes, listaMotoristas, listaCaminhoes,
    listaViagens, listaDespesas, listaCategorias,
    handleSalvarViagem, handleSalvarDespesa,
    handleAtualizarViagem, cancelarViagem, reativarViagem, excluirViagem,
    handleAtualizarDespesa, excluirDespesa,
    adicionarCliente, adicionarMotorista, adicionarCaminhao, adicionarCategoria,
    // Spec 02
    listaOrdens, resumoOrdens, inicioControle,
    criarOrdemComViagens, incluirViagensNaOrdem, tirarViagemDaOrdem,
    fecharOrdem, receberOrdem, reabrirOrdem, desfazerRecebimento,
    editarNota, excluirOrdem, quitarNoLegado,
    // Spec 03
    aliquotas, movimentos, devidos, saldoEntreEmpresas,
    salvarMovimento, editarMovimento, excluirMovimento, salvarAliquota,
  };
}

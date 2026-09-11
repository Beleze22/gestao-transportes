import { useState } from "react";
import { Toaster, toast } from "sonner";
import useTransporteData from "@/hooks/useTransporteData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ViagemForm from "@/components/ViagemForm";
import DespesaForm from "@/components/DespesaForm";
import Dashboard from "@/components/Dashboard";
import ModalQuickAdd from "@/components/ModalQuickAdd";
import ModalEditarViagem from "@/components/ModalEditarViagem";
import ModalEditarDespesa from "@/components/ModalEditarDespesa";
import ModalConfirmacao from "@/components/ModalConfirmacao";

function App() {
  const {
    loading,
    viagem,
    setViagem,
    despesa,
    setDespesa,
    listaClientes,
    listaMotoristas,
    listaCaminhoes,
    listaViagens,
    listaDespesas,
    listaCategorias,
    handleSalvarViagem,
    handleSalvarDespesa,
    handleAtualizarViagem,
    cancelarViagem,
    reativarViagem,
    excluirViagem,
    handleAtualizarDespesa,
    excluirDespesa,
    adicionarCliente,
    adicionarMotorista,
    adicionarCaminhao,
    adicionarCategoria,
  } = useTransporteData();

  const [modal, setModal] = useState(null);
  const [modalKey, setModalKey] = useState(0);

  // Qual viagem está sendo editada / confirmada. O rascunho do formulário mora dentro
  // do ModalEditarViagem; `edicaoKey` o remonta a cada abertura, como o modalKey faz
  // com o ModalQuickAdd.
  const [viagemEditando, setViagemEditando] = useState(null);
  const [despesaEditando, setDespesaEditando] = useState(null);
  const [edicaoKey, setEdicaoKey] = useState(0);
  // Alvo da confirmação de remoção, no formato que o ModalConfirmacao espera.
  const [confirmacao, setConfirmacao] = useState(null);

  const openModal = (config) => {
    setModal(config);
    setModalKey((k) => k + 1);
  };

  const abrirEdicaoViagem = (row) => {
    setViagemEditando(row);
    setEdicaoKey((k) => k + 1);
  };

  const abrirEdicaoDespesa = (row) => {
    setDespesaEditando(row);
    setEdicaoKey((k) => k + 1);
  };

  const fecharTudo = () => {
    setViagemEditando(null);
    setDespesaEditando(null);
    setConfirmacao(null);
  };

  const brl = (v) =>
    (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBR = (d) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

  const onAtualizarViagem = async (id, form) => {
    try {
      await handleAtualizarViagem(id, form);
      setViagemEditando(null);
      toast.success("Viagem atualizada!");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const onCancelarViagem = async (id) => {
    try {
      await cancelarViagem(id);
      setConfirmacao(null);
      toast.success("Viagem cancelada — ela saiu dos cálculos.");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const onReativarViagem = async (row) => {
    try {
      await reativarViagem(row.id);
      setViagemEditando(null);
      toast.success("Viagem reativada!");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const onExcluirViagem = async (id) => {
    try {
      // Limpa o estado ANTES de mexer na lista: se a linha sumir enquanto um modal
      // ainda a referencia, a próxima renderização acessa um registro que não existe.
      fecharTudo();
      await excluirViagem(id);
      toast.success("Viagem excluída definitivamente.");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const onAtualizarDespesa = async (id, form) => {
    try {
      await handleAtualizarDespesa(id, form);
      setDespesaEditando(null);
      toast.success("Despesa atualizada!");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const onExcluirDespesa = async (id) => {
    try {
      fecharTudo();
      await excluirDespesa(id);
      toast.success("Despesa excluída definitivamente.");
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Sai da edição e entra na confirmação em sequência, nunca empilhados: dois Dialog
  // aninhados no Radix deixam dois overlays e podem travar o body.
  const confirmarRemocaoViagem = (row) => {
    setViagemEditando(null);
    setConfirmacao({
      id: row.id,
      rotulo: "viagem",
      permiteCancelar: true,
      resumo: [dataBR(row.data), row.empresa, row.clientes?.nome, brl(row.valor_frete)]
        .filter(Boolean).join(" · "),
    });
  };

  const confirmarRemocaoDespesa = (row) => {
    setDespesaEditando(null);
    setConfirmacao({
      id: row.id,
      rotulo: "despesa",
      // Despesa não tem status: não existe o meio-termo do cancelamento.
      permiteCancelar: false,
      resumo: [dataBR(row.data), row.empresa, row.categoriasdespesas?.categoria, brl(row.valor)]
        .filter(Boolean).join(" · "),
    });
  };

  const onSalvarViagem = async (e) => {
    try {
      await handleSalvarViagem(e);
      toast.success("Viagem salva com sucesso!");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const onSalvarDespesa = async (e) => {
    try {
      await handleSalvarDespesa(e);
      toast.success("Despesa registrada!");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAdicionarCliente = () =>
    openModal({
      title: "Novo Cliente",
      fields: [{ key: "nome", label: "Nome", placeholder: "Nome do cliente" }],
      onConfirm: async (v) => {
        try {
          await adicionarCliente(v.nome);
          toast.success("Cliente adicionado!");
        } catch (err) {
          toast.error(err.message);
        }
      },
    });

  const handleAdicionarMotorista = () =>
    openModal({
      title: "Novo Motorista",
      fields: [
        { key: "nome", label: "Nome", placeholder: "Nome do motorista" },
      ],
      onConfirm: async (v) => {
        try {
          await adicionarMotorista(v.nome);
          toast.success("Motorista adicionado!");
        } catch (err) {
          toast.error(err.message);
        }
      },
    });

  const handleAdicionarCaminhao = () =>
    openModal({
      title: "Novo Caminhão",
      fields: [
        { key: "placa", label: "Placa", placeholder: "Ex: ABC-1234" },
        { key: "modelo", label: "Modelo", placeholder: "Ex: Volvo FH" },
      ],
      onConfirm: async (v) => {
        try {
          await adicionarCaminhao(v.placa, v.modelo);
          toast.success("Caminhão adicionado!");
        } catch (err) {
          toast.error(err.message);
        }
      },
    });

  const handleAdicionarCategoria = () =>
    openModal({
      title: "Nova Categoria",
      fields: [
        {
          key: "nome",
          label: "Categoria",
          placeholder: "Ex: Combustível, Pedágio...",
        },
      ],
      onConfirm: async (v) => {
        try {
          await adicionarCategoria(v.nome);
          toast.success("Categoria adicionada!");
        } catch (err) {
          toast.error(err.message);
        }
      },
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-20">
        <header className="mb-6 rounded-xl bg-brand-green px-6 py-4 flex items-center justify-center gap-4">
          <img
            src="/rohan-brasao-transparente.png"
            alt="Rohan Transportes"
            className="h-14 w-14 object-contain flex-none"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div>
            <p className="text-brand-gold font-bold text-xl tracking-widest uppercase leading-tight">
              Rohan Transportes
            </p>
            <p className="text-brand-gold/60 text-xs tracking-[0.3em] uppercase mt-0.5">
              Sistema de Gestão
            </p>
          </div>
        </header>

        <Tabs defaultValue="viagem">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="viagem">Viagem</TabsTrigger>
            <TabsTrigger value="despesa">Despesa</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="viagem">
            <ViagemForm
              viagem={viagem}
              setViagem={setViagem}
              listaClientes={listaClientes}
              listaMotoristas={listaMotoristas}
              listaCaminhoes={listaCaminhoes}
              onSalvar={onSalvarViagem}
              onAdicionarCliente={handleAdicionarCliente}
              onAdicionarMotorista={handleAdicionarMotorista}
              onAdicionarCaminhao={handleAdicionarCaminhao}
            />
          </TabsContent>

          <TabsContent value="despesa">
            <DespesaForm
              despesa={despesa}
              setDespesa={setDespesa}
              listaCategorias={listaCategorias}
              onSalvar={onSalvarDespesa}
              onAdicionarCategoria={handleAdicionarCategoria}
            />
          </TabsContent>

          <TabsContent value="dashboard">
            <Dashboard
              listaViagens={listaViagens}
              listaDespesas={listaDespesas}
              listaClientes={listaClientes}
              listaMotoristas={listaMotoristas}
              onEditarViagem={abrirEdicaoViagem}
              onEditarDespesa={abrirEdicaoDespesa}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Toaster richColors position="bottom-center" />
      <ModalQuickAdd
        key={modalKey}
        modal={modal}
        onClose={() => setModal(null)}
      />
      <ModalEditarViagem
        key={edicaoKey}
        viagem={viagemEditando}
        listaClientes={listaClientes}
        listaMotoristas={listaMotoristas}
        listaCaminhoes={listaCaminhoes}
        onSalvar={onAtualizarViagem}
        onFechar={() => setViagemEditando(null)}
        onCancelarViagem={confirmarRemocaoViagem}
        onReativarViagem={onReativarViagem}
        onAdicionarCliente={handleAdicionarCliente}
        onAdicionarMotorista={handleAdicionarMotorista}
        onAdicionarCaminhao={handleAdicionarCaminhao}
      />
      <ModalEditarDespesa
        key={`despesa-${edicaoKey}`}
        despesa={despesaEditando}
        listaCategorias={listaCategorias}
        onSalvar={onAtualizarDespesa}
        onFechar={() => setDespesaEditando(null)}
        onExcluirDespesa={confirmarRemocaoDespesa}
        onAdicionarCategoria={handleAdicionarCategoria}
      />
      <ModalConfirmacao
        // Remonta a cada alvo novo: sem isso o modo (cancelar/excluir) e o campo de
        // confirmação vazariam de uma remoção para a seguinte — uma viagem aberta
        // depois de uma despesa já apareceria direto no modo de exclusão.
        key={confirmacao ? `${confirmacao.rotulo}-${confirmacao.id}` : "nenhum"}
        alvo={confirmacao}
        onCancelar={onCancelarViagem}
        onExcluir={confirmacao?.rotulo === "despesa" ? onExcluirDespesa : onExcluirViagem}
        onFechar={() => setConfirmacao(null)}
      />
    </div>
  );
}

export default App;

import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { Toaster, toast } from "sonner";
import { Plus } from "lucide-react";
import useTransporteData from "@/hooks/useTransporteData";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import MenuLateral from "@/components/MenuLateral";
import AreaConteudo from "@/components/AreaConteudo";
import { ROTA_INICIAL } from "@/lib/navegacao";
import ModalQuickAdd from "@/components/ModalQuickAdd";
import ModalEditarViagem from "@/components/ModalEditarViagem";
import ModalEditarDespesa from "@/components/ModalEditarDespesa";
import ModalConfirmacao from "@/components/ModalConfirmacao";

// O SidebarProvider do shadcn GRAVA o estado do menu no cookie `sidebar_state`, mas não o
// lê: no Next.js, de onde o componente vem, quem lê é o servidor e passa em `defaultOpen`.
// Aqui não há servidor, então sem esta função o menu voltaria aberto a cada recarga —
// exatamente o que o critério 6 da spec 04 proíbe.
function menuAbertoPorPadrao() {
  const achado = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
  return achado ? achado[1] === "true" : true;
}

// Layout de todas as telas com sessão: menu lateral, área de conteúdo e os modais. Só é
// montado com sessão ativa — quem garante isso é o PortaoSessao, que também passa o
// `onSair`. As telas em si vivem em src/paginas/ e entram pelo <Outlet>.
//
// Os dados e os rascunhos de formulário ficam AQUI, acima das rotas, de propósito: o
// useTransporteData dispara buscarDados() na montagem, então descer esse estado para as
// telas faria cada troca de aba recarregar o Supabase e apagar formulário pela metade.
function App({ onSair }) {
  const { pathname } = useLocation();
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
    // Spec 02 — ordens de pagamento. Ficam aqui, no layout, pelo mesmo motivo dos demais
    // dados: as telas financeiras não podem recarregar a cada navegação.
    listaOrdens,
    resumoOrdens,
    inicioControle,
    criarOrdemComViagens,
    incluirViagensNaOrdem,
    tirarViagemDaOrdem,
    fecharOrdem,
    receberOrdem,
    reabrirOrdem,
    desfazerRecebimento,
    editarNota,
    excluirOrdem,
    quitarNoLegado,
    // Spec 03 — repasses entre as empresas.
    aliquotas,
    movimentos,
    devidos,
    saldoEntreEmpresas,
    salvarMovimento,
    editarMovimento,
    excluirMovimento,
    salvarAliquota,
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
    // `defaultOpen` só é lido na montagem; daí em diante o componente cuida do estado e
    // regrava o cookie a cada vez que o menu recolhe ou expande.
    <SidebarProvider defaultOpen={menuAbertoPorPadrao()}>
      <MenuLateral onSair={onSair} />

      <SidebarInset>
        <AreaConteudo>
          {/* Cada tela recebe daqui o que precisa. Os dados e os rascunhos ficam neste
              componente, acima das rotas: trocar de tela não remonta o useTransporteData,
              então não há nova carga do Supabase nem formulário apagado pela metade. */}
          <Outlet
            context={{
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
              onSalvarViagem,
              onSalvarDespesa,
              abrirEdicaoViagem,
              abrirEdicaoDespesa,
              onAdicionarCliente: handleAdicionarCliente,
              onAdicionarMotorista: handleAdicionarMotorista,
              onAdicionarCaminhao: handleAdicionarCaminhao,
              onAdicionarCategoria: handleAdicionarCategoria,
              // Spec 02. As ações devolvem o erro do banco cru (TRV01), e cada tela o
              // mostra no toast — a mensagem já vem escrita para o usuário.
              listaOrdens,
              resumoOrdens,
              inicioControle,
              criarOrdemComViagens,
              incluirViagensNaOrdem,
              tirarViagemDaOrdem,
              fecharOrdem,
              receberOrdem,
              reabrirOrdem,
              desfazerRecebimento,
              editarNota,
              excluirOrdem,
              quitarNoLegado,
              // Spec 03
              aliquotas,
              movimentos,
              devidos,
              saldoEntreEmpresas,
              salvarMovimento,
              editarMovimento,
              excluirMovimento,
              salvarAliquota,
            }}
          />
        </AreaConteudo>

        {/* Atalho para a tarefa mais comum do dia, só no celular e fora da própria tela de
            Nova viagem. No computador o menu já deixa o item a um clique. */}
        {pathname !== ROTA_INICIAL && (
          <Button
            asChild
            size="lg"
            className="fixed bottom-5 right-5 z-20 h-14 rounded-full shadow-lg md:hidden">
            <Link to={ROTA_INICIAL}>
              <Plus aria-hidden="true" />
              Nova viagem
            </Link>
          </Button>
        )}
      </SidebarInset>

      <Toaster richColors position="bottom-center" />
      <ModalQuickAdd
        key={modalKey}
        modal={modal}
        onClose={() => setModal(null)}
      />
      <ModalEditarViagem
        key={edicaoKey}
        viagem={viagemEditando}
        // A ordem da viagem, quando há uma: é ela que decide o que fica travado no
        // formulário (spec 02).
        ordem={
          viagemEditando?.ordem_id
            ? listaOrdens.find((o) => o.id === viagemEditando.ordem_id) ?? null
            : null
        }
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
    </SidebarProvider>
  );
}

export default App;

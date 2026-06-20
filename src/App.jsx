import { useState } from "react";
import { Toaster, toast } from "sonner";
import useTransporteData from "@/hooks/useTransporteData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ViagemForm from "@/components/ViagemForm";
import DespesaForm from "@/components/DespesaForm";
import Dashboard from "@/components/Dashboard";
import ModalQuickAdd from "@/components/ModalQuickAdd";

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
    adicionarCliente,
    adicionarMotorista,
    adicionarCaminhao,
    adicionarCategoria,
  } = useTransporteData();

  const [modal, setModal] = useState(null);
  const [modalKey, setModalKey] = useState(0);

  const openModal = (config) => {
    setModal(config);
    setModalKey((k) => k + 1);
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
    </div>
  );
}

export default App;

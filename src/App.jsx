import { useState } from "react";
import useTransporteData from "./hooks/useTransporteData";
import TabNav from "./components/TabNav";
import ViagemForm from "./components/ViagemForm";
import DespesaForm from "./components/DespesaForm";
import FiltrosRelatorio from "./components/FiltrosRelatorio";
import ResumoFinanceiro from "./components/ResumoFinanceiro";
import TabelasRelatorio from "./components/TabelasRelatorio";
import DiarioViagens from "./components/DiarioViagens";
import Toast from "./components/Toast";
import ModalQuickAdd from "./components/ModalQuickAdd";
import "./App.css";

function App() {
  const {
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
    listaCategorias,
    handleSalvarViagem,
    handleSalvarDespesa,
    adicionarCliente,
    adicionarMotorista,
    adicionarCaminhao,
    adicionarCategoria,
    gerarRelatorio,
  } = useTransporteData();

  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [modalKey, setModalKey] = useState(0);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openModal = (config) => {
    setModal(config);
    setModalKey((k) => k + 1);
  };

  const onSalvarViagem = async (e) => {
    try {
      await handleSalvarViagem(e);
      showToast("Viagem salva com sucesso! 🚀");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const onSalvarDespesa = async (e) => {
    try {
      await handleSalvarDespesa(e);
      showToast("Despesa registrada! 💸");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleAdicionarCliente = () => {
    openModal({
      title: "Novo Cliente",
      fields: [{ key: "nome", label: "Nome", placeholder: "Nome do cliente" }],
      onConfirm: async (values) => {
        try {
          await adicionarCliente(values.nome);
          showToast("Cliente adicionado!");
        } catch (err) {
          showToast(err.message, "error");
        }
      },
    });
  };

  const handleAdicionarMotorista = () => {
    openModal({
      title: "Novo Motorista",
      fields: [{ key: "nome", label: "Nome", placeholder: "Nome do motorista" }],
      onConfirm: async (values) => {
        try {
          await adicionarMotorista(values.nome);
          showToast("Motorista adicionado!");
        } catch (err) {
          showToast(err.message, "error");
        }
      },
    });
  };

  const handleAdicionarCaminhao = () => {
    openModal({
      title: "Novo Caminhão",
      fields: [
        { key: "placa", label: "Placa", placeholder: "Ex: ABC-1234" },
        { key: "modelo", label: "Modelo", placeholder: "Ex: Volvo FH" },
      ],
      onConfirm: async (values) => {
        try {
          await adicionarCaminhao(values.placa, values.modelo);
          showToast("Caminhão adicionado!");
        } catch (err) {
          showToast(err.message, "error");
        }
      },
    });
  };

  const handleAdicionarCategoria = () => {
    openModal({
      title: "Nova Categoria",
      fields: [{ key: "nome", label: "Categoria", placeholder: "Ex: Combustível, Pedágio..." }],
      onConfirm: async (values) => {
        try {
          await adicionarCategoria(values.nome);
          showToast("Categoria adicionada!");
        } catch (err) {
          showToast(err.message, "error");
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading-overlay">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <TabNav modo={modo} onModo={setModo} />

      {modo === "viagem" && (
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
      )}

      {modo === "despesa" && (
        <DespesaForm
          despesa={despesa}
          setDespesa={setDespesa}
          listaCategorias={listaCategorias}
          onSalvar={onSalvarDespesa}
          onAdicionarCategoria={handleAdicionarCategoria}
        />
      )}

      <div className="card" style={{ borderTop: "4px solid #2563eb" }}>
        <h2>📊 Relatório Gerencial</h2>
        <FiltrosRelatorio filtro={filtro} setFiltro={setFiltro} onGerar={gerarRelatorio} />
        <ResumoFinanceiro relatorio={relatorio} />
        <TabelasRelatorio relatorio={relatorio} />
      </div>

      <DiarioViagens listaViagens={listaViagens} />

      <Toast toast={toast} />
      <ModalQuickAdd key={modalKey} modal={modal} onClose={() => setModal(null)} />
    </div>
  );
}

export default App;

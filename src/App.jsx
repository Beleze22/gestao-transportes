import useTransporteData from "./hooks/useTransporteData";
import TabNav from "./components/TabNav";
import ViagemForm from "./components/ViagemForm";
import DespesaForm from "./components/DespesaForm";
import FiltrosRelatorio from "./components/FiltrosRelatorio";
import ResumoFinanceiro from "./components/ResumoFinanceiro";
import TabelasRelatorio from "./components/TabelasRelatorio";
import DiarioViagens from "./components/DiarioViagens";
import "./App.css";

function App() {
  const {
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
    listaCategorias,
    handleSalvarViagem,
    handleSalvarDespesa,
    adicionarCliente,
    adicionarMotorista,
    adicionarCaminhao,
    adicionarCategoria,
    gerarRelatorio,
  } = useTransporteData();

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
          onSalvar={handleSalvarViagem}
          onAdicionarCliente={adicionarCliente}
          onAdicionarMotorista={adicionarMotorista}
          onAdicionarCaminhao={adicionarCaminhao}
        />
      )}

      {modo === "despesa" && (
        <DespesaForm
          despesa={despesa}
          setDespesa={setDespesa}
          listaCategorias={listaCategorias}
          onSalvar={handleSalvarDespesa}
          onAdicionarCategoria={adicionarCategoria}
        />
      )}

      <div className="card" style={{ borderTop: "4px solid #2563eb" }}>
        <h2>📊 Relatório Gerencial</h2>
        <FiltrosRelatorio filtro={filtro} setFiltro={setFiltro} onGerar={gerarRelatorio} />
        <ResumoFinanceiro relatorio={relatorio} />
        <TabelasRelatorio relatorio={relatorio} />
      </div>

      <DiarioViagens listaViagens={listaViagens} />
    </div>
  );
}

export default App;

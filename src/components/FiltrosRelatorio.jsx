export default function FiltrosRelatorio({ filtro, setFiltro, onGerar }) {
  return (
    <div className="filtros-container">
      <div style={{ flex: 1 }}>
        <label>Início:</label>
        <input
          type="date"
          onChange={(e) => setFiltro({ ...filtro, dataInicio: e.target.value })}
        />
      </div>
      <div style={{ flex: 1 }}>
        <label>Fim:</label>
        <input
          type="date"
          onChange={(e) => setFiltro({ ...filtro, dataFim: e.target.value })}
        />
      </div>
      <div style={{ flex: 1 }}>
        <label>Empresa:</label>
        <select onChange={(e) => setFiltro({ ...filtro, empresa: e.target.value })}>
          <option value="">Todas</option>
          <option value="Rohan">Rohan</option>
          <option value="TransBeleze">TransBeleze</option>
        </select>
      </div>
      <button
        className="btn-save"
        style={{ background: "#6f42c1", marginTop: "0" }}
        onClick={onGerar}
      >
        Gerar
      </button>
    </div>
  );
}

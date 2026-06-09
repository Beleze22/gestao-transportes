export default function DespesaForm({
  despesa,
  setDespesa,
  listaCategorias,
  onSalvar,
  onAdicionarCategoria,
}) {
  return (
    <div className="card" style={{ borderTop: "4px solid #dc2626" }}>
      <h2>Nova Despesa</h2>
      <form onSubmit={onSalvar}>
        <label>Empresa Pagadora:</label>
        <select
          value={despesa.empresa}
          onChange={(e) => setDespesa({ ...despesa, empresa: e.target.value })}
          required
        >
          <option value="">Selecione...</option>
          <option value="Rohan">Rohan</option>
          <option value="TransBeleze">TransBeleze</option>
        </select>

        <label>Data:</label>
        <input
          type="date"
          value={despesa.data}
          onChange={(e) => setDespesa({ ...despesa, data: e.target.value })}
          required
        />

        <label>Categoria:</label>
        <div className="input-group">
          <select
            value={despesa.categoria}
            onChange={(e) => setDespesa({ ...despesa, categoria: e.target.value })}
            required
          >
            <option value="">Selecione...</option>
            {listaCategorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.categoria}
              </option>
            ))}
          </select>
          <button type="button" className="btn-add" onClick={onAdicionarCategoria}>
            +
          </button>
        </div>

        <label>Descrição:</label>
        <input
          type="text"
          placeholder="Ex: Troca de óleo, Pneu..."
          value={despesa.descricao}
          onChange={(e) => setDespesa({ ...despesa, descricao: e.target.value })}
        />

        <label>Valor (R$):</label>
        <input
          type="number"
          placeholder="0.00"
          value={despesa.valor}
          onChange={(e) => setDespesa({ ...despesa, valor: e.target.value })}
          required
        />

        <button
          type="submit"
          className="btn-save"
          style={{ backgroundColor: "#dc2626" }}
        >
          Salvar Despesa
        </button>
      </form>
    </div>
  );
}

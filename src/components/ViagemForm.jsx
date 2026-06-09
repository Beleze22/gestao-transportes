export default function ViagemForm({
  viagem,
  setViagem,
  listaClientes,
  listaMotoristas,
  listaCaminhoes,
  onSalvar,
  onAdicionarCliente,
  onAdicionarMotorista,
  onAdicionarCaminhao,
}) {
  return (
    <div className="card">
      <h2>Nova Viagem</h2>
      <form onSubmit={onSalvar}>
        <label>Empresa:</label>
        <select
          value={viagem.empresa}
          onChange={(e) => setViagem({ ...viagem, empresa: e.target.value })}
          required
        >
          <option value="">Selecione...</option>
          <option value="Rohan">Rohan</option>
          <option value="TransBeleze">TransBeleze</option>
        </select>

        <label>Data:</label>
        <input
          type="date"
          value={viagem.data}
          onChange={(e) => setViagem({ ...viagem, data: e.target.value })}
          required
        />

        <label>Cliente:</label>
        <div className="input-group">
          <select
            value={viagem.cliente_id}
            onChange={(e) => setViagem({ ...viagem, cliente_id: e.target.value })}
            required
          >
            <option value="">Selecione...</option>
            {listaClientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button type="button" className="btn-add" onClick={onAdicionarCliente}>
            +
          </button>
        </div>

        <label>Motorista:</label>
        <div className="input-group">
          <select
            value={viagem.motorista_id}
            onChange={(e) => setViagem({ ...viagem, motorista_id: e.target.value })}
            required
          >
            <option value="">Selecione...</option>
            {listaMotoristas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <button type="button" className="btn-add" onClick={onAdicionarMotorista}>
            +
          </button>
        </div>

        <label>Caminhão:</label>
        <div className="input-group">
          <select
            value={viagem.caminhao_id}
            onChange={(e) => setViagem({ ...viagem, caminhao_id: e.target.value })}
            required
          >
            <option value="">Selecione...</option>
            {listaCaminhoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.placa}
              </option>
            ))}
          </select>
          <button type="button" className="btn-add" onClick={onAdicionarCaminhao}>
            +
          </button>
        </div>

        <label>Valores (R$):</label>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            type="number"
            placeholder="Frete"
            value={viagem.valorFrete}
            onChange={(e) => setViagem({ ...viagem, valorFrete: e.target.value })}
            required
          />
          <input
            type="number"
            placeholder="Pgto Mot."
            value={viagem.valorMotorista}
            onChange={(e) => setViagem({ ...viagem, valorMotorista: e.target.value })}
            required
          />
        </div>

        <button type="submit" className="btn-save">
          Salvar Viagem
        </button>
      </form>
    </div>
  );
}

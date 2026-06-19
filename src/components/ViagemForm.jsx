import { useState } from "react";

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
  const [mostrarLogistica, setMostrarLogistica] = useState(false);

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
          />
          <input
            type="number"
            placeholder="Pgto Mot."
            value={viagem.valorMotorista}
            onChange={(e) => setViagem({ ...viagem, valorMotorista: e.target.value })}
          />
        </div>

        <button
          type="button"
          className="btn-toggle-logistica"
          onClick={() => setMostrarLogistica((v) => !v)}
        >
          {mostrarLogistica ? "▲ Ocultar logística" : "▼ Logística (opcional)"}
        </button>

        {mostrarLogistica && (
          <div className="logistica-section">
            <label>Local de carregamento:</label>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                placeholder="Origem"
                value={viagem.localCarregamento}
                onChange={(e) => setViagem({ ...viagem, localCarregamento: e.target.value })}
                style={{ flex: 1 }}
              />
              <input
                type="time"
                value={viagem.horarioCarregamento}
                onChange={(e) => setViagem({ ...viagem, horarioCarregamento: e.target.value })}
                style={{ width: "110px", flex: "none" }}
              />
            </div>

            <label>Local de descarregamento:</label>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                placeholder="Destino"
                value={viagem.localDescarregamento}
                onChange={(e) => setViagem({ ...viagem, localDescarregamento: e.target.value })}
                style={{ flex: 1 }}
              />
              <input
                type="time"
                value={viagem.horarioDescarregamento}
                onChange={(e) => setViagem({ ...viagem, horarioDescarregamento: e.target.value })}
                style={{ width: "110px", flex: "none" }}
              />
            </div>

            <label>Observações:</label>
            <textarea
              placeholder="Informações adicionais..."
              value={viagem.observacoes}
              onChange={(e) => setViagem({ ...viagem, observacoes: e.target.value })}
              rows={3}
            />
          </div>
        )}

        <button type="submit" className="btn-save">
          Salvar Viagem 🚛
        </button>
      </form>
    </div>
  );
}

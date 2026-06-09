export default function TabelasRelatorio({ relatorio }) {
  return (
    <div
      style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginTop: "20px" }}
    >
      <div style={{ flex: 1, minWidth: "300px" }}>
        <h3>💰 Faturamento (Clientes)</h3>
        <div className="table-container">
          <table>
            <tbody>
              {Object.entries(relatorio.porCliente).map(([nome, valor]) => (
                <tr key={nome}>
                  <td>{nome}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }}>
                    R$ {valor.toFixed(2)}
                  </td>
                </tr>
              ))}
              {Object.keys(relatorio.porCliente).length === 0 && (
                <tr>
                  <td colSpan="2">Sem dados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: "300px" }}>
        <h3>👷 Pagamentos (Motoristas)</h3>
        <div className="table-container">
          <table>
            <tbody>
              {Object.entries(relatorio.porMotorista).map(([nome, valor]) => (
                <tr key={nome}>
                  <td>{nome}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }}>
                    R$ {valor.toFixed(2)}
                  </td>
                </tr>
              ))}
              {Object.keys(relatorio.porMotorista).length === 0 && (
                <tr>
                  <td colSpan="2">Sem dados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: "300px" }}>
        <h3>📉 Gastos por Categoria</h3>
        <div className="table-container">
          <table>
            <tbody>
              {Object.entries(relatorio.porCategoriaDespesa).map(([nome, valor]) => (
                <tr key={nome}>
                  <td>{nome}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }}>
                    R$ {valor.toFixed(2)}
                  </td>
                </tr>
              ))}
              {Object.keys(relatorio.porCategoriaDespesa).length === 0 && (
                <tr>
                  <td colSpan="2">Sem dados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

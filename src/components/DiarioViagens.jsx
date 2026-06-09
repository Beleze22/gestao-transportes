export default function DiarioViagens({ listaViagens }) {
  const hoje = new Date();
  const viagensDoMes = listaViagens.filter((i) => {
    const d = new Date(i.data + "T12:00:00");
    return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
  });

  return (
    <div className="card">
      <h2>📅 Diário de Viagens (Mês)</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Empresa</th>
              <th>Cliente</th>
              <th>Frete</th>
            </tr>
          </thead>
          <tbody>
            {viagensDoMes.map((i) => (
              <tr key={i.id}>
                <td>
                  {new Date(i.data + "T12:00:00").toLocaleDateString("pt-PT")}
                </td>
                <td>{i.empresa}</td>
                <td>{i.clientes?.nome}</td>
                <td>{i.valor_frete != null ? i.valor_frete.toFixed(2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STATUS_CONFIG = {
  rascunho: { label: "Rascunho", classe: "badge-rascunho" },
  confirmada: { label: "Confirmada", classe: "badge-confirmada" },
  confirmada_sem_valor: { label: "Sem valor", classe: "badge-sem-valor" },
  realizada_pendente: { label: "Pend. valor", classe: "badge-pendente" },
  concluida: { label: "Concluída", classe: "badge-concluida" },
  cancelada: { label: "Cancelada", classe: "badge-cancelada" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status || "—", classe: "badge-rascunho" };
  return <span className={`badge ${cfg.classe}`}>{cfg.label}</span>;
}

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
              <th>Status</th>
              <th>Frete</th>
            </tr>
          </thead>
          <tbody>
            {viagensDoMes.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "#9ca3af" }}>
                  Nenhuma viagem este mês
                </td>
              </tr>
            )}
            {viagensDoMes.map((i) => (
              <tr key={i.id}>
                <td>{new Date(i.data + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                <td>{i.empresa}</td>
                <td>{i.clientes?.nome || "—"}</td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
                <td>{i.valor_frete != null ? `R$ ${i.valor_frete.toFixed(2)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

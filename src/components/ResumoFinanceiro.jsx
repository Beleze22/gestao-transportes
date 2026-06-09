export default function ResumoFinanceiro({ relatorio }) {
  return (
    <div
      style={{
        background: "#f8fafc",
        padding: "15px",
        borderRadius: "8px",
        marginTop: "20px",
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}
      >
        <span>Faturamento Total:</span>
        <strong style={{ color: "#16a34a" }}>
          R$ {relatorio.totalFaturamento.toFixed(2)}
        </strong>
      </div>
      <div
        style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}
      >
        <span>Pgto Motoristas:</span>
        <strong style={{ color: "#dc2626" }}>
          - R$ {relatorio.totalPagoMotoristas.toFixed(2)}
        </strong>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "10px",
          paddingBottom: "10px",
          borderBottom: "1px dashed #ccc",
        }}
      >
        <span>Outras Despesas:</span>
        <strong style={{ color: "#dc2626" }}>
          - R$ {relatorio.totalDespesas.toFixed(2)}
        </strong>
      </div>
      <div
        style={{ display: "flex", justifyContent: "space-between", fontSize: "1.2rem" }}
      >
        <span>LUCRO LÍQUIDO:</span>
        <strong style={{ color: relatorio.lucroLiquido >= 0 ? "#16a34a" : "#dc2626" }}>
          R$ {relatorio.lucroLiquido.toFixed(2)}
        </strong>
      </div>
    </div>
  );
}

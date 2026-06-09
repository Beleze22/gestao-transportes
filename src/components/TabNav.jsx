export default function TabNav({ modo, onModo }) {
  return (
    <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
      <button
        onClick={() => onModo("viagem")}
        className="btn-save"
        style={{
          backgroundColor: modo === "viagem" ? "#2563eb" : "#ddd",
          color: modo === "viagem" ? "#fff" : "#333",
        }}
      >
        Viagem
      </button>
      <button
        onClick={() => onModo("despesa")}
        className="btn-save"
        style={{
          backgroundColor: modo === "despesa" ? "#dc2626" : "#ddd",
          color: modo === "despesa" ? "#fff" : "#333",
        }}
      >
        Despesa
      </button>
    </div>
  );
}

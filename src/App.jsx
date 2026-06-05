import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

function App() {
  // --- ESTADOS DE CONTROLE DE TELA ---
  const [modo, setModo] = useState("viagem"); // 'viagem' ou 'despesa'

  // --- ESTADOS DE DADOS (FORMULÁRIOS) ---
  const [viagem, setViagem] = useState({
    empresa: "",
    data: "",
    cliente_id: "",
    motorista_id: "",
    caminhao_id: "",
    valorFrete: "",
    valorMotorista: "",
  });

  const [despesa, setDespesa] = useState({
    empresa: "",
    data: "",
    categoria: "",
    descricao: "",
    valor: "",
  });

  // --- ESTADOS DE LISTAS (BANCO DE DADOS) ---
  const [listaClientes, setListaClientes] = useState([]);
  const [listaMotoristas, setListaMotoristas] = useState([]);
  const [listaCaminhoes, setListaCaminhoes] = useState([]);
  const [listaViagens, setListaViagens] = useState([]);
  const [listaDespesas, setListaDespesas] = useState([]);
  const [listaCategorias, setListaCategorias] = useState([]);

  // Lista local de categorias (padrão + as que adicionares)
  // const [listaCategorias, setListaCategorias] = useState([
  //   "Abastecimento",
  //   "Manutenção",
  //   "Pedágio",
  //   "Estacionamento",
  //   "Administrativo",
  //   "Alimentação",
  //   "Outros",
  // ]);

  // --- ESTADOS PARA RELATÓRIOS ---
  const [filtro, setFiltro] = useState({
    dataInicio: "",
    dataFim: "",
    empresa: "",
  });

  const [relatorio, setRelatorio] = useState({
    totalFaturamento: 0,
    totalPagoMotoristas: 0,
    totalDespesas: 0,
    lucroLiquido: 0,
    porCliente: {},
    porMotorista: {},
    porCategoriaDespesa: {},
  });

  // --- BUSCAR DADOS DO BANCO ---
  const buscarDados = async () => {
    // 1. Auxiliares
    const { data: cli } = await supabase.from("clientes").select("*");
    if (cli) setListaClientes(cli);
    const { data: mot } = await supabase.from("motoristas").select("*");
    if (mot) setListaMotoristas(mot);
    const { data: cam } = await supabase.from("caminhoes").select("*");
    if (cam) setListaCaminhoes(cam);
    const { data: cat } = await supabase.from("categoriasdespesas").select("*");
    if (cat) setListaCategorias(cat);

    // 2. Viagens
    const { data: via } = await supabase
      .from("viagens")
      .select(`*, clientes(nome), motoristas(nome), caminhoes(placa)`)
      .order("data", { ascending: false });
    if (via) setListaViagens(via);

    // 3. Despesas
    const { data: desp } = await supabase
      .from("despesas")
      .select(
        `
          *,
          categoriasdespesas (categoria)
        `,
      )
      .order("data", { ascending: false });
    if (desp) setListaDespesas(desp);
  };

  useEffect(() => {
    buscarDados();
  }, []);

  // --- FUNÇÕES DE ADICIONAR (BOTÕES +) ---
  const adicionarCliente = async () => {
    const nome = prompt("Nome do novo Cliente:");
    if (!nome) return;
    const { data, error } = await supabase
      .from("clientes")
      .insert([{ nome }])
      .select();
    if (!error) {
      setListaClientes([...listaClientes, data[0]]);
      alert("Cliente adicionado!");
    }
  };

  const adicionarMotorista = async () => {
    const nome = prompt("Nome do novo Motorista:");
    if (!nome) return;
    const { data, error } = await supabase
      .from("motoristas")
      .insert([{ nome }])
      .select();
    if (!error) {
      setListaMotoristas([...listaMotoristas, data[0]]);
      alert("Motorista adicionado!");
    }
  };

  const adicionarCaminhao = async () => {
    const placa = prompt("Placa do Caminhão:");
    if (!placa) return;
    const modelo = prompt("Modelo:");
    const { data, error } = await supabase
      .from("caminhoes")
      .insert([{ placa, modelo }])
      .select();
    if (!error) {
      setListaCaminhoes([...listaCaminhoes, data[0]]);
      alert("Caminhão adicionado!");
    }
  };

  const adicionarCategoria = () => {
    const nova = prompt("Nova Categoria de Despesa:");
    if (nova) {
      setListaCategorias([...listaCategorias, nova]);
      // Já seleciona a nova automaticamente
      setDespesa({ ...despesa, categoria: nova });
    }
  };

  // --- SALVAR VIAGEM ---
  const handleSalvarViagem = async (e) => {
    e.preventDefault();
    if (
      !viagem.empresa ||
      !viagem.cliente_id ||
      !viagem.motorista_id ||
      !viagem.caminhao_id
    ) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }
    try {
      const { error } = await supabase.from("viagens").insert([
        {
          empresa: viagem.empresa,
          data: viagem.data,
          cliente_id: viagem.cliente_id,
          motorista_id: viagem.motorista_id,
          caminhao_id: viagem.caminhao_id,
          valor_frete: parseFloat(viagem.valorFrete),
          valor_motorista: parseFloat(viagem.valorMotorista),
        },
      ]);
      if (error) throw error;
      alert("Viagem salva! 🚀");
      buscarDados();
      setViagem({
        empresa: "",
        data: "",
        cliente_id: "",
        motorista_id: "",
        caminhao_id: "",
        valorFrete: "",
        valorMotorista: "",
      });
    } catch (error) {
      alert("Erro: " + error.message);
    }
  };

  // --- SALVAR DESPESA ---
  const handleSalvarDespesa = async (e) => {
    e.preventDefault();
    if (
      !despesa.empresa ||
      !despesa.data ||
      !despesa.valor ||
      !despesa.categoria
    ) {
      alert("Preencha os campos obrigatórios.");
      return;
    }
    try {
      const { error } = await supabase.from("despesas").insert([
        {
          empresa: despesa.empresa,
          data: despesa.data,
          categoria: despesa.categoria,
          descricao: despesa.descricao,
          valor: parseFloat(despesa.valor),
          // Removi o caminhao_id daqui conforme solicitado
        },
      ]);
      if (error) throw error;
      alert("Despesa registrada! 💸");
      buscarDados();
      setDespesa({
        empresa: "",
        data: "",
        categoria: "",
        valor: "",
        descricao: "",
      });
    } catch (error) {
      alert("Erro: " + error.message);
    }
  };

  // --- GERAR RELATÓRIO COMPLETO ---
  const gerarRelatorio = () => {
    let totalFrete = 0;
    let totalMot = 0;
    let totalGastos = 0;

    let clienteMap = {};
    let motoristaMap = {};
    let categoriaMap = {};

    // 1. Processar Viagens
    listaViagens.forEach((v) => {
      if (filtro.empresa && v.empresa !== filtro.empresa) return;
      if (filtro.dataInicio && v.data < filtro.dataInicio) return;
      if (filtro.dataFim && v.data > filtro.dataFim) return;

      totalFrete += v.valor_frete;
      totalMot += v.valor_motorista;

      // Agrupamento Cliente
      const nomeCli = v.clientes?.nome || "Outros";
      if (!clienteMap[nomeCli]) clienteMap[nomeCli] = 0;
      clienteMap[nomeCli] += v.valor_frete;

      // Agrupamento Motorista
      const nomeMot = v.motoristas?.nome || "Outros";
      if (!motoristaMap[nomeMot]) motoristaMap[nomeMot] = 0;
      motoristaMap[nomeMot] += v.valor_motorista;
    });

    // 2. Processar Despesas
    listaDespesas.forEach((d) => {
      if (filtro.empresa && d.empresa !== filtro.empresa) return;
      if (filtro.dataInicio && d.data < filtro.dataInicio) return;
      if (filtro.dataFim && d.data > filtro.dataFim) return;

      totalGastos += d.valor;

      const nomeCategoria = d.categoriasdespesas?.categoria || "Sem Categoria";

      if (!categoriaMap[nomeCategoria]) categoriaMap[nomeCategoria] = 0;
      categoriaMap[nomeCategoria] += d.valor;
    });

    setRelatorio({
      totalFaturamento: totalFrete,
      totalPagoMotoristas: totalMot,
      totalDespesas: totalGastos,
      lucroLiquido: totalFrete - totalMot - totalGastos,
      porCliente: clienteMap,
      porMotorista: motoristaMap,
      porCategoriaDespesa: categoriaMap,
    });
  };

  return (
    <div className="app-container">
      {/* BOTÕES DE ABA (TABS) */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
        <button
          onClick={() => setModo("viagem")}
          className="btn-save"
          style={{
            backgroundColor: modo === "viagem" ? "#2563eb" : "#ddd",
            color: modo === "viagem" ? "#fff" : "#333",
          }}
        >
          Viagem
        </button>
        <button
          onClick={() => setModo("despesa")}
          className="btn-save"
          style={{
            backgroundColor: modo === "despesa" ? "#dc2626" : "#ddd",
            color: modo === "despesa" ? "#fff" : "#333",
          }}
        >
          Despesa
        </button>
      </div>

      {/* --- FORMULÁRIO DE VIAGEM --- */}
      {modo === "viagem" && (
        <div className="card">
          <h2>Nova Viagem</h2>
          <form onSubmit={handleSalvarViagem}>
            <label>Empresa:</label>
            <select
              value={viagem.empresa}
              onChange={(e) =>
                setViagem({ ...viagem, empresa: e.target.value })
              }
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
                onChange={(e) =>
                  setViagem({ ...viagem, cliente_id: e.target.value })
                }
                required
              >
                <option value="">Selecione...</option>
                {listaClientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-add"
                onClick={adicionarCliente}
              >
                +
              </button>
            </div>

            <label>Motorista:</label>
            <div className="input-group">
              <select
                value={viagem.motorista_id}
                onChange={(e) =>
                  setViagem({ ...viagem, motorista_id: e.target.value })
                }
                required
              >
                <option value="">Selecione...</option>
                {listaMotoristas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-add"
                onClick={adicionarMotorista}
              >
                +
              </button>
            </div>

            <label>Caminhão:</label>
            <div className="input-group">
              <select
                value={viagem.caminhao_id}
                onChange={(e) =>
                  setViagem({ ...viagem, caminhao_id: e.target.value })
                }
                required
              >
                <option value="">Selecione...</option>
                {listaCaminhoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.placa}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-add"
                onClick={adicionarCaminhao}
              >
                +
              </button>
            </div>

            <label>Valores (R$):</label>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                type="number"
                placeholder="Frete"
                value={viagem.valorFrete}
                onChange={(e) =>
                  setViagem({ ...viagem, valorFrete: e.target.value })
                }
                required
              />
              <input
                type="number"
                placeholder="Pgto Mot."
                value={viagem.valorMotorista}
                onChange={(e) =>
                  setViagem({ ...viagem, valorMotorista: e.target.value })
                }
                required
              />
            </div>
            <button type="submit" className="btn-save">
              Salvar Viagem
            </button>
          </form>
        </div>
      )}

      {/* --- FORMULÁRIO DE DESPESA --- */}
      {modo === "despesa" && (
        <div className="card" style={{ borderTop: "4px solid #dc2626" }}>
          <h2>Nova Despesa</h2>
          <form onSubmit={handleSalvarDespesa}>
            <label>Empresa Pagadora:</label>
            <select
              value={despesa.empresa}
              onChange={(e) =>
                setDespesa({ ...despesa, empresa: e.target.value })
              }
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
                onChange={(e) =>
                  setDespesa({ ...despesa, categoria: e.target.value })
                }
                required
              >
                <option value="">Selecione...</option>
                {listaCategorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.categoria}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-add"
                onClick={adicionarCategoria}
              >
                +
              </button>
            </div>

            <label>Descrição:</label>
            <input
              type="text"
              placeholder="Ex: Troca de óleo, Pneu..."
              value={despesa.descricao}
              onChange={(e) =>
                setDespesa({ ...despesa, descricao: e.target.value })
              }
            />

            <label>Valor (R$):</label>
            <input
              type="number"
              placeholder="0.00"
              value={despesa.valor}
              onChange={(e) =>
                setDespesa({ ...despesa, valor: e.target.value })
              }
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
      )}

      {/* --- RELATÓRIOS COMPLETOS --- */}
      <div className="card" style={{ borderTop: "4px solid #2563eb" }}>
        <h2>📊 Relatório Gerencial</h2>

        {/* Filtros */}
        <div className="filtros-container">
          <div style={{ flex: 1 }}>
            <label>Início:</label>
            <input
              type="date"
              onChange={(e) =>
                setFiltro({ ...filtro, dataInicio: e.target.value })
              }
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Fim:</label>
            <input
              type="date"
              onChange={(e) =>
                setFiltro({ ...filtro, dataFim: e.target.value })
              }
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Empresa:</label>
            <select
              onChange={(e) =>
                setFiltro({ ...filtro, empresa: e.target.value })
              }
            >
              <option value="">Todas</option>
              <option value="Rohan">Rohan</option>
              <option value="TransBeleze">TransBeleze</option>
            </select>
          </div>
          <button
            className="btn-save"
            style={{ background: "#6f42c1", marginTop: "0" }}
            onClick={gerarRelatorio}
          >
            Gerar
          </button>
        </div>

        {/* Resumo Financeiro (NOVO) */}
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
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "5px",
            }}
          >
            <span>Faturamento Total:</span>
            <strong style={{ color: "#16a34a" }}>
              R$ {relatorio.totalFaturamento.toFixed(2)}
            </strong>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "5px",
            }}
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
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "1.2rem",
            }}
          >
            <span>LUCRO LÍQUIDO:</span>
            <strong
              style={{
                color: relatorio.lucroLiquido >= 0 ? "#16a34a" : "#dc2626",
              }}
            >
              R$ {relatorio.lucroLiquido.toFixed(2)}
            </strong>
          </div>
        </div>

        {/* Detalhes Antigos (RESTAUTADOS) */}
        <div
          style={{
            display: "flex",
            gap: "20px",
            flexWrap: "wrap",
            marginTop: "20px",
          }}
        >
          {/* Tabela Clientes */}
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

          {/* Tabela Motoristas */}
          <div style={{ flex: 1, minWidth: "300px" }}>
            <h3>👷 Pagamentos (Motoristas)</h3>
            <div className="table-container">
              <table>
                <tbody>
                  {Object.entries(relatorio.porMotorista).map(
                    ([nome, valor]) => (
                      <tr key={nome}>
                        <td>{nome}</td>
                        <td style={{ textAlign: "right", fontWeight: "bold" }}>
                          R$ {valor.toFixed(2)}
                        </td>
                      </tr>
                    ),
                  )}
                  {Object.keys(relatorio.porMotorista).length === 0 && (
                    <tr>
                      <td colSpan="2">Sem dados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabela Categorias de Despesas */}
          <div style={{ flex: 1, minWidth: "300px" }}>
            <h3>📉 Gastos por Categoria</h3>
            <div className="table-container">
              <table>
                <tbody>
                  {Object.entries(relatorio.porCategoriaDespesa).map(
                    ([nome, valor]) => (
                      <tr key={nome}>
                        <td>{nome}</td>
                        <td style={{ textAlign: "right", fontWeight: "bold" }}>
                          R$ {valor.toFixed(2)}
                        </td>
                      </tr>
                    ),
                  )}
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
      </div>

      {/* --- TABELA DIÁRIO --- */}
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
              {listaViagens
                .filter((i) => {
                  const d = new Date(i.data + "T12:00:00");
                  const h = new Date();
                  return (
                    d.getMonth() === h.getMonth() &&
                    d.getFullYear() === h.getFullYear()
                  );
                })
                .map((i) => (
                  <tr key={i.id}>
                    <td>
                      {new Date(i.data + "T12:00:00").toLocaleDateString(
                        "pt-PT",
                      )}
                    </td>
                    <td>{i.empresa}</td>
                    <td>{i.clientes?.nome}</td>
                    <td>{i.valor_frete.toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;

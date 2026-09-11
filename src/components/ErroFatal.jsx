import { Component } from "react";

// Error boundary. Sem um, qualquer exceção durante a renderização faz o React desmontar
// a árvore inteira e a tela fica branca — sem mensagem, sem pista, impossível
// diagnosticar à distância. Este componente transforma isso numa mensagem legível que a
// pessoa consegue copiar e mandar.
//
// Tudo aqui usa estilo embutido de propósito: ele precisa aparecer mesmo quando o CSS do
// app é justamente o que está quebrado.
//
// Atenção a um limite do React: error boundaries NÃO capturam exceções lançadas dentro de
// manipuladores de evento (um onClick, um onValueChange). Essas são cobertas pelo
// window.onerror instalado no index.html.
export default class ErroFatal extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null, pilha: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    this.setState({ pilha: info?.componentStack ?? null });
    console.error("[ErroFatal]", erro, info);
  }

  relatorio() {
    const { erro, pilha } = this.state;
    return [
      `Erro: ${erro?.message ?? erro}`,
      `Navegador: ${navigator.userAgent}`,
      `Tela: ${window.innerWidth}x${window.innerHeight}`,
      `Quando: ${new Date().toISOString()}`,
      "",
      erro?.stack ?? "",
      pilha ? `\nComponentes:${pilha}` : "",
    ].join("\n");
  }

  render() {
    if (!this.state.erro) return this.props.children;

    const { erro } = this.state;
    const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

    // A tela é desenhada para ser FOTOGRAFADA por alguém que não é técnico: a instrução
    // vem antes de tudo, a mensagem do erro é o maior texto da página, e nada tem
    // rolagem própria — numa caixa rolável a foto pegaria só um pedaço.
    return (
      <div
        style={{
          font: "15px/1.6 system-ui, Segoe UI, Arial, sans-serif",
          maxWidth: "640px",
          margin: "0 auto",
          padding: "24px 16px 48px",
          color: "#18181b",
          background: "#fff",
        }}>
        <h1 style={{ margin: "0 0 4px", fontSize: "20px" }}>Algo deu errado nesta tela</h1>
        <p style={{ margin: "0 0 20px", color: "#52525b" }}>
          Seus dados estão salvos. Nada foi perdido.
        </p>

        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: "8px",
            padding: "14px 16px",
            margin: "0 0 20px",
            fontSize: "16px",
            fontWeight: 600,
          }}>
          📸 Tire uma foto desta tela inteira e envie para quem cuida do sistema.
        </div>

        <div
          style={{
            border: "2px solid #18181b",
            borderRadius: "8px",
            overflow: "hidden",
            margin: "0 0 16px",
          }}>
          <div
            style={{
              background: "#18181b", color: "#fff", padding: "6px 12px",
              font: "600 11px/1.4 " + mono, letterSpacing: ".1em",
            }}>
            MENSAGEM DO ERRO
          </div>
          <p
            style={{
              margin: 0, padding: "14px 12px",
              font: "600 15px/1.45 " + mono,
              wordBreak: "break-word",
            }}>
            {String(erro?.message ?? erro)}
          </p>
          <p
            style={{
              margin: 0, padding: "10px 12px", borderTop: "1px solid #e4e4e7",
              font: "11px/1.5 " + mono, color: "#52525b", wordBreak: "break-word",
            }}>
            {navigator.userAgent}
            <br />
            {new Date().toLocaleString("pt-BR")} · tela {window.innerWidth}×
            {window.innerHeight}
          </p>
        </div>

        {/* Detalhe técnico: útil se a foto pegar, dispensável se não pegar. */}
        <pre
          style={{
            font: "10px/1.45 " + mono,
            color: "#71717a",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: "0 0 20px",
          }}>
          {erro?.stack ?? ""}
          {this.state.pilha ?? ""}
        </pre>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              font: "inherit", padding: "10px 18px", borderRadius: "6px",
              border: "1px solid #18181b", background: "#18181b", color: "#fff",
              cursor: "pointer",
            }}>
            Recarregar a página
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(this.relatorio())}
            style={{
              font: "inherit", padding: "10px 18px", borderRadius: "6px",
              border: "1px solid #d4d4d8", background: "#fff", color: "#52525b",
              cursor: "pointer",
            }}>
            Copiar texto
          </button>
        </div>
      </div>
    );
  }
}

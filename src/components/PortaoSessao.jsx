import useSessao from "@/hooks/useSessao";
import Login from "@/components/Login";
import App from "@/App";

// Portão de sessão — a raiz do app, montada pelo main.jsx.
//
// Por que o portão fica ACIMA do App, e não dentro dele: o useTransporteData dispara
// buscarDados() num useEffect de montagem, e hook não pode ser condicional. Se o App fosse
// montado sem sessão, as seis chamadas a /rest/v1 sairiam antes de qualquer verificação.
// Depois da migration 004 essas leituras não dariam erro — o PostgREST responde 200 com
// lista vazia —, e o Dashboard mostraria faturamento zero como se fosse verdade. Com o
// portão aqui, sem sessão o App simplesmente não existe e nenhuma consulta acontece.
//
// É também o que apaga os dados da memória ao sair: no SIGNED_OUT (logout, ou renovação de
// token que falhou) o App desmonta e todo o estado do useTransporteData morre com ele — não
// há o que limpar à mão. A `key` com o id do usuário faz o mesmo na troca de gerente sem
// recarregar a página.
//
// A spec 04 reorganiza isto com rotas (`/entrar`) e move o botão Sair para o menu lateral.
export default function PortaoSessao() {
  const { carregando, sessao, entrar, sair } = useSessao();

  // Mesmo spinner da carga de dados: enquanto a sessão guardada no localStorage não foi
  // lida, mostrar o login faria a tela piscar a cada recarga.
  if (carregando) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!sessao) return <Login onEntrar={entrar} />;

  return <App key={sessao.user.id} sessao={sessao} onSair={sair} />;
}

import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import useSessao from "@/hooks/useSessao";
import Login from "@/components/Login";
import App from "@/App";
import NovaViagem from "@/paginas/NovaViagem";
import NovaDespesa from "@/paginas/NovaDespesa";
import Painel from "@/paginas/Painel";
import AFaturar from "@/paginas/AFaturar";
import Ordens from "@/paginas/Ordens";
import Ordem from "@/paginas/Ordem";
import Legado from "@/paginas/Legado";
import { ROTA_INICIAL } from "@/lib/navegacao";

// Manda para o login guardando de onde a pessoa veio, para voltar à tela certa depois de
// entrar. `replace` para o botão voltar não cair de novo na rota barrada.
function ExigirSessao() {
  const { pathname, search } = useLocation();
  return <Navigate to="/entrar" state={{ de: pathname + search }} replace />;
}

// Portão de sessão e roteamento — a raiz do app, montada pelo main.jsx.
//
// `useSessao` roda uma vez só, aqui: duas chamadas criariam duas inscrições no
// onAuthStateChange e dois estados que podem divergir por um instante.
//
// Por que o portão fica ACIMA do App, e não dentro dele: o useTransporteData dispara
// buscarDados() num useEffect de montagem, e hook não pode ser condicional. Se o App fosse
// montado sem sessão, as seis chamadas a /rest/v1 sairiam antes de qualquer verificação —
// e elas não dariam erro, porque leitura barrada por RLS volta como lista vazia (a
// migration 004). O Painel mostraria faturamento zero como se fosse verdade.
//
// É também o que apaga os dados da memória ao sair: no SIGNED_OUT (logout, ou renovação de
// token que falhou) o App desmonta e todo o estado do useTransporteData morre com ele. A
// `key` com o id do usuário faz o mesmo na troca de gerente sem recarregar a página.
export default function PortaoSessao() {
  const { carregando, sessao, entrar, sair } = useSessao();

  // Enquanto a sessão guardada no localStorage não foi lida, mostrar o login faria a tela
  // piscar a cada recarga.
  if (carregando) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Já logado, a tela de login não tem o que fazer: devolve para o app. */}
        <Route
          path="/entrar"
          element={sessao ? <VoltarDoLogin /> : <Login onEntrar={entrar} />}
        />

        {/* Sem sessão, a rota-layout renderiza o redireciono em vez do <Outlet> — e as
            telas filhas nem chegam a montar. */}
        <Route element={sessao ? <App key={sessao.user.id} onSair={sair} /> : <ExigirSessao />}>
          <Route path="/viagens/nova" element={<NovaViagem />} />
          <Route path="/despesas/nova" element={<NovaDespesa />} />
          <Route path="/painel" element={<Painel />} />
          <Route path="/financeiro/a-faturar" element={<AFaturar />} />
          <Route path="/financeiro/ordens" element={<Ordens />} />
          <Route path="/financeiro/ordens/:id" element={<Ordem />} />
          <Route path="/financeiro/legado" element={<Legado />} />
          {/* A raiz e qualquer endereço desconhecido caem na tarefa mais comum do dia. */}
          <Route path="*" element={<Navigate to={ROTA_INICIAL} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

// Volta para a rota que a pessoa tentou abrir antes de ser mandada ao login. Sem isso,
// quem clicou num link para o Painel cairia em Nova viagem depois de entrar.
function VoltarDoLogin() {
  const { state } = useLocation();
  return <Navigate to={state?.de ?? ROTA_INICIAL} replace />;
}

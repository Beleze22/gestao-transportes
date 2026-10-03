import { useLocation } from "react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { temCabecalhoProprio, tituloDaRota } from "@/lib/navegacao";

// A área de conteúdo ao lado do menu: a barra do celular (três listras + nome da tela), o
// título da tela no computador, e as margens de docs/design.md — 32 px em cima e 40 px dos
// lados no computador, 16 px no celular.
//
// O nome da tela sai da rota, via ITENS_MENU, nos dois lugares em que aparece. É o que
// impede o menu dizer "Nova viagem" e a tela dizer outra coisa.
//
// O SidebarTrigger do shadcn não serve para o botão: ele desenha o ícone de painel, não as
// três listras do protótipo, e traz um "Toggle Sidebar" em inglês embutido.
export default function AreaConteudo({ children }) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const titulo = tituloDaRota(pathname);

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-1 border-b bg-card px-2 md:hidden">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpenMobile(true)}
          aria-label="Abrir menu"
          className="size-11 flex-none text-brand-green">
          <Menu aria-hidden="true" className="!size-5" />
        </Button>
        <h1 className="truncate text-lg font-bold text-brand-green">{titulo}</h1>
      </header>

      <div className="p-4 pb-24 md:px-10 md:py-8 md:pb-10">
        {/* No celular o título já está na barra acima; repetir gastaria altura de tela. E
            nas telas do Financeiro ele vem do próprio cabeçalho delas, com subtítulo e
            números ao lado. */}
        {!temCabecalhoProprio(pathname) && (
          <h1 className="mb-5 hidden text-2xl font-bold text-brand-green md:block">{titulo}</h1>
        )}
        {children}
      </div>
    </>
  );
}

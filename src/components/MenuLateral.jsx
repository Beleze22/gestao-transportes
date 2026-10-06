import { NavLink, useLocation } from "react-router";
import { LogOut, PanelLeft } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ITENS_FINANCEIRO, ITENS_LANCAMENTO, ITENS_RODAPE } from "@/lib/navegacao";

// Altura dos itens: 48 px no celular e 44 px no computador (docs/design.md). O
// `group-data-[collapsible=icon]` existe porque o próprio shadcn força 32 px no modo
// recolhido, e o protótipo pede 44 px também ali.
const ALTURA_ITEM =
  "h-12 md:h-11 gap-3.5 px-3 text-[15px] group-data-[collapsible=icon]:!size-11 [&>svg]:size-5";

export default function MenuLateral({ onSair }) {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile, toggleSidebar, state } = useSidebar();

  // No celular o menu é uma gaveta sobre o conteúdo: escolher um item tem de fechá-la,
  // senão a tela escolhida fica atrás do painel escuro.
  const fecharNoCelular = () => {
    if (isMobile) setOpenMobile(false);
  };

  // O item fica ativo também nas rotas abaixo dele: estando em /financeiro/ordens/12, é
  // "Ordens" que precisa aparecer marcado no menu.
  const estaAtivo = (rota) => pathname === rota || pathname.startsWith(`${rota}/`);

  // O ícone é usado como `item.icone` e não desestruturado: o eslint deste projeto não
  // conta uso em JSX, e um `const Icone = item.icone` viraria erro de variável não usada —
  // o mesmo falso positivo que o Dashboard tem (veja MELHORIAS.md).
  const desenharItem = (item) => (
    <SidebarMenuItem key={item.rota}>
      {/* `tooltip` só aparece no modo recolhido e fora do celular — é a dica com o nome do
          item que o critério 6 da spec 04 pede. */}
      <SidebarMenuButton
        asChild
        isActive={estaAtivo(item.rota)}
        tooltip={item.rotulo}
        className={ALTURA_ITEM}>
        <NavLink to={item.rota} onClick={fecharNoCelular}>
          <item.icone aria-hidden="true" />
          <span>{item.rotulo}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-0 p-3 group-data-[collapsible=icon]:items-center">
        <div className="flex items-center gap-2.5">
          <img
            src="/rohan-brasao-transparente.png"
            alt="Rohan Transportes"
            className="h-10 w-10 flex-none object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          {/* No modo recolhido sobra só o brasão. */}
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-[13px] font-bold uppercase tracking-[0.12em] text-brand-gold">
              Rohan Transportes
            </p>
            <p className="mt-0.5 truncate text-[11px] text-sidebar-foreground/60">
              Sistema de gestão
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{ITENS_LANCAMENTO.map(desenharItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* O grupo financeiro tem rótulo, os lançamentos não — é o que o protótipo do
            celular mostra. No modo recolhido o shadcn esconde o rótulo sozinho, senão a
            palavra "Financeiro" apareceria cortada numa coluna de 68 px. */}
        <SidebarGroup>
          <SidebarGroupLabel>Financeiro</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{ITENS_FINANCEIRO.map(desenharItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {/* Configuração vem antes do Sair: é item de navegação, e o Sair fecha a lista. */}
          {ITENS_RODAPE.map(desenharItem)}

          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSair} tooltip="Sair" className={ALTURA_ITEM}>
              <LogOut aria-hidden="true" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Recolher e expandir. O mesmo atalho Ctrl+B vem de dentro do
              SidebarProvider. No celular este item não faz sentido: lá o menu é gaveta,
              e quem fecha é o botão do cabeçalho ou um toque fora. */}
          {!isMobile && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleSidebar}
                tooltip="Expandir menu"
                aria-label={state === "collapsed" ? "Expandir menu" : "Recolher menu"}
                className={`${ALTURA_ITEM} border border-sidebar-border`}>
                <PanelLeft aria-hidden="true" />
                <span>Recolher menu</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

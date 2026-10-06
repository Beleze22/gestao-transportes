import {
  ArrowLeftRight, ChartColumn, ClipboardList, FileText, History, Percent, Receipt, Truck,
} from "lucide-react";

export const ROTA_INICIAL = "/viagens/nova";

// Fonte única dos itens de menu: o MenuLateral desenha a partir daqui, e o cabeçalho do
// celular tira daqui o título da tela. Duas listas separadas divergiriam na primeira
// renomeação.
//
// Os ícones são os do protótipo (docs/design/prototipo/), conferidos pelo desenho e não
// pelo nome: o `path` do SVG de cada item foi casado contra o pacote lucide.
//
// Itens de telas que ainda não existem NÃO entram aqui — a spec 04 não admite link morto.
// Com a spec 03 o menu fica completo: nada mais está previsto.
export const ITENS_MENU = [
  { rota: ROTA_INICIAL, rotulo: "Nova viagem", icone: Truck },
  { rota: "/despesas/nova", rotulo: "Nova despesa", icone: Receipt },
  { rota: "/painel", rotulo: "Painel", icone: ChartColumn },
  { grupo: "Financeiro", rota: "/financeiro/a-faturar", rotulo: "A faturar", icone: ClipboardList },
  { grupo: "Financeiro", rota: "/financeiro/ordens", rotulo: "Ordens", icone: FileText },
  { grupo: "Financeiro", rota: "/financeiro/legado", rotulo: "Legado a conferir", icone: History },
  { grupo: "Financeiro", rota: "/financeiro/entre-empresas", rotulo: "Entre empresas", icone: ArrowLeftRight },
  // Alíquotas fica no RODAPÉ do menu, acima do Sair: é configuração, consultada uma vez por
  // mês, não um lugar de trabalho diário (docs/design.md e a tabela da spec 04).
  { grupo: "rodape", rota: "/configuracoes/aliquotas", rotulo: "Alíquotas", icone: Percent },
];

// O menu desenha em três blocos: os lançamentos, sem rótulo de grupo; o Financeiro com
// rótulo; e o rodapé. A ordem dentro de cada um é a de ITENS_MENU.
export const ITENS_LANCAMENTO = ITENS_MENU.filter((i) => !i.grupo);
export const ITENS_FINANCEIRO = ITENS_MENU.filter((i) => i.grupo === "Financeiro");
export const ITENS_RODAPE = ITENS_MENU.filter((i) => i.grupo === "rodape");

// As telas do Financeiro desenham o próprio cabeçalho: além do título, elas têm uma frase
// explicando a tela e os números-resumo à direita (docs/design.md), e a AreaConteudo não
// tem como conhecer esses números. Nessas rotas ela não repete o <h1>.
//
// A barra do celular continua tirando o título daqui, de ITENS_MENU, para o nome na barra
// e o nome no menu nunca divergirem.
export const temCabecalhoProprio = (caminho) =>
  caminho.startsWith("/financeiro/") || caminho.startsWith("/configuracoes/");

// O detalhe da ordem (`/financeiro/ordens/:id`) não é item de menu, mas precisa de título
// na barra do celular — e o "Ordens" do item não serve, porque a tela é de uma ordem só.
export function tituloDaRota(caminho) {
  const item = ITENS_MENU.find((i) => i.rota === caminho);
  if (item) return item.rotulo;

  const ordem = caminho.match(/^\/financeiro\/ordens\/(\d+)$/);
  if (ordem) return `Ordem #${ordem[1]}`;

  return "";
}

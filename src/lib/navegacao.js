import { ChartColumn, Receipt, Truck } from "lucide-react";

export const ROTA_INICIAL = "/viagens/nova";

// Fonte única dos itens de menu: o MenuLateral desenha a partir daqui, e o cabeçalho do
// celular tira daqui o título da tela. Duas listas separadas divergiriam na primeira
// renomeação.
//
// Os ícones são os do protótipo (docs/design/prototipo/), conferidos pelo desenho e não
// pelo nome: o `path` do SVG de cada item foi casado contra o pacote lucide.
//
// Itens de telas que ainda não existem NÃO entram aqui — a spec 04 não admite link morto.
// As specs 02 e 03 acrescentam o grupo "Financeiro" (A faturar, Ordens, Legado, Entre
// empresas) e Alíquotas no rodapé.
export const ITENS_MENU = [
  { rota: ROTA_INICIAL, rotulo: "Nova viagem", icone: Truck },
  { rota: "/despesas/nova", rotulo: "Nova despesa", icone: Receipt },
  { rota: "/painel", rotulo: "Painel", icone: ChartColumn },
];

export function tituloDaRota(caminho) {
  return ITENS_MENU.find((item) => item.rota === caminho)?.rotulo ?? "";
}

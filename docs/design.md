# Guia de design

Referência visual aprovada: `docs/design/prototipo/*.dc.html`. Esses arquivos são protótipos
estáticos, com estilos escritos em cada elemento e dados inventados. Use-os para ver
**o que** vai na tela e **como fica**. Não copie o HTML nem os estilos inline: reconstrua com
Tailwind, os componentes shadcn de `src/components/ui/` e as variáveis de `src/index.css`.

Os dados dos protótipos (clientes, valores, datas) são fictícios.

## Identidade

- Verde-escuro e dourado são a marca e já existem em `index.css` (`--brand-green`,
  `--brand-gold`). O dourado também é `--primary`.
- Fonte do sistema, como hoje. Não adicionar fonte nova.
- Caixa alta só no nome da marca ("ROHAN TRANSPORTES", "SISTEMA DE GESTÃO"). Títulos, rótulos
  e botões em caixa normal.

## Cores e seus papéis

Toda cor vem de uma variável em `index.css`. Se faltar uma, crie a variável (em oklch, como as
existentes) e use-a pelo nome; não escreva hex solto em componente.

| Papel | Referência no protótipo | Variável |
| --- | --- | --- |
| Fundo do menu, títulos de página | `#0b200f` | `--brand-green` (já existe) |
| Item ativo do menu, fundo | `#1b351f` | nova: `--sidebar-accent` |
| Ação principal, item ativo do menu (ícone), contadores | `#ce911b` | `--primary` / `--brand-gold` (já existe) |
| Texto sobre o dourado | `#020c04` | `--primary-foreground` (já existe) |
| Fundo da página | `#f7f9f7` | `--background` (já existe) |
| Cartões | `#ffffff` | `--card` (já existe) |
| Bordas | `#dbdfdb` | `--border` (já existe) |
| Texto secundário | `#606560` | `--muted-foreground` (já existe) |
| Cabeçalho de tabela | `#eef3ef` | `--secondary` (já existe) |
| Etiqueta Rohan | fundo `#e6ede7`, texto `#1b351f` | novas: `--empresa-rohan`, `--empresa-rohan-foreground` |
| Etiqueta TransBeleze | fundo `#fbefd6`, texto `#6e4a00` | novas: `--empresa-tb`, `--empresa-tb-foreground` |
| Ordem aberta | fundo `#eef0ee`, texto `#3d423d` | novas: `--status-aberta*` |
| Ordem fechada | mesmas cores da etiqueta TransBeleze | novas: `--status-fechada*` |
| Ordem recebida | mesmas cores da etiqueta Rohan | novas: `--status-recebida*` |
| Vencida, alerta | fundo `#f7dcd8`, texto `#8a1f15` | novas: `--status-vencida*` |
| Despesas em gráficos e valores | `#9e3a31` | nova: `--despesa` (substitui o `#f87171` do gráfico atual) |

As variáveis `--sidebar-*` do componente Sidebar do shadcn devem ser definidas a partir dessas
cores, para o menu não herdar o tema padrão do shadcn.

## Estrutura das telas

- **Menu lateral:** 68 px recolhido, 240 px aberto; no celular, gaveta de 300 px. Itens de
  44 px de altura no computador e 48 px no celular. Grupos: lançamentos (Nova viagem, Nova
  despesa, Painel), Financeiro (com rótulo do grupo), e rodapé (Alíquotas, Sair, recolher).
- **Área de conteúdo:** margem de 32 px em cima e 40 px dos lados no computador; 16 px no
  celular.
- **Cabeçalho de página:** título à esquerda (24 px, negrito, verde-escuro), uma frase curta em
  texto secundário explicando a tela quando ela não for óbvia, e os números-resumo à direita.
- **Formulários:** um cartão de até 640 px de largura, com campos em duas colunas quando couber.
  Ao lado, a lista "Lançadas hoje". Botão principal ocupando a largura do cartão.
- **Listas agrupadas** (A faturar, Legado): um cartão por cliente. O grupo aberto mostra a tabela
  com caixas de seleção e um rodapé com o resumo da seleção e as ações. Grupos fechados mostram
  só nome, quantidade e totais.
- **Tabelas:** dentro de cartão, cabeçalho em fundo `--secondary`, texto de 12 px nos títulos das
  colunas, linhas separadas por borda fina. Valores alinhados à direita.

## Componentes

Use os do shadcn antes de criar qualquer coisa: Sidebar, Sheet, Tooltip, Button, Card, Table,
Badge, Select, Input, Label, Textarea, Dialog. Instale pela CLI do shadcn os que faltarem. Não
adicione outra biblioteca de UI.

- **Botões:** um só botão dourado (principal) por área. Secundários com contorno. O texto diz a
  ação e, quando ajuda, a quantidade: "Criar ordem com 4 viagens", "Confirmar recebimento".
- **Etiquetas** (empresa, situação): Badge com as cores da tabela acima, cantos totalmente
  arredondados, texto de 12 px em negrito.
- **Escolha entre duas opções** (empresa): dois botões lado a lado, o escolhido em verde com
  texto branco. Por trás, é um grupo de rádios acessível.
- **Destaque de pendência:** faixa de cabeçalho clara com um contador dourado, como em
  "Aguardando valor" no Painel. Não usar borda colorida na lateral do cartão.

## Números e datas

- Moeda sempre `R$ 1.234,56`, via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Números em tabelas e resumos com `tabular-nums`, para as colunas alinharem.
- Datas em tabelas: `dd/mm`. Em campos, cabeçalhos e detalhes: `dd/mm/aaaa`.
- Direção de valor entre empresas escrita por extenso ("TransBeleze deve R$ 362,00 à Rohan"),
  nunca só com sinal de mais ou menos.

## Celular (abaixo de 768 px)

- O menu vira gaveta; o botão de três listras fica no topo, com o título da tela.
- Botão fixo "Nova viagem" no canto inferior direito, exceto na própria tela de Nova viagem.
- Tabelas viram listas de cartões. Pode sair: trajeto, motorista, colunas de detalhe. Não pode
  sair: data, cliente, empresa, valor, situação e as ações.
- Alvos de toque com pelo menos 44 px.

## Acessibilidade e texto

- Botão só com ícone tem `aria-label`. Ícones decorativos com `aria-hidden`.
- Foco visível em tudo que é clicável.
- Cor nunca é a única informação: situação e empresa sempre têm texto.
- Textos em português, frases curtas, sem jargão técnico. Mensagens de erro dizem o que fazer.

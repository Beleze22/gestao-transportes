# Spec 04 — Navegação lateral e endereços por tela

Ordem de implementação: depois da Spec 01, antes da Spec 02.
Protótipo: `docs/design/prototipo/` (NovaViagem, Main, Ordem, CelularMenu, CelularAFaturar). Regras visuais: `docs/design.md`.

## Problema

As três abas no topo (Viagem, Despesa, Dashboard) não comportam as telas que vêm nas Specs 02 e 03. Além disso, a aba aberta é só um estado da tela: recarregar a página volta sempre para "Viagem", o botão voltar do Android fecha o site em vez de voltar à tela anterior, e não dá para abrir uma tela direto por um link.

Uso real: lançar viagens é a tarefa diária mais comum, seguida de despesas. O financeiro é consultado periodicamente. Os gerentes usam mais o computador, mas o site precisa funcionar no celular, podendo esconder informação secundária.

## Escopo

| Lado | Afetado? | O quê |
| --- | --- | --- |
| Web | Sim | Menu lateral, rotas com URL própria, cabeçalho movido para o menu, botão fixo de nova viagem no celular |
| Supabase | Não | Nenhuma mudança de schema, RLS ou dado |
| Agente | Não | Nenhuma mudança |

Fica de fora: dividir o `Dashboard.jsx` em telas menores, telas novas de cadastro, e qualquer mudança no conteúdo dos formulários e do Dashboard, além da troca do seletor de empresa por dois botões (ver abaixo). As telas financeiras chegam com as Specs 02 e 03.

## Mudanças no Supabase

Nenhuma.

## Mudanças na web

**Menu lateral** com o componente Sidebar do shadcn, instalado pela CLI do shadcn junto com as dependências que ele pede (sheet, tooltip, skeleton e o hook de detecção de celular).

- Computador: modo recolhido em ícones (`collapsible="icon"`), com dica mostrando o nome ao passar o mouse. Abre e fecha por um botão no rodapé do menu e por Ctrl+B. O menu não abre sozinho ao passar o mouse. O estado aberto ou recolhido é lembrado entre visitas.
- Celular (abaixo de 768 px): o menu vira uma gaveta que desliza da esquerda, aberta pelo botão de três listras no topo. Escolher um item fecha a gaveta.
- O brasão e o nome "Rohan Transportes" saem do cabeçalho atual e passam para o topo do menu. No modo recolhido, só o brasão.
- Cores e medidas conforme `docs/design.md`.

**Itens do menu e rotas**

| Item | Rota | Nesta spec |
| --- | --- | --- |
| Nova viagem | `/viagens/nova` | Formulário atual. É a tela inicial: `/` redireciona para cá |
| Nova despesa | `/despesas/nova` | Formulário atual |
| Painel | `/painel` | Dashboard atual, sem mudança de conteúdo |
| Financeiro: A faturar | `/financeiro/a-faturar` | Chega na Spec 02 |
| Financeiro: Ordens | `/financeiro/ordens` e `/financeiro/ordens/:id` | Chega na Spec 02 |
| Financeiro: Legado | `/financeiro/legado` | Chega na Spec 02 |
| Financeiro: Entre empresas | `/financeiro/entre-empresas` | Chega na Spec 03 |
| Alíquotas (rodapé) | `/configuracoes/aliquotas` | Chega na Spec 03 |
| Sair (rodapé) | ação | Da Spec 01 |
| Entrar | `/entrar` | Tela de login da Spec 01 |

Itens de telas que ainda não existem não aparecem no menu. Não há link morto. Uma rota desconhecida leva para `/viagens/nova`.

**Roteamento** com `react-router`. O Netlify precisa servir o `index.html` para qualquer caminho, senão abrir `/painel` direto dá 404: um arquivo `public/_redirects` com a regra de fallback para SPA.

**Sessão (Spec 01) continua valendo:** sem sessão, qualquer rota leva a `/entrar`. Depois do login, o usuário volta para a rota que tentou abrir.

**Dados e rascunhos:** `useTransporteData` e o estado dos formulários ficam acima das rotas, no layout. Trocar de tela não recarrega os dados do Supabase e não apaga um formulário preenchido pela metade. Hoje, trocar de aba também não apaga; isso não pode piorar.

**Botão fixo "Nova viagem" no celular:** aparece no canto inferior direito em todas as telas, exceto na própria Nova viagem.

**Seletor de empresa nos formulários:** o select de empresa em Nova viagem e Nova despesa vira dois botões lado a lado (Rohan / TransBeleze), um clique a menos por lançamento. O valor gravado continua exatamente `Rohan` ou `TransBeleze`.

**Modais de edição** (viagem e despesa) continuam abrindo a partir do Painel, como hoje.

## Critérios de aceite

1. Cada item do menu tem URL própria. Recarregar a página mantém a tela aberta.
2. Abrir `https://<site>/painel` direto, em aba nova, abre o Painel (sem 404 do Netlify).
3. No celular, o botão voltar do navegador volta para a tela anterior do site.
4. `/` e uma rota inexistente levam para Nova viagem.
5. Sem sessão, abrir `/painel` leva para `/entrar`; depois do login, o Painel abre.
6. No computador, o menu recolhe e expande pelo botão e por Ctrl+B; recolhido, passar o mouse num ícone mostra o nome; o estado é lembrado depois de recarregar.
7. Em largura menor que 768 px, o menu some, o botão de três listras abre a gaveta, e escolher um item fecha a gaveta.
8. No celular, o botão "Nova viagem" aparece no Painel e some na própria tela de Nova viagem.
9. Preencher metade de uma viagem, ir ao Painel e voltar: o formulário continua preenchido. Ir e voltar não dispara nova carga de dados (conferir na aba Network).
10. Uma viagem lançada com o novo seletor de empresa grava `empresa` = `Rohan` ou `TransBeleze`, igual a antes.
11. Os totais do Painel de setembro/2026 são os mesmos de antes do deploy.
12. `npm run build` sem erro e `npx eslint src/` sem erro novo.

## Como testar

1. Anotar os totais do Painel de setembro/2026 (critério 11).
2. Rodar local com `npm run dev` e testar os critérios 1, 3 a 10 no computador e no modo celular do navegador.
3. O critério 2 só vale no Netlify: testar no deploy de preview, se houver, ou logo após o push na `stable`.
4. Push na `stable`. O agente é reconstruído junto, sem mudança de código.

## Riscos e reversão

| Risco | Consequência | Proteção |
| --- | --- | --- |
| Faltar o `_redirects` | Link direto ou recarga fora da raiz dá 404 no Netlify | Critério 2 |
| Estado dos formulários preso à rota | Rascunho perdido ao trocar de tela | Estado no layout; critério 9 |
| Dados recarregados a cada troca de tela | Lentidão e chamadas repetidas ao Supabase | Dados no layout; critério 9 |
| Componente do shadcn trazer tema próprio | Cores do menu fora da identidade | Variáveis `--sidebar-*` definidas no `index.css` a partir das cores da marca |

**Reversão:** revert do commit. Nenhum dado ou schema envolvido.

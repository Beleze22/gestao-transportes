# Spec 05 — Estacionamento na viagem

Pré-requisito: Specs 02 e 03 aplicadas (migrations até a 008).
Sem protótipo novo: o campo entra no formulário e nas tabelas que já existem, seguindo o `docs/design.md`.

## Problema

Em alguns fretes a empresa paga estacionamento e cobra esse valor do cliente. Hoje a única forma de registrar é somar ao frete. Isso esconde quanto foi estacionamento, e infla o faturamento com um dinheiro que só entrou para cobrir um gasto.

## Escopo

| Lado | Afetado? | O quê |
| --- | --- | --- |
| Supabase | Sim | Coluna `viagens.valor_estacionamento`; `ordens_resumo` soma o estacionamento no total; `trv_viagem_em_ordem` trava o campo em ordem fechada ou recebida |
| Web | Sim | Campo no formulário da viagem; estacionamento visível em A faturar, Legado, Ordem e na tabela do Painel; total à parte no Painel |
| Agente | Não | Não lê nem grava o campo. Insert e update dele continuam funcionando, porque a coluna nasce com 0. Fica registrado no `MELHORIAS.md` |

Fica de fora: lançar o estacionamento como despesa ligada à viagem, comprovante do pagamento, e qualquer outro adicional cobrado do cliente (pedágio, ajudante).

## Regras

1. **É um adendo da viagem.** A empresa paga e cobra do cliente. O campo é opcional; sem valor, vale zero. Não afeta o status da viagem.
2. **Painel: à parte, sem mexer no lucro.** Faturamento, gráficos e lucro continuam somando só o frete. O estacionamento do período aparece como reembolso, num número próprio. Ele não é lançado como despesa, então entrou e saiu sem mudar o resultado.
3. **Ordem: entra no total cobrado.** O total da ordem passa a ser frete + estacionamento das viagens dela. O estacionamento conta como parte da empresa que fez a viagem.
4. **Repasse: mesma fórmula.** A regra da Spec 03 não muda. Só *T* (total da ordem) e *V* (parte da outra empresa) passam a incluir o estacionamento, inclusive no imposto da nota.
5. **Travado junto com o frete.** Em ordem fechada, recebida ou quitação de legado, mudar o estacionamento é recusado com `TRV01`, como já acontece com o frete: muda o que foi cobrado do cliente.

Exemplo, com alíquota de 9%: viagem Rohan de R$ 1.000 e viagem TransBeleze de R$ 500 + R$ 30 de estacionamento. Total da ordem R$ 1.530; parte da TransBeleze R$ 530.

| Caso | Devido |
| --- | --- |
| sem nota, caiu na Rohan | Rohan deve R$ 530,00 à TransBeleze |
| nota Rohan, caiu na Rohan | Rohan deve R$ 482,30 à TransBeleze (530 × 0,91) |
| nota Rohan, caiu na TransBeleze | TransBeleze deve R$ 1.047,70 à Rohan (1.000 + 0,09 × 530) |

## Mudanças no Supabase

Migration `agent/migrations/009_estacionamento.sql`:

- `viagens.valor_estacionamento numeric not null default 0`, com `check (valor_estacionamento >= 0)`. Toda viagem existente fica com 0.
- `ordens_resumo`: `total`, `total_rohan` e `total_transbeleze` somam frete + estacionamento. Coluna nova no fim, `total_estacionamento`, para exibição. `devidos_entre_empresas` lê esses totais, então o repasse acompanha sem mudar.
- `trv_viagem_em_ordem`: `valor_estacionamento` entra na trava junto com frete, empresa e cliente. A versão vigente da função passa a ser a da 009. Entrar numa ordem **não** exige estacionamento.

## Mudanças na web

- `src/lib/viagem.js`: o formulário ganha `valorEstacionamento`; vazio grava 0.
- `src/lib/ordem.js`: `totaisPorEmpresa` soma frete + estacionamento, espelhando a view. `src/lib/repasse.js` não muda.
- `ViagemForm`: terceiro campo em "Valores (R$)", "Estacionamento", bloqueado nas mesmas condições do frete.
- Valor por viagem em A faturar, Legado, Ordem e na tabela do Painel: o frete, e embaixo, em texto secundário, "+ R$ 30,00 estacionamento" quando houver.
- Ordem: o total mostra a composição quando houver estacionamento ("frete R$ 1.500,00 + estacionamento R$ 30,00").
- Painel: no cartão de Faturamento, linha secundária "+ R$ X de estacionamento (reembolso)" quando houver no período.
- "Lançadas hoje" mostra o estacionamento quando houver.

## Critérios de aceite

1. Viagem existente fica com estacionamento 0. Um insert sem o campo (como o do agente) grava 0. Valor negativo é recusado.
2. Numa ordem com o exemplo acima, `ordens_resumo` mostra total 1.530, Rohan 1.000, TransBeleze 530 e estacionamento 30.
3. Recebida nos três casos da tabela, a ordem gera exatamente os devidos da tabela.
4. Uma ordem recebida antes da 009 tem o mesmo devido antes e depois da migration.
5. Com a ordem fechada, mudar o estacionamento de uma viagem dela é recusado com `TRV01`; com a ordem aberta, é aceito.
6. Os dois verificadores da Spec 03 (`03-repasses-testes.sql` e `03-repasses-verifica-formula.mjs`) continuam passando.
7. Na web, o estacionamento é gravado, editado e bloqueado junto com o frete; aparece em A faturar, Ordem e no Painel; a prévia do repasse inclui o valor.
8. Faturamento e lucro do Painel não mudam ao lançar estacionamento numa viagem.
9. `cd agent && npm test` passa sem mudança no agente.

## Como testar e ordem de deploy

A migration sobe antes da web: a web passa a gravar a coluna nova.

1. Rodar a 009 no SQL Editor; a conferência no fim deve sair toda `ok`.
2. Rodar `docs/verificacoes/009-estacionamento-testes.sql` (critérios 1 a 5, em begin/rollback) e os dois verificadores da Spec 03 (critério 6).
3. Push na `stable`.
4. Em produção: critérios 7 e 8 pelo roteiro manual.

## Riscos e reversão

| Risco | Consequência | Proteção |
| --- | --- | --- |
| Estacionamento já somado ao frete em viagens antigas | Valor contado como faturamento | Fora do escopo corrigir o passado; dá para editar a viagem e separar, se ela não estiver em ordem fechada |
| Lançar estacionamento pelo Telegram | O agente não conhece o campo e somaria ao frete ou ignoraria | Registrado no `MELHORIAS.md`; lançar pela web |
| Divergência entre `totaisPorEmpresa` e a view | Prévia do repasse diferente do devido gravado | Critérios 2, 3 e 7; a tela Entre empresas já avisa divergência no saldo |

**Reversão.** Web: revert do commit. Banco: script comentado no fim da 009, que devolve `ordens_resumo` e `trv_viagem_em_ordem` às versões anteriores e remove a coluna. Antes de rodar, exportar as viagens com estacionamento maior que zero.

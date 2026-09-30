# Spec 03 — Repasses entre empresas

Pré-requisito: Spec 02 aplicada.
Protótipo da tela: `docs/design/prototipo/EntreEmpresas.dc.html` e o bloco de recebimento em `Ordem.dc.html`.

## Problema

Toda ordem mista é paga numa única conta. A empresa que recebe precisa repassar à outra a parte das viagens dela, descontando o imposto quando o cliente exigiu nota. Hoje isso não fica registrado em lugar nenhum: não se sabe quanto uma empresa deve à outra nem o que já foi repassado.

O imposto é pago uma vez por mês, no mês seguinte, por quem emitiu a nota. Por isso o desconto no repasse usa uma alíquota estimada: a do mês anterior, arredondada um pouco para cima. Hoje ela é de 9%.

## Escopo

| Lado | Afetado? | O quê |
| --- | --- | --- |
| Supabase | Sim | Tabelas `aliquotas_repasse` e `movimentos_entre_empresas`, coluna `ordens_pagamento.aliquota_repasse`, view de devidos, travas na ordem recebida |
| Web | Sim | Tela "Entre empresas", prévia do repasse ao receber, tela de alíquotas |
| Agente | Não | Não lê nem grava nenhuma das tabelas novas. Perguntas como "quanto a TB deve à Rohan" ficam para a etapa 3 |

Fica de fora: ligar cada repasse às ordens que ele quita (o saldo funciona como conta corrente), saldo anterior a 01/10/2026 calculado automaticamente, e o cálculo da alíquota a partir das despesas de imposto.

## Regra de cálculo

Cada ordem recebida (e que não seja de legado) gera no máximo um valor devido: da empresa em cuja conta o dinheiro caiu para a outra. O imposto de cada viagem fica com a empresa que fez a viagem, mas quem paga o imposto da nota inteira é a empresa emissora.

Sendo *T* o total da ordem, *V* a parte das viagens da outra empresa e *a* a alíquota de repasse da emissora, gravada no recebimento:

- sem nota: devido = V
- nota emitida por quem recebeu o dinheiro: devido = V × (1 − a)
- nota emitida pela outra empresa: devido = V + a × (T − V)

No terceiro caso, quem recebeu repassa a parte da outra inteira e ainda devolve o imposto das próprias viagens, porque é a outra que vai pagá-lo. O valor é arredondado para centavos em cada ordem.

Exemplos com uma ordem de R$ 1.500 (R$ 1.000 de viagens da Rohan e R$ 500 da TransBeleze) e alíquota de 9%:

| Nota | Caiu na conta da | Devido |
| --- | --- | --- |
| Sem nota | Rohan | Rohan deve R$ 500,00 à TransBeleze |
| Emitida pela Rohan | Rohan | Rohan deve R$ 455,00 à TransBeleze |
| Emitida pela Rohan | TransBeleze | TransBeleze deve R$ 1.045,00 à Rohan |
| Emitida pela TransBeleze | Rohan | Rohan deve R$ 590,00 à TransBeleze |

Uma ordem só com viagens de quem recebeu o dinheiro e com nota dessa mesma empresa não gera devido.

## Mudanças no Supabase

Migration aditiva `agent/migrations/006_repasses.sql`, rodada à mão no SQL Editor dentro de uma transação.

**Tabela `aliquotas_repasse`:** uma linha por empresa, com `empresa` (chave primária, `Rohan` ou `TransBeleze`), `aliquota` (numeric, entre 0 e 1) e `atualizada_em` (timestamptz). Valor inicial: 9% para as duas empresas.

**Coluna nova `ordens_pagamento.aliquota_repasse`** (numeric): copiada da alíquota da empresa emissora no momento em que a ordem com nota passa para `recebida`, e apagada quando o recebimento é desfeito. Mudar a alíquota depois não altera ordens já recebidas.

**Tabela `movimentos_entre_empresas`:** `id`, `data`, `tipo`, `de_empresa`, `para_empresa`, `valor` (maior que zero), `observacao`, `criado_em`. `de_empresa` e `para_empresa` são diferentes entre si. Dois tipos:

- `repasse`: dinheiro que `de_empresa` transferiu para `para_empresa`. Reduz o que `de_empresa` deve.
- `ajuste`: dívida que `de_empresa` passa a ter com `para_empresa`, sem ordem por trás. Serve para lançar um saldo anterior a 01/10/2026 ou corrigir um erro. Exige observação.

**Nova trava na ordem recebida.** Com a ordem em `recebida`, não é possível alterar `com_nota`, `empresa_nota`, `empresa_recebedora`, `recebida_em` nem `aliquota_repasse`. Para corrigir, é preciso desfazer o recebimento e receber de novo. Usa o mesmo SQLSTATE `TRV01` da Spec 02.

**View `devidos_entre_empresas`**, com `security_invoker = true`: uma linha por ordem recebida que gera devido, com ordem, cliente, data do recebimento, devedora, credora, valor e alíquota usada. É a regra de cálculo aplicada sobre `ordens_resumo`. Nenhum devido é gravado.

**Saldo:** soma dos devidos mais os ajustes, menos os repasses, sempre no sentido TransBeleze → Rohan. Positivo, a TransBeleze deve à Rohan; negativo, o contrário. Pode ser uma segunda view ou cálculo na web.

**RLS:** as duas tabelas novas com RLS ativo e a policy "gerentes autenticados" da Spec 01.

**Impacto no agente:** nenhum. Ele não lê as tabelas novas, e a nova trava só atua em campos da ordem, que o agente não grava.

## Mudanças na web

As telas seguem o protótipo e o `docs/design.md`.

**Tela "Entre empresas"** (item do menu Financeiro):

- No topo, o saldo numa frase: "TransBeleze deve R$ X à Rohan", ou o contrário, ou "sem saldo".
- Um extrato em ordem de data, com cada devido (ordem, cliente, como foi calculado), cada repasse e cada ajuste, e o saldo acumulado linha a linha.
- Botões para registrar repasse (data, de, para, valor, observação) e lançar ajuste (observação obrigatória). Os dois podem ser editados ou excluídos.

**Ao receber uma ordem:** o diálogo mostra a prévia do devido, com a alíquota usada, antes de confirmar. No detalhe de uma ordem recebida, a mesma informação fica visível.

**Alíquotas:** tela simples (item do rodapé do menu) com a alíquota de cada empresa e a data da última atualização. Se a última atualização tiver mais de 35 dias, aparece um aviso em "Entre empresas" e no diálogo de recebimento, porque o valor deve mudar todo mês.

## Critérios de aceite

1. As quatro linhas da tabela de exemplos, montadas como ordens reais (R$ 1.000 Rohan + R$ 500 TransBeleze, alíquota 9%), geram exatamente os devidos da tabela, com devedora e credora corretas.
2. Uma ordem só com viagens da Rohan, com nota da Rohan, recebida na conta da Rohan, não gera devido.
3. Mudar a alíquota da Rohan de 9% para 10% não altera o devido de ordens já recebidas. Uma ordem recebida depois da mudança usa 10%.
4. Com a ordem recebida, alterar `com_nota`, `empresa_nota`, `empresa_recebedora`, `recebida_em` ou `aliquota_repasse` é recusado com `TRV01`.
5. Desfazer o recebimento tira o devido do extrato e apaga `aliquota_repasse` da ordem.
6. Ordens de legado não geram devido.
7. Depois do cenário do critério 1, o saldo mostrado bate com a conta feita à mão. Registrar um repasse no valor do saldo zera o saldo.
8. Um ajuste sem observação é recusado. Um movimento com `de_empresa` igual a `para_empresa`, ou com valor zero ou negativo, é recusado.
9. Sem sessão, um `GET` em `aliquotas_repasse`, `movimentos_entre_empresas` e `devidos_entre_empresas` devolve `[]`.
10. Com `atualizada_em` recuado 36 dias, o aviso de alíquota desatualizada aparece nos dois lugares.

## Como testar e ordem de deploy

A migration sobe antes da web. Ela é aditiva, e a única trava nova age em ordens recebidas, que a web da Spec 02 já só altera desfazendo o recebimento.

1. Anotar o saldo em aberto entre as empresas antes de 01/10/2026, se houver, para lançar como ajuste.
2. Rodar a 006 no SQL Editor.
3. Testar os critérios 1 a 9 em SQL, dentro de uma transação terminada em rollback, para não deixar ordens nem movimentos de teste.
4. Push na `stable`. O agente é reconstruído junto, sem mudança de código.
5. Em produção: conferir o saldo com as ordens reais recebidas desde 01/10/2026, lançar o saldo anterior como ajuste se houver, e testar o critério 10.

## Riscos e reversão

| Risco | Consequência | Proteção |
| --- | --- | --- |
| Alíquota esquecida sem atualizar | Repasses calculados com a faixa errada | Data da última atualização visível e aviso após 35 dias; critério 10 |
| Regra do terceiro caso não corresponder à prática | Devido errado quando o dinheiro cai na conta de quem não emitiu a nota | Regra confirmada em 26/09/2026; critério 1 cobre os quatro casos |
| Saldo anterior a outubro desconhecido | Saldo começa em zero e subestima a dívida real | Ajuste com observação, lançado quando o valor for conhecido |
| Repasse lançado com direção trocada | Saldo dobra em vez de zerar | Extrato com saldo acumulado linha a linha; movimento pode ser editado |

**Reversão.** Web: revert do commit. Banco: script comentado no fim da 006, que remove a view, a trava nova, `ordens_pagamento.aliquota_repasse`, `movimentos_entre_empresas` e `aliquotas_repasse`. Antes de rodar, exportar `movimentos_entre_empresas` em CSV. A Spec 02 continua funcionando sem a 006, e o agente não é afetado.

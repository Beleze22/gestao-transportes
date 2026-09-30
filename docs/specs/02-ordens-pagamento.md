# Spec 02 — Ordens de pagamento e recebimento

Pré-requisitos: Spec 01 (login) e Spec 04 (navegação) aplicadas.
Protótipo das telas: `docs/design/prototipo/` (Main, Ordem, Ordens, Legado, CelularAFaturar).

## Problema

O sistema registra o que foi feito, mas não o que foi cobrado nem o que já entrou. Os clientes quase nunca pagam viagem a viagem: acumulam viagens e pagam a soma. Dois pagam semanalmente; os outros, sem periodicidade fixa.

A ordem de pagamento agrupa viagens realizadas de um cliente e é enviada a ele. Quando o valor integral entra, todas as viagens dela contam como recebidas.

Uma ordem pode misturar viagens da Rohan e da TransBeleze. O cliente paga tudo numa única conta, e uma única nota, de uma das empresas, cobre a ordem inteira quando o cliente exige nota. Nos resumos, cada viagem conta como recebida pela empresa que a fez, não pela que recebeu o dinheiro.

## Escopo

Pré-requisito: a Spec 01 aplicada. As tabelas novas só abrem para usuários autenticados.

| Lado | Afetado? | O quê |
| --- | --- | --- |
| Supabase | Sim | Tabelas `ordens_pagamento` e `configuracao_financeira`, coluna `viagens.ordem_id`, triggers de trava, view de resumo |
| Web | Sim | Seção Financeiro (A faturar, Ordens, Legado), situação financeira na lista de viagens, campos travados no modal de edição |
| Agente | Sim, pouco | Repassar literalmente o erro de trava. Nenhuma ferramenta nova, nenhum relatório muda |

Fica de fora:

- Repasse entre as empresas e saldo em aberto (Spec 03).
- Leitura financeira no agente, como "o que o cliente X deve" (etapa 3).
- Acumulado de notas por empresa emissora nos últimos 12 meses. Os dados já ficam gravados; a tela vem depois.
- Acerto de pagamento com motoristas.
- Emissão de nota ou boleto pelo sistema.

## Ciclo de vida da ordem

A ordem tem três estados, e voltar de um deles para o anterior é sempre uma ação explícita, nunca efeito colateral de uma edição.

| De | Para | Ação | Exige |
| --- | --- | --- | --- |
| aberta | fechada | Fechar (enviada ao cliente) | Ao menos uma viagem; com nota, `empresa_nota`. Grava `fechada_em` |
| fechada | recebida | Receber | `recebida_em` e `empresa_recebedora` |
| fechada | aberta | Reabrir | `motivo_reabertura`. Grava `reaberta_em` |
| recebida | fechada | Desfazer recebimento | Limpa `recebida_em` e `empresa_recebedora` |

Só a ordem aberta pode ser excluída; as viagens dela voltam para "a faturar". Reabrir cobre a exceção de viagem esquecida ou valor errado; desfazer recebimento cobre um recebimento lançado errado.

## Mudanças no Supabase

Tudo entra numa migration aditiva, `agent/migrations/005_ordens_pagamento.sql`, rodada à mão no SQL Editor dentro de uma transação. Nenhuma coluna existente muda de significado. `viagens.status` continua descrevendo só o ciclo operacional.

**Tabela `ordens_pagamento`**

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `id` | bigint identity | Chave primária |
| `cliente_id` | bigint | FK para `clientes`, obrigatório; não muda depois que a ordem tem viagens |
| `status` | text | `aberta`, `fechada` ou `recebida`; padrão `aberta` |
| `legado` | boolean | Padrão `false`; ver "Ordem de legado" |
| `criada_em` | timestamptz | Padrão `now()` |
| `fechada_em` | date | Gravada ao fechar |
| `vencimento` | date | Opcional |
| `forma_pagamento` | text | `pix`, `boleto`, `transferencia` ou `dinheiro`; opcional |
| `com_nota` | boolean | Padrão `false` |
| `empresa_nota` | text | `Rohan` ou `TransBeleze`; obrigatória para fechar quando `com_nota` |
| `numero_nota`, `data_nota` | text, date | Opcionais; editáveis em qualquer estado, porque a nota pode sair depois |
| `recebida_em` | date | Obrigatória no estado `recebida` (exceto ordem de legado) |
| `empresa_recebedora` | text | `Rohan` ou `TransBeleze`; conta em que o dinheiro caiu; obrigatória no estado `recebida` (exceto ordem de legado) |
| `reaberta_em`, `motivo_reabertura` | timestamptz, text | Última reabertura |
| `observacoes` | text | Livre |

O total da ordem nunca é gravado. É sempre a soma de `valor_frete` das viagens dela.

**Coluna nova em `viagens`:** `ordem_id`, bigint, opcional, FK para `ordens_pagamento` com `on delete set null`, com índice.

**Tabela `configuracao_financeira`:** uma única linha com `inicio_controle` (date). Valor inicial: 01/10/2026. Viagens a partir dessa data e sem ordem aparecem em "a faturar". As anteriores sem ordem aparecem como "legado a conferir", até serem quitadas no legado ou incluídas numa ordem normal.

**Triggers de trava.** Valem também para o agente, que ignora RLS. Todo erro usa um SQLSTATE próprio, `TRV01`, com mensagem pronta para mostrar ao usuário, por exemplo: "Viagem #530 está na ordem #12 (fechada). Para alterar valor, empresa ou cliente, reabra a ordem na web."

1. **Entrada na ordem** (`ordem_id` preenchido em insert ou update): a ordem está aberta; a viagem é do mesmo cliente; tem `empresa` e `valor_frete`; o status é `concluida` ou `realizada_pendente`. Uma viagem de qualquer data pode entrar numa ordem normal, inclusive as do legado. O valor do motorista não é exigido.
2. **Viagem em ordem aberta:** tudo pode ser editado, exceto cancelar. Para cancelar, a viagem sai da ordem antes.
3. **Viagem em ordem fechada ou recebida:** bloqueia mudança de `valor_frete`, `empresa`, `cliente_id` e `ordem_id`, mudança de status para `cancelada` e exclusão. O resto continua livre, inclusive `valor_motorista`, motorista, caminhão, data e a passagem entre `realizada_pendente` e `concluida`, da qual o cron do agente depende.
4. **Transições da ordem:** as da tabela do ciclo de vida. Qualquer outra mudança de status é recusada. Exclusão só no estado `aberta`.

**Ordem de legado.** A coluna `legado` marca a ordem que quita viagens pagas antes do sistema. Há no máximo uma por cliente (índice único parcial). Ela nasce e fica sempre `recebida`, sem data de recebimento, conta ou campos de nota, e não passa pelas transições acima. Só aceita viagens com data anterior a `inicio_controle`. Viagens podem sair dela a qualquer momento, para desfazer uma quitação feita por engano; enquanto estiverem nela, os demais campos do item 3 continuam travados. Como não tem data de recebimento, ela não entra no recebido de nenhum período.

**View `ordens_resumo`**, criada com `security_invoker = true`: por ordem, a quantidade de viagens, o total, o total da Rohan e o total da TransBeleze. Sem o `security_invoker`, a view roda com os privilégios do dono, ignora o RLS e fica aberta à chave do bundle.

**RLS:** `ordens_pagamento` e `configuracao_financeira` com RLS ativo e a mesma policy "gerentes autenticados" da Spec 01. `viagens.ordem_id` já fica coberta pela policy existente de `viagens`.

**Impacto no agente:** as consultas dele listam colunas explícitas (`SELECT_COMPLETO`), então `ordem_id` não aparece. `criar_viagem_rascunho` e `atualizar_viagem` não enviam `ordem_id`. O agente só é afetado quando tenta alterar uma viagem travada e recebe o erro `TRV01`. O `gerar_relatorio` continua calculando pela data da viagem e não enxerga ordens.

## Mudanças na web

As telas seguem o protótipo e o `docs/design.md`.

**Seção Financeiro do menu**, com:

- **A faturar:** viagens elegíveis sem ordem, agrupadas por cliente, com total e divisão por empresa. Selecionar viagens cria uma ordem aberta ou as adiciona a uma ordem aberta do mesmo cliente.
- **Ordens:** lista filtrável por status e cliente, com total e vencimento, destacando as fechadas já vencidas. O detalhe mostra as viagens e as ações do estado atual:
  - aberta: incluir ou tirar viagem, excluir a ordem, fechar (vencimento, forma de pagamento, com ou sem nota, empresa da nota);
  - fechada: registrar recebimento (data e conta), reabrir com motivo, com aviso quando já há número de nota, porque a nota emitida fora do sistema vai precisar de correção;
  - recebida: desfazer recebimento;
  - qualquer estado: editar número e data da nota.
- **Legado a conferir:** viagens anteriores a 01/10/2026 sem ordem, agrupadas por cliente, com um contador do que falta revisar. Uma seleção pode ser quitada no legado, se já foi paga, ou incluída numa ordem normal, se ainda está a receber.
- **Resumo do período:** recebido por empresa (pela data do recebimento, somando as viagens de cada empresa), a receber por empresa (ordens fechadas) e total a faturar.

**Lista de viagens do Painel:** nova coluna de situação financeira: a faturar, legado a conferir, quitada no legado, em ordem aberta #N, faturada #N ou recebida #N.

**Modal de edição da viagem:** em ordem fechada ou recebida, os campos travados aparecem desabilitados, com aviso e link para a ordem. A tela só antecipa a regra; quem garante é o banco.

Os totais que o Painel já mostra não mudam.

## Mudanças no agente

O agente só precisa lidar bem com a trava. O risco a evitar é o modelo tentar contornar o bloqueio, por exemplo criando uma viagem nova com o valor corrigido e duplicando o faturamento.

- Em `tools.js/executar`, o erro com código `TRV01` vira um caso próprio. Não é recuperável por nova tentativa: a mensagem do banco vai ao usuário literalmente e o turno termina sem outra escrita.
- O fechamento do turno passa por `finalizarTurno()`, como as demais falhas de escrita, registrando no histórico que aquela viagem não foi alterada.
- Uma linha no prompt: viagem em ordem fechada só muda pela web, depois de reabrir a ordem.
- Um teste novo em `agent/test/`, sem banco, simulando o erro `TRV01`.

Nenhuma ferramenta nova e nenhum relatório muda nesta etapa.

## Critérios de aceite

1. Entrar numa ordem é recusado para viagem `confirmada`, `cancelada` ou `rascunho`, sem `valor_frete`, sem empresa ou de outro cliente. Cada caso é testado separadamente.
2. Fechar uma ordem sem viagens é recusado. Fechar com nota e sem `empresa_nota` é recusado.
3. Com a ordem fechada, mudar o `valor_frete` de uma viagem dela é recusado com `TRV01`, tanto pela web quanto por um update feito com a chave secreta (que simula o agente).
4. Na mesma viagem, mudar `valor_motorista` e observações funciona.
5. Uma viagem `realizada_pendente` de ordem fechada passa para `concluida` pelo `marcarRealizadasPendentes`, sem erro, depois que o `valor_motorista` é preenchido.
6. Reabrir sem motivo é recusado. Com motivo, a ordem volta a `aberta` e `reaberta_em` fica gravado.
7. Receber sem data ou sem conta é recusado. Uma ordem mista recebida soma a parte de cada empresa ao recebido dela, no mês da data do recebimento, qualquer que seja a conta que recebeu.
8. Excluir uma ordem aberta devolve as viagens para "a faturar". Excluir uma ordem fechada é recusado.
9. Sem sessão, um `GET` em `ordens_pagamento` e em `ordens_resumo` devolve `[]`.
10. Pelo Telegram, pedir para mudar o valor de uma viagem de ordem fechada: o agente responde com a mensagem da trava, não faz nenhuma outra gravação, e a viagem continua igual.
11. Os totais do Painel para setembro/2026 são os mesmos anotados antes do deploy.
12. Uma viagem anterior a 01/10/2026 entra numa ordem normal sem erro. Uma viagem de 01/10/2026 em diante é recusada na ordem de legado.
13. Quitar uma viagem no legado não muda o recebido de nenhum período. Tirar a viagem da ordem de legado a devolve para "legado a conferir".
14. Criar uma segunda ordem de legado para o mesmo cliente é recusado.

## Como testar e ordem de deploy

A migration sobe primeiro. Ela é aditiva, e as travas só atuam em viagens com `ordem_id`, que nenhuma tem até a web nova estar no ar. O agente antigo continua funcionando nesse intervalo.

1. Anotar os totais do Painel de setembro/2026 (critério 11).
2. Rodar a 005 no SQL Editor, com `inicio_controle` = 2026-10-01.
3. Testar os critérios 1 a 9 direto em SQL, dentro de uma transação terminada em rollback, para não deixar ordens de teste no banco.
4. Rodar `npm test` no agente, com o teste novo.
5. Push na `stable`, que sobe web e agente juntos.
6. Em produção, criar uma ordem real pequena e repetir os critérios 3 a 8 pela interface; o 10 pelo Telegram; depois o 11.
7. A partir de outubro, revisar o legado aos poucos: quitar no legado o que já foi pago e incluir em ordens normais o que ainda está a receber.

## Riscos e reversão

| Risco | Consequência | Proteção |
| --- | --- | --- |
| Viagem do legado quitada por engano | Uma viagem ainda não paga some da conferência | Tirar a viagem da ordem de legado a devolve para a conferência; critério 13 |
| Trava bloqueando o cron do agente | Viagens presas em `realizada_pendente` | A trava não cobre a passagem `realizada_pendente` ↔ `concluida`; critério 5 |
| Agente contornando a trava | Viagem duplicada no lugar da corrigida | `TRV01` encerra o turno sem nova escrita; critério 10 |
| Reabrir ordem com nota já emitida | Valor da ordem diverge da nota | Aviso ao reabrir e motivo gravado |
| View sem `security_invoker` | Ordens abertas à chave do bundle | Critério 9 |

**Reversão.** Web: revert do commit. Banco: script comentado no fim da 005, que remove triggers, view, `viagens.ordem_id`, `ordens_pagamento` e `configuracao_financeira`. Ele apaga as ordens lançadas, então antes de rodar é preciso exportar `ordens_pagamento` e o par `id, ordem_id` de `viagens` em CSV. O agente funciona com o banco antes e depois da 005, então não precisa ser revertido junto.

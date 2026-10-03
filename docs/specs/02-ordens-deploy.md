# Spec 02 — passos manuais, na ordem

Dois blocos. O **A** é o que dá para fazer agora: a migration sobe antes da web, porque é
aditiva e as travas só atuam em viagem com `ordem_id` — e nenhuma tem até as telas subirem.
O **B** é o deploy e a conferência em produção, depois que a web estiver pronta.

A ordem não é arbitrária. Se a web subisse primeiro, ela consultaria tabelas que não
existem; se a migration subisse junto com o push, um erro no script deixaria o site no ar
pedindo ordens a um banco sem ordens.

---

## Bloco A — banco e agente (agora)

### A1. Anotar o "antes" (critério 11)

No Painel, com o filtro em **setembro/2026**, anote por empresa: frete, pagamento a
motorista e despesas. Depois do deploy não há como recuperar o número.

### A2. Rodar a migration 005

SQL Editor → New query → cole `agent/migrations/005_ordens_pagamento.sql` inteiro → Run.

O script termina com uma consulta de conferência, então o resultado **aparece na tela** em
vez de virar `NOTICE` invisível. Esperado: sete linhas, todas com `ok = true`:

| item | esperado |
|---|---|
| inicio_controle | 2026-10-01 |
| ordens existentes | 0 |
| viagens com ordem | 0 |
| policies "gerentes autenticados" nas tabelas novas | 2 |
| RLS ativo nas tabelas novas | 2 |
| ordens_resumo com security_invoker | true |
| triggers de trava instaladas | 2 |

Qualquer `ok = false` é problema — me mande a linha. Como a parte que escreve está toda
numa transação, um erro durante a aplicação não deixa nada aplicado.

A linha do `security_invoker` é a mais importante das sete: sem ela a view roda com os
privilégios do dono, ignora o RLS e devolve as ordens para a chave do bundle. É o mesmo que
o critério 9 confirma pelo outro lado, por `curl`.

### A2b. Rodar a migration 006

Saiu da revisão das mensagens no primeiro A3: três delas mandavam o usuário fazer algo que a
própria trava proíbe — "reabra a ordem" numa quitação de legado, que nunca muda de situação;
"tire a viagem da ordem" numa ordem fechada, onde tirar também está travado; e o status cru
no meio da frase ("está rascunho"). A 006 também passa a recusar a segunda quitação de legado
com `TRV01` em vez do erro de índice único em inglês.

SQL Editor → New query → cole `agent/migrations/006_mensagens_trava.sql` → Run.

Só substitui as duas funções: nenhum schema, nenhum dado, nenhuma regra muda — apenas o
texto. Esperado: duas linhas com `ok = true`.

### A3. Critérios 1 a 8 e 12 a 14, no banco

SQL Editor → New query → cole `docs/specs/02-ordens-testes.sql` inteiro → Run.

Ele cria os próprios dados de teste, exercita cada critério e termina em `rollback` — **nada
fica no banco**.

O resultado vem como tabela, porque o SQL Editor não mostra `NOTICE`. E o **detalhe é a
última consulta**, porque o editor mostra só o resultado final — por isso o resumo
(passaram/falharam/total) vem antes, invertido em relação ao que a intuição pede:

| passou | criterio | o_que | esperado | obtido |
|---|---|---|---|---|

São 39 linhas (36 das regras, mais 3 que conferem o texto corrigido pela 006), as que
falharam no topo. **Qualquer `passou = false` é desvio da spec** — me mande a linha inteira.

A coluna `obtido` traz a mensagem que o banco devolveu: é o texto que vai aparecer no toast
da web e na resposta do Telegram, então vale ler como se fosse usuário. Foi exatamente essa
leitura, na primeira rodada, que revelou as três mensagens que a 006 conserta — as regras
estavam todas certas, e as instruções ao usuário, não.

Se o script falhar logo no começo, na inserção dos dados de teste, é sinal de que `viagens`
tem uma coluna obrigatória que eu não preenchi. Me mande o erro.

### A4. Critério 9 — as tabelas novas estão fechadas sem sessão

No terminal, com as mesmas variáveis do roteiro da spec 01:

```bash
set -a; source .env.local; set +a
URL="$VITE_SUPABASE_URL"; ANON="$VITE_SUPABASE_KEY"

for t in ordens_pagamento ordens_resumo configuracao_financeira; do
  printf '%-24s %s\n' "$t" "$(curl -s "$URL/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON")"
done
```

Esperado: `[]` nas três. A `ordens_resumo` é a que importa de verdade — uma view sem
`security_invoker` rodaria com os privilégios do dono e devolveria as ordens para a chave
do bundle.

### A5. Teste do agente

Esse eu já rodei: `cd agent && npm test`, 45 casos, inclusive os três novos de
`trava-ordem.test.mjs`. Vale rodar de novo na sua máquina se quiser conferir.

---

## Bloco B — deploy e produção (depois da web)

### B1. Push na `stable`

Sobe web e agente juntos. O agente muda de comportamento só no caso da trava.

### B2. Repetir os critérios 3 a 8 pela interface

Crie uma ordem real pequena, de um cliente só, e passe por: incluir viagem, fechar,
tentar mudar o valor de uma viagem dela (tem de aparecer a mensagem da trava no toast),
registrar recebimento, desfazer, reabrir com motivo, excluir uma ordem aberta.

### B3. Critério 10 — a trava pelo Telegram

Peça ao agente para mudar o valor do frete de uma viagem que está numa ordem fechada.
Esperado: ele responde **com a mensagem da trava** ("Viagem #N está na ordem #M (fechada).
Para alterar valor, empresa ou cliente, reabra a ordem na web."), não tenta outro caminho,
e a viagem continua igual. Confirme na web que o valor não mudou.

O que você NÃO pode ver: o agente criando uma viagem nova com o valor corrigido, ou
cancelando a viagem, ou lançando uma despesa de ajuste. Qualquer uma dessas é falha grave —
duplicaria faturamento. É o que o teste automático e a linha nova do prompt protegem.

### B4. Critério 11 — os totais de setembro

Compare com o que você anotou em A1. Têm de ser idênticos: nada nesta spec mexe em valor
de viagem ou de despesa.

### B5. Me avise

Com a data em que a 005 foi aplicada, para eu fechar a linha dela na tabela de migrations
do README.

---

## Se precisar reverter

O script está comentado no fim da `005`. **Ele apaga as ordens lançadas**, então antes de
rodar exporte:

```sql
select * from ordens_pagamento;
select id, ordem_id from viagens where ordem_id is not null;
```

A web da spec 02 precisa ser revertida junto, porque consulta essas tabelas. O agente
funciona com o banco antes e depois da 005 — o caso da trava simplesmente deixa de
acontecer — e não precisa ser revertido.

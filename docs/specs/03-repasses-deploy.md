# Spec 03 — passos manuais, na ordem

Mesma divisão das anteriores: o bloco **A** é banco, agora; o **B** é deploy e produção.

**O número da migration mudou.** A spec pede `006_repasses.sql`, mas a 006 já existe e está
aplicada — é a correção das mensagens de trava que saiu da validação da spec 02. Esta é a
**007**.

---

## Bloco A — banco (agora)

### A1. Anotar o saldo anterior, se você souber

Se houver dívida acumulada entre as empresas de antes de 01/10/2026, anote o valor e a
direção. Ela não é calculada por nada aqui: entra depois como **ajuste**, com observação, na
tela Entre empresas. Se não souber, o saldo começa em zero e isso é esperado.

### A2. Rodar a migration 007

SQL Editor → New query → cole `agent/migrations/007_repasses.sql` inteiro → Run.

Esperado: sete linhas, todas com `ok = true`.

| item | esperado |
|---|---|
| alíquotas cadastradas em 9% | 2 |
| coluna aliquota_repasse em ordens_pagamento | 1 |
| movimentos: nenhum lançado ainda | 0 |
| policies "gerentes autenticados" nas tabelas novas | 2 |
| RLS ativo nas tabelas novas | 2 |
| as duas views novas com security_invoker | 2 |
| a função de transição já conhece a alíquota | true |

A última linha merece atenção: a 007 **substitui** `trv_ordem_transicao` por inteiro. Depois
dela, a versão corrente da regra de transição da ordem está na 007 — não na 005 nem na 006.

### A3. Critérios 1 a 8, no banco

SQL Editor → New query → cole `docs/specs/03-repasses-testes.sql` → Run.

Cria os próprios dados, exercita cada critério e termina em `rollback` — **nada fica no
banco**, nem as ordens, nem os movimentos, nem a mudança de alíquota do critério 3. Resumo
primeiro, detalhe por último, as que falharam no topo.

O critério 1 é o que importa mais: ele monta as quatro ordens da tabela da spec (R$ 1.000 de
viagem da Rohan + R$ 500 da TransBeleze, alíquota 9%) e compara os quatro devidos, com
devedora e credora:

| Nota | Caiu na conta da | Devido esperado |
|---|---|---|
| Sem nota | Rohan | Rohan deve R$ 500,00 à TransBeleze |
| Rohan | Rohan | Rohan deve R$ 455,00 à TransBeleze |
| Rohan | TransBeleze | TransBeleze deve R$ 1.045,00 à Rohan |
| TransBeleze | Rohan | Rohan deve R$ 590,00 à TransBeleze |

**Qualquer `passou = false` aqui é motivo para parar.** É dinheiro saindo de uma empresa para
a outra, e a conta tem de estar certa antes de qualquer tela mostrar o número.

### A4. Critério 9 — as tabelas e views novas estão fechadas sem sessão

```bash
set -a; source .env.local; set +a
URL="$VITE_SUPABASE_URL"; ANON="$VITE_SUPABASE_KEY"

for t in aliquotas_repasse movimentos_entre_empresas devidos_entre_empresas saldo_entre_empresas; do
  printf '%-28s %s\n' "$t" "$(curl -s "$URL/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON")"
done
```

Esperado: `[]` nas quatro. As duas views são as que importam — sem `security_invoker` elas
rodariam como donas e entregariam os valores para a chave do bundle.

---

## Bloco B — deploy e produção (depois da web validada local)

### B1. Teste local

`npm run dev`, contra o banco de produção. O ciclo que importa:

1. Crie uma ordem **mista** — viagens das duas empresas, mesmo cliente — e feche com nota de
   uma delas.
2. "Registrar recebimento": ao escolher a conta, a **prévia do repasse** aparece e muda de
   valor conforme a conta. Confira que o número bate com a tabela acima.
3. Confirme. Vá em **Entre empresas**: o devido aparece no extrato, com a explicação do
   cálculo, e o saldo no topo muda em frase ("TransBeleze deve R$ X à Rohan").
4. Registre um repasse no valor do saldo: o saldo vai a zero.
5. Lance um **ajuste sem observação**: o botão fica desabilitado. Com observação, entra.
6. Desfaça o recebimento da ordem: o devido **sai** do extrato e o saldo volta.
7. Em **Alíquotas**, mude a da Rohan para 10% e volte à ordem já recebida: o repasse dela
   **não muda** — a alíquota foi congelada no recebimento.

Ao fim, apague o repasse e o ajuste de teste pelo próprio extrato, e devolva a alíquota a 9%.

### B2. Push na `stable`

Sobe web e agente juntos. O agente não muda nesta spec.

### B3. Critério 10 — o aviso de alíquota vencida

Com `atualizada_em` recuado 36 dias, o aviso tem de aparecer em **dois** lugares: no topo de
Entre empresas e dentro do diálogo de recebimento.

```sql
-- recuar
update aliquotas_repasse
   set atualizada_em = now() - interval '36 days'
 where empresa = 'Rohan';
```

Confira os dois lugares e então desfaça:

```sql
-- desfazer: volta a contar de agora
update aliquotas_repasse set atualizada_em = now() where empresa = 'Rohan';
```

Atenção: este `update` mexe em dado de produção e **não** está dentro de `begin/rollback` de
propósito — o aviso precisa persistir entre dois carregamentos de página. Rode o segundo
comando no mesmo dia.

### B4. Saldo real

Confira o saldo contra as ordens mistas recebidas desde 01/10/2026, e lance o saldo anterior
como ajuste se você souber o valor (passo A1).

### B5. Me avise

Com a data em que a 007 foi aplicada, para eu fechar a linha dela no README.

---

## Se precisar reverter

O script está comentado no fim da 007. **Ele apaga os movimentos lançados** — exporte antes:

```sql
select * from movimentos_entre_empresas;
```

E atenção a um detalhe: reverter precisa devolver `trv_ordem_transicao` à versão da 006.
Rodar a seção "2. Travas da ordem" da `006_mensagens_trava.sql` faz isso, porque ela usa
`create or replace`. Sem esse passo, a função continuaria tentando gravar uma coluna
(`aliquota_repasse`) que a reversão acabou de remover.

A spec 02 continua funcionando sem a 007, e o agente não é afetado em nenhum dos sentidos.

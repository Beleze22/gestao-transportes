# Spec 01 — passos manuais, na ordem

O que só pode ser feito por você: painel do Supabase, painel do Railway, push na `stable` e os
testes em produção. Cada critério de aceite da spec está marcado onde é verificado.

A ordem importa: **a web com login sobe antes da migration.** Ela funciona com as policies
antigas e com as novas, então nunca existe um momento em que o site esteja fechado sem tela de
login. Na ordem inversa, o site em produção mostraria faturamento zero sem dar erro nenhum —
leitura barrada por RLS volta como `[]`, não como falha.

Nos comandos, defina antes (no seu terminal, sem colar as chaves aqui nem em commit):

```bash
URL="https://SEU_PROJETO.supabase.co"      # VITE_SUPABASE_URL
ANON="sb_publishable_..."                  # VITE_SUPABASE_KEY, a mesma do bundle
```

---

## 1. Antes de tudo — anotar o "antes" (critério 6)

No Dashboard atual, com o filtro em **setembro/2026**, anote por empresa: total de frete, total
de pagamento a motorista e total de despesas. Depois do deploy não há como recuperar esse
número, e é com ele que o critério 6 é comparado.

## 2. Railway — conferir a chave do agente

`transporte-agent` → Variables → `SUPABASE_SERVICE_KEY` **começa com `sb_secret_`**.

Se começar com `sb_publishable_`, **pare aqui**: depois da migration o agente passaria a ler
listas vazias e a falhar em toda escrita. Corrija a variável e reinicie o serviço primeiro.

## 3. Supabase — pré-checagem (só leitura, guarda o estado anterior)

SQL Editor → New query:

```sql
begin;
  select tablename, policyname, roles, cmd, qual, with_check
    from pg_policies
   where schemaname = 'public'
     and tablename in ('viagens','despesas','clientes','motoristas','caminhoes',
                       'categoriasdespesas')
   order by tablename, policyname;

  select relname, relrowsecurity
    from pg_class
   where relnamespace = 'public'::regnamespace
     and relname in ('viagens','despesas','clientes','motoristas','caminhoes',
                     'categoriasdespesas')
   order by relname;
rollback;
```

Guarde o resultado (é o caminho de volta, caso os nomes das policies não sejam os
"Acesso total \<tabela>" que a spec previu).

## 4. Local — testar o login com as policies antigas ainda ativas

```bash
npm run dev     # http://localhost:5173
```

Confira, ainda sem ter mexido no banco:

- a tela de login aparece sozinha, sem nenhum dado atrás;
- senha errada mostra "E-mail ou senha incorretos." e não limpa o e-mail digitado;
- depois de entrar, as três abas funcionam como antes;
- **F5 mantém a sessão** (critério 7, primeira metade);
- **Sair volta ao login** e nenhum dado fica na tela (critério 7, segunda metade).

Para isso já é preciso ter pelo menos um usuário — faça o passo 5 antes, se ainda não houver.

## 5. Supabase Auth — usuários e cadastro público (critério 3)

No painel:

1. **Authentication → Users → Add user → Create new user**: um por gerente, com e-mail e senha,
   marcando **Auto Confirm User**. Sem a confirmação, o login responde "Email not confirmed".
2. **Authentication → Sign In / Providers → Email**: desligar **"Allow new users to sign up"**.
   Esta é a proteção que sustenta tudo — com ela ligada, qualquer pessoa cria uma conta pela API
   com a chave do bundle, vira `authenticated` e recupera acesso total.
3. **Authentication → URL Configuration → Site URL**: o domínio do Netlify
   (`https://beleze-transportes.netlify.app`).

Depois, o **critério 3**:

```bash
curl -i -X POST "$URL/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"teste-cadastro@exemplo.com","password":"senha-de-teste-12345"}'
```

Esperado: **422**, com `"error_code":"signup_disabled"` ("Signups not allowed for this
instance"). Se vier **200** com um usuário criado, o cadastro ainda está ligado: volte ao
item 2, e apague o usuário criado em Authentication → Users.

## 6. Deploy da web

```bash
git checkout stable && git merge spec-01-login && git push
```

O push reconstrói o Netlify **e** o Railway. O agente não mudou, mas acompanhe o deploy e bata
no `/health` dele depois.

Em produção: entrar com cada usuário de gerente, conferir que as três abas carregam os dados.

## 7. Migration 004

SQL Editor → New query → cole `agent/migrations/004_login_gerentes.sql` inteiro → Run.

**Leia a aba Messages/Notices antes de sair da tela:** o passo 2 emite um `NOTICE` por policy
removida, com o nome dela. Esses nomes são o que a reversão precisa recriar. O último notice
deve ser `OK: as seis tabelas têm uma policy, para authenticated, com RLS ativo.` — se em vez
disso aparecer um erro, **nada foi aplicado** (tudo está numa transação só) e o estado anterior
continua de pé.

### Critério 4 — policies

```sql
begin;
  select tablename, policyname, roles, cmd
    from pg_policies
   where schemaname = 'public'
     and tablename in ('viagens','despesas','clientes','motoristas','caminhoes',
                       'categoriasdespesas')
   order by tablename;
rollback;
```

Esperado: seis linhas, todas `gerentes autenticados | {authenticated} | ALL`. Nenhuma com
`{public}` ou `{anon}`.

### Critério 1 — leitura sem sessão devolve `[]`

```bash
for t in viagens despesas clientes motoristas caminhoes categoriasdespesas; do
  printf '%-20s %s\n' "$t" "$(curl -s "$URL/rest/v1/$t?select=id&limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON")"
done
```

Esperado: `[]` nas seis.

### Critério 2 — escrita sem sessão é recusada com `42501`

```bash
curl -i -X POST "$URL/rest/v1/clientes" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"nome":"TESTE RLS - APAGAR"}'
```

Esperado: **401/403** com `"code":"42501"` ("new row violates row-level security policy").
Se vier **201**, a migration não surtiu efeito: apague o cliente `TESTE RLS - APAGAR` (pelo
painel, em Table Editor) e confira o passo 7.

## 8. Conferência final em produção

- **Critério 5** — abra o site numa janela anônima, com a aba **Network** aberta e filtro `rest`.
  Só a tela de login aparece, e **nenhuma** chamada a `/rest/v1` é registrada (as de `/auth/v1`
  são esperadas). Depois de entrar, as chamadas a `/rest/v1` aparecem normalmente.
- **Critério 6** — entre e compare os totais de setembro/2026 por empresa com o que você anotou
  no passo 1. Têm de ser idênticos.
- **Critério 7** — F5 mantém a sessão; Sair volta ao login e a tela não mostra mais nenhum dado.
- **Critério 8** — pelo Telegram: registre uma despesa de teste, confirme que ela aparece na web
  (F5), e pergunte o faturamento de setembro — o valor tem de ser o mesmo de antes da migration.
  Depois, apague a despesa de teste pela web.

## 9. Me avise

Com a data em que a 004 foi aplicada, para eu fechar a linha dela na tabela de migrations do
README (hoje está como "a aplicar").

---

## Se precisar reverter

O script de reversão está comentado no fim de `agent/migrations/004_login_gerentes.sql`: remove
"gerentes autenticados" e recria "Acesso total \<tabela>" para `public`. Use os nomes que os
`NOTICE` do passo 7 mostraram, se forem diferentes.

**Não é preciso reverter o deploy da web:** ela nunca dependeu da policy antiga, e continua
funcionando com login depois da reversão. O agente não é afetado em nenhum dos dois sentidos.

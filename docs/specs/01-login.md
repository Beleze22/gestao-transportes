# Spec 01 — Login na web e fim do acesso anônimo

Sep 26, 2026 · @Beleze

## Problema

Hoje qualquer pessoa com a URL do site lê, altera e apaga viagens e despesas. As seis tabelas antigas (`viagens`, `despesas`, `clientes`, `motoristas`, `caminhoes`, `categoriasdespesas`) têm a policy "Acesso total" com `using=true` para o papel `public`, e a chave publishable vai embutida no bundle do Netlify.

A próxima etapa (ordens de pagamento e recebimentos) cria tabelas que nascem com RLS ligado e sem policy. Sem login, a web não as enxerga. Abri-las do mesmo jeito exporia quem deve quanto e permitiria marcar uma ordem como recebida de fora.

Só os gerentes usam a web, e todos podem ver e fazer tudo. Não há necessidade de perfis diferentes.

## Escopo

| Lado | Afetado? | O quê |
| --- | --- | --- |
| Web (Netlify) | Sim | Tela de login, sessão, botão de sair |
| Supabase | Sim | Configuração de Auth e troca das policies das seis tabelas |
| Agente (Railway) | Não | Usa a chave secreta, que ignora RLS. Nenhuma mudança de código, variável ou deploy |

Fica de fora: "esqueci a senha" pela tela (a senha é redefinida pelo painel do Supabase), perfis ou permissões diferentes entre gerentes, e as tabelas `motoristas_apelidos`, `conversas` e `config_notificacoes`, que a web não usa e continuam sem policy.

## Mudanças no Supabase

Nenhuma coluna ou tabela muda. A mudança está só em Auth e nas policies.

**Auth (painel)**

- Cadastro público desligado. Sem isso, qualquer pessoa cria uma conta pela API com a chave publishable, vira `authenticated` e volta a ter acesso total.
- Um usuário por gerente, criado pelo painel com e-mail e senha, já confirmado.
- Site URL apontando para o domínio do Netlify.

**RLS: migration `agent/migrations/004_login_gerentes.sql`**, rodada à mão no SQL Editor, dentro de uma transação, como as anteriores.

- Nas seis tabelas antigas: remover a policy "Acesso total \<tabela>" e criar uma policy "gerentes autenticados" para todas as operações, papel `authenticated`, `using (true)` e `with check (true)`.
- O `true` é intencional: todos os gerentes veem e editam tudo. O que muda é que o papel `anon` (a chave do bundle) deixa de ter qualquer policy.
- O RLS já está ativo nas seis tabelas; não é preciso ligá-lo.
- O arquivo traz no fim, comentado, o script de reversão que recria as policies antigas.

**Impacto no agente:** nenhum. Ele grava com `SUPABASE_SERVICE_KEY`, a chave secreta, que ignora RLS e não depende de login. Pré-condição a conferir no painel do Railway antes de rodar a migration: essa variável contém uma chave `sb_secret_…`, e não a publishable.

## Mudanças na aplicação web

Nenhuma consulta ao banco muda. Muda quando elas podem acontecer.

- **Tela de login** com e-mail e senha, sem link de "criar conta". Erro de credencial mostra mensagem clara.
- **Portão de sessão:** o conteúdo do app e o `buscarDados` só rodam com sessão ativa. Sem sessão, aparece a tela de login e nenhuma chamada a `/rest/v1` é feita.
- **Sessão perdida:** ao receber o evento de saída (logout, token inválido), o app limpa viagens e despesas da memória e volta ao login.
- **Botão de sair** visível em qualquer aba.
- **Nenhuma variável de ambiente nova.** O cliente continua usando `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY`.

O portão é a parte que não pode faltar. Depois da migration, uma leitura sem sessão não dá erro: o PostgREST devolve lista vazia. O Dashboard mostraria faturamento zero como se fosse verdade. O `exigirUmaLinha` já pega isso nas escritas, mas não nas leituras.

## Critérios de aceite

1. Um `GET` em `/rest/v1/<tabela>` com só a chave publishable, sem sessão, devolve `[]` nas seis tabelas antigas.
2. Um `POST` nas mesmas tabelas com só a chave publishable é recusado com erro de RLS (código `42501`).
3. Um cadastro pela API de Auth com a chave publishable é recusado com erro de cadastro desabilitado.
4. `pg_policies` não lista nenhuma policy com `roles=public` nas seis tabelas, e cada uma tem exatamente uma policy para `authenticated`.
5. Abrir o site sem sessão mostra só a tela de login, e a aba Network não registra nenhuma chamada a `/rest/v1`.
6. Um gerente logado vê no Dashboard os mesmos totais de frete, pagamento a motorista e despesas por empresa de setembro/2026 anotados antes do deploy.
7. Recarregar a página mantém a sessão. Sair volta ao login e a tela não mostra mais nenhum dado.
8. Pelo Telegram, o agente registra uma despesa de teste, ela aparece na web, e uma pergunta de faturamento de setembro responde o mesmo valor de antes da migration.

## Como testar e ordem de deploy

A ordem importa: a web com login funciona com as policies antigas e com as novas, então ela sobe primeiro. Assim nunca existe um momento em que o site esteja fechado sem tela de login.

1. **Antes de tudo:** anotar no Dashboard os totais de setembro/2026 por empresa (critério 6) e conferir a chave do agente no Railway.
2. **Local:** rodar a web com `npm run dev` contra o Supabase de produção, com a policy antiga ainda ativa. Testar login, recarga, sair e senha errada.
3. **Auth:** criar os usuários dos gerentes no painel e desligar o cadastro público. Rodar o critério 3.
4. **Deploy da web:** push na `stable`. Entrar em produção com cada usuário.
5. **Migration 004:** rodar no SQL Editor. Em seguida, critérios 1, 2 e 4.
6. **Conferência final:** critérios 5 a 8, em produção.

O push na `stable` também reconstrói o agente no Railway, sem mudança de código. Vale acompanhar o `/health` depois do deploy.

## Riscos e reversão

| Risco | Consequência | Proteção |
| --- | --- | --- |
| Cadastro público esquecido ligado | Qualquer pessoa cria conta e tem acesso total | Critério 3, verificado antes da migration |
| Leitura sem sessão | Dashboard mostra zero como se fosse real | Portão de sessão; critério 5 |
| Agente configurado com a chave publishable | Agente passa a ler listas vazias e falhar nas escritas | Conferência no Railway antes da migration; critério 8 |
| Migration rodada direto em produção (não há staging) | Web sem acesso aos dados | Transação única e script de reversão pronto no arquivo |
| Gerente esquece a senha | Fica sem acesso até alguém agir | Redefinição pelo painel do Supabase |

**Reversão:** rodar o script comentado no fim da 004, que remove "gerentes autenticados" e recria "Acesso total \<tabela>" para `public`. A web com login continua funcionando depois da reversão, então não é preciso reverter o deploy. O agente não é afetado em nenhum dos dois sentidos.

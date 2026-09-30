-- Migration: fecha as seis tabelas antigas para o papel anon (fim do acesso sem login)
--
-- Rode este script inteiro no Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- O QUE FAZ
-- Nenhuma coluna, tabela, trigger ou significado de campo muda. Só policies. Nas seis
-- tabelas antigas (viagens, despesas, clientes, motoristas, caminhoes, categoriasdespesas)
-- toda policy existente é removida e entra uma única policy "gerentes autenticados", para
-- o papel `authenticated`, com using (true) e with check (true).
--
-- O `true` é intencional: todos os gerentes veem e editam tudo, não há perfis diferentes.
-- O que muda é que o papel `anon` — a chave publishable que vai embutida no bundle do
-- Netlify — deixa de ter qualquer policy, e portanto qualquer acesso.
--
-- IMPACTO NA WEB
-- Nenhuma consulta muda. Sem sessão, a leitura NÃO dá erro: o PostgREST devolve 200 com
-- lista vazia, e o Dashboard mostraria faturamento zero como se fosse verdade. É por isso
-- que o portão de sessão (src/components/PortaoSessao.jsx) tem de estar em produção ANTES
-- desta migration — veja as pré-condições abaixo. Escrita sem sessão passa a falhar com
-- 42501, que o exigirUmaLinha() já transforma em mensagem legível.
--
-- IMPACTO NO AGENTE
-- Nenhum. Ele grava com SUPABASE_SERVICE_KEY (agent/src/supabaseClient.js), a chave
-- secreta, que ignora RLS e não depende de login. Nenhuma mudança de código, variável ou
-- deploy. Mas veja a primeira pré-condição: se essa variável estiver com a chave
-- publishable por engano, este script quebra o agente.
--
-- PRÉ-CONDIÇÕES (confira as três antes de rodar)
--   1. No Railway, SUPABASE_SERVICE_KEY começa com `sb_secret_` e não com `sb_publishable_`.
--   2. Os usuários dos gerentes já existem em Authentication > Users, confirmados, e
--      "Allow new users to sign up" está DESLIGADO. Sem isso, qualquer pessoa cria uma
--      conta pela API, vira `authenticated` e volta a ter acesso total.
--   3. A web com tela de login já está em produção e você já entrou com cada usuário.
--
-- PRÉ-CHECAGEM (rode antes, é só leitura — guarda o estado anterior e mostra os nomes
-- que o passo 2 vai remover):
--   begin;
--     select tablename, policyname, roles, cmd, qual, with_check
--       from pg_policies
--      where schemaname = 'public'
--        and tablename in ('viagens','despesas','clientes','motoristas','caminhoes',
--                          'categoriasdespesas')
--      order by tablename, policyname;
--     select relname, relrowsecurity
--       from pg_class
--      where relnamespace = 'public'::regnamespace
--        and relname in ('viagens','despesas','clientes','motoristas','caminhoes',
--                        'categoriasdespesas')
--      order by relname;
--   rollback;
--
-- DOIS DESVIOS DA SPEC 01, combinados antes de escrever o arquivo:
--
--   a) A spec manda remover a policy pelo nome ("Acesso total <tabela>"). Não havia como
--      conferir os nomes reais sem acesso ao banco, e um `drop policy if exists` com nome
--      errado não falha: ele não remove nada, deixa `anon` com acesso total e o script
--      diz "sucesso". O passo 2 percorre pg_policies e remove o que encontrar, avisando
--      cada nome por NOTICE; o passo 4 confere o resultado antes do commit.
--
--   b) A spec diz que não é preciso ligar o RLS, porque ele já está ativo nas seis. O
--      passo 1 liga de todo jeito: é idempotente (sem efeito onde já está ativo) e evita
--      a pior falha possível aqui — fechar a policy de uma tabela cujo RLS esteja
--      desligado, que continuaria aberta para qualquer pessoa sem nenhum sinal disso.
--
-- Fora do escopo, de propósito: motoristas_apelidos, conversas e config_notificacoes. A
-- web não as usa; elas seguem com RLS ativo e sem policy, alcançadas só pela chave secreta.

begin;

-- 1. Garante o RLS ativo. Sem ele, policy nenhuma é consultada e a tabela fica aberta.
--    Idempotente: onde já está ativo, não faz nada.
alter table viagens             enable row level security;
alter table despesas            enable row level security;
alter table clientes            enable row level security;
alter table motoristas          enable row level security;
alter table caminhoes           enable row level security;
alter table categoriasdespesas  enable row level security;

-- 2. Remove TODA policy existente nas seis tabelas. O nome de cada uma removida sai como
--    NOTICE — anote, é o caminho de volta caso a reversão do fim do arquivo precise
--    recriar algo com nome diferente do que a spec previa.
do $$
declare
  p record;
begin
  for p in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('viagens','despesas','clientes','motoristas','caminhoes',
                         'categoriasdespesas')
     order by tablename, policyname
  loop
    raise notice 'removendo policy "%" de %', p.policyname, p.tablename;
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 3. Uma policy por tabela, só para quem tem sessão. O `true` é a regra de negócio: os
--    gerentes são todos iguais e podem tudo. Quem não tem sessão chega como `anon` e não
--    encontra policy nenhuma.
create policy "gerentes autenticados" on viagens
  for all to authenticated using (true) with check (true);
create policy "gerentes autenticados" on despesas
  for all to authenticated using (true) with check (true);
create policy "gerentes autenticados" on clientes
  for all to authenticated using (true) with check (true);
create policy "gerentes autenticados" on motoristas
  for all to authenticated using (true) with check (true);
create policy "gerentes autenticados" on caminhoes
  for all to authenticated using (true) with check (true);
create policy "gerentes autenticados" on categoriasdespesas
  for all to authenticated using (true) with check (true);

-- 4. Asserção antes do commit. Um estado meio-feito aqui é pior do que nenhuma mudança:
--    uma tabela que ficou sem policy some da web, e uma que manteve a policy antiga
--    continua aberta para a internet. Qualquer desvio derruba a transação inteira.
do $$
declare
  t text;
  qtd int;
  sobrando text;
begin
  foreach t in array array['viagens','despesas','clientes','motoristas','caminhoes',
                           'categoriasdespesas']
  loop
    select count(*) into qtd
      from pg_policies
     where schemaname = 'public' and tablename = t;
    if qtd <> 1 then
      raise exception 'A tabela % ficou com % policies, esperava exatamente 1', t, qtd;
    end if;

    select string_agg(policyname || ' -> ' || roles::text, ', ') into sobrando
      from pg_policies
     where schemaname = 'public' and tablename = t
       and not (roles = array['authenticated']::name[]);
    if sobrando is not null then
      raise exception 'A tabela % tem policy para papel indevido: %', t, sobrando;
    end if;

    if not (select relrowsecurity from pg_class
             where relnamespace = 'public'::regnamespace and relname = t) then
      raise exception 'A tabela % está com RLS desligado', t;
    end if;
  end loop;

  raise notice 'OK: as seis tabelas têm uma policy, para authenticated, com RLS ativo.';
end $$;

commit;

-- Conferência esperada (critério 4 da spec) — seis linhas, todas com {authenticated}:
--   begin;
--     select tablename, policyname, roles, cmd
--       from pg_policies
--      where schemaname = 'public'
--        and tablename in ('viagens','despesas','clientes','motoristas','caminhoes',
--                          'categoriasdespesas')
--      order by tablename;
--   rollback;
--
--   viagens             | gerentes autenticados | {authenticated} | ALL
--   despesas            | gerentes autenticados | {authenticated} | ALL
--   clientes            | gerentes autenticados | {authenticated} | ALL
--   motoristas          | gerentes autenticados | {authenticated} | ALL
--   caminhoes           | gerentes autenticados | {authenticated} | ALL
--   categoriasdespesas  | gerentes autenticados | {authenticated} | ALL

-- Rollback: devolve o acesso aberto ao papel public. A web com login continua funcionando
-- depois disso (ela nunca dependeu da policy antiga), então não é preciso reverter o
-- deploy do Netlify. O agente não é afetado em nenhum dos dois sentidos.
--
--   begin;
--   drop policy if exists "gerentes autenticados" on viagens;
--   drop policy if exists "gerentes autenticados" on despesas;
--   drop policy if exists "gerentes autenticados" on clientes;
--   drop policy if exists "gerentes autenticados" on motoristas;
--   drop policy if exists "gerentes autenticados" on caminhoes;
--   drop policy if exists "gerentes autenticados" on categoriasdespesas;
--
--   create policy "Acesso total viagens" on viagens
--     for all to public using (true) with check (true);
--   create policy "Acesso total despesas" on despesas
--     for all to public using (true) with check (true);
--   create policy "Acesso total clientes" on clientes
--     for all to public using (true) with check (true);
--   create policy "Acesso total motoristas" on motoristas
--     for all to public using (true) with check (true);
--   create policy "Acesso total caminhoes" on caminhoes
--     for all to public using (true) with check (true);
--   create policy "Acesso total categoriasdespesas" on categoriasdespesas
--     for all to public using (true) with check (true);
--   commit;
--
-- Se os NOTICE do passo 2 mostrarem nomes diferentes desses, use os nomes anotados — o
-- que importa para reverter é o papel (public) e o using/with check (true), não o nome.

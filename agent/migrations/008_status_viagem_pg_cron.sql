-- Migration: a passagem diária do status da viagem sai do agente e vai para o banco
--
-- Rode este script inteiro no Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- POR QUE EXISTE (FIX #18)
-- Uma viagem lançada para hoje ou para o futuro nasce `confirmada` ("agendada"). Quem a
-- passava para `concluida` (ou `realizada_pendente`) depois que a data passava era o cron
-- `marcarRealizadasPendentes`, dentro do processo do agente no Railway. Em nov/2026 o
-- período de teste do Railway acabou, os deploys foram pausados, e sete viagens de 06/11 e
-- 08/11 ficaram `confirmada` dias depois de acontecerem. Como o "A faturar" só mostra
-- `concluida` e `realizada_pendente` (e a trigger `trv_viagem_em_ordem` só aceita essas
-- duas numa ordem), elas sumiram da cobrança sem aviso nenhum.
--
-- A regra vale para a web e para o agente, então mora no banco: uma função chamada pelo
-- `pg_cron` do próprio Supabase. Funciona com o agente ligado ou desligado.
--
-- O QUE FAZ
--   1. Ativa a extensão `pg_cron` (no plano gratuito ela existe; só vem desligada).
--   2. Cria `marcar_viagens_realizadas()`, que faz a passagem e devolve quantas viagens
--      mudaram.
--   3. Tira o direito de execução de `anon` e `authenticated`: função no schema `public`
--      vira rota da API (`/rest/v1/rpc/...`), e esta não tem por que ser chamada por lá.
--   4. Agenda a função de hora em hora, no minuto 5.
--
-- A REGRA
-- A mesma dos três passos do agente, escrita como um único `update`. Para toda viagem com
-- data anterior a hoje (no fuso de Brasília) e status `confirmada`, `confirmada_sem_valor`
-- ou `realizada_pendente`:
--   com frete e pagamento ao motorista ... concluida
--   faltando um dos dois ................. realizada_pendente
-- O resultado final é o mesmo dos três passos; a diferença é que uma
-- `confirmada_sem_valor` que já tem os dois valores vai direto para `concluida`, sem passar
-- por `realizada_pendente` no meio, e cada viagem é contada uma vez só.
-- `cancelada`, `rascunho` e `concluida` nunca são tocadas.
--
-- POR QUE DE HORA EM HORA, E NÃO À MEIA-NOITE
-- O `pg_cron` do Supabase agenda em GMT, mas a data de "hoje" é calculada dentro da função,
-- no fuso de Brasília — então o horário do agendamento não decide nada, só o atraso
-- máximo (uma hora depois da meia-noite). E a função é idempotente: se uma execução
-- falhar, a seguinte corrige, em vez de deixar o dia inteiro para trás como acontecia.
--
-- ONDE VER SE ESTÁ RODANDO
-- Cada execução fica em `cron.job_run_details` com `status` (succeeded / failed) e a
-- mensagem de erro, se houver. A consulta pronta está no fim de
-- docs/verificacoes/008-status-viagem-testes.sql.
--
-- IMPACTO NA WEB
-- Nenhum código muda. A web continua aplicando a regra de data na hora de salvar
-- (`statusParaViagem`, src/lib/viagem.js); esta função cobre só a virada do dia. O efeito
-- visível é o "A faturar" receber as viagens do dia até uma hora depois da meia-noite,
-- mesmo com o agente fora do ar.
--
-- IMPACTO NO AGENTE
-- O commit que acompanha esta migration tira o cron da meia-noite de
-- agent/src/scheduler.js. Enquanto as duas coisas convivem (migration aplicada e agente
-- antigo rodando, ou o contrário durante o deploy), nada quebra: a regra é a mesma e as
-- duas são idempotentes. O que NÃO pode é reverter esta migration e manter o agente novo
-- — aí ninguém faz a passagem.
--
-- PRÉ-CONDIÇÃO: migration 005 aplicada (a trigger `trv_viagem_em_ordem` é disparada por
-- este update e libera a passagem realizada_pendente -> concluida mesmo em ordem fechada).
--
-- SE O `create extension` FOR RECUSADO POR PERMISSÃO: ative o pg_cron pelo painel
-- (Integrations -> Cron -> Enable) e rode este script de novo. Ele é seguro para rodar
-- mais de uma vez: a função usa `create or replace` e agendar com um nome que já existe
-- substitui a tarefa anterior.

begin;

-- 1. Extensão ---------------------------------------------------------------------------
-- Forma indicada na documentação do Supabase (guides/cron/install).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 2. Função -----------------------------------------------------------------------------
create or replace function marcar_viagens_realizadas() returns integer
language plpgsql
set search_path = public
as $$
declare
  -- now() é UTC no Supabase. Entre 21h e meia-noite (Brasília), current_date já é o dia
  -- seguinte e converteria as viagens de hoje antes da hora.
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  alteradas integer;
begin
  update viagens
     set status = case
                    when valor_frete is not null and valor_motorista is not null
                      then 'concluida'
                    else 'realizada_pendente'
                  end
   where data < hoje
     and status in ('confirmada', 'confirmada_sem_valor', 'realizada_pendente')
     -- Sem isto, toda `realizada_pendente` ainda sem valor seria regravada com o mesmo
     -- status a cada hora: escrita à toa e trigger disparada à toa.
     and status is distinct from case
                                   when valor_frete is not null and valor_motorista is not null
                                     then 'concluida'
                                   else 'realizada_pendente'
                                 end;

  get diagnostics alteradas = row_count;
  return alteradas;
end $$;

comment on function marcar_viagens_realizadas() is
  'Passa para concluida/realizada_pendente as viagens cuja data já passou (fuso de Brasília). Chamada de hora em hora pelo pg_cron, tarefa marcar-viagens-realizadas. Migration 008.';

-- 3. Fora da API --------------------------------------------------------------------------
-- O Supabase dá execute em funções novas do `public` para anon e authenticated por padrão.
revoke execute on function marcar_viagens_realizadas() from public, anon, authenticated;

-- 4. Agendamento --------------------------------------------------------------------------
-- Roda como o usuário que agendou (postgres, pelo SQL Editor), que não passa pelo RLS —
-- o mesmo alcance que a chave secreta do agente tinha.
select cron.schedule(
  'marcar-viagens-realizadas',
  '5 * * * *',
  'select public.marcar_viagens_realizadas()'
);

commit;

-- Conferência automática. É consulta, e não `raise notice`: o SQL Editor do Supabase
-- descarta notices e mostra só o resultado da última consulta.
-- Esperado: cinco linhas, todas com ok = true.
select item, esperado, obtido, obtido = esperado as ok
from (
  values
    ('extensão pg_cron ativa',
     '1',
     (select count(*)::text from pg_extension where extname = 'pg_cron')),

    ('função marcar_viagens_realizadas criada',
     '1',
     (select count(*)::text from pg_proc
       where proname = 'marcar_viagens_realizadas'
         and pronamespace = 'public'::regnamespace)),

    ('tarefa agendada de hora em hora e ativa',
     '1',
     (select count(*)::text from cron.job
       where jobname = 'marcar-viagens-realizadas'
         and schedule = '5 * * * *'
         and active)),

    ('o site sem login (anon) não executa a função',
     'false',
     has_function_privilege('anon', 'public.marcar_viagens_realizadas()', 'execute')::text),

    ('o gerente logado (authenticated) não executa a função',
     'false',
     has_function_privilege('authenticated', 'public.marcar_viagens_realizadas()', 'execute')::text)
) as t(item, esperado, obtido);

-- Os casos da regra têm script próprio em docs/verificacoes/008-status-viagem-testes.sql,
-- todo dentro de begin/rollback.
--
-- As sete viagens presas de nov/2026 (#691, #692, #693, #695, #696, #698, #699) NÃO são
-- convertidas por esta migration: a primeira execução da tarefa, no minuto 5 da próxima
-- hora, faz isso — e é a prova de que ela está rodando sozinha.

-- Reversão. ATENÇÃO: sem esta migration e sem o cron antigo do agente, nenhuma viagem
-- passa de `confirmada` sozinha. Reverta junto o commit do agente (que devolve o cron da
-- meia-noite a agent/src/scheduler.js) e reative o Railway — ou aceite que a passagem só
-- acontece quando alguém abre e salva a viagem na web.
--
-- A extensão pg_cron fica: desligá-la apagaria qualquer outra tarefa agendada no projeto.
--
--   begin;
--   select cron.unschedule('marcar-viagens-realizadas');
--   drop function if exists marcar_viagens_realizadas();
--   commit;

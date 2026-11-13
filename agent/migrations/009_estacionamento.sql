-- Migration: estacionamento como campo próprio da viagem (spec 05)
--
-- Rode este script inteiro no Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- ONDE MORA A TRAVA DA VIAGEM EM ORDEM, DEPOIS DESTA MIGRATION
-- Em `trv_viagem_em_ordem`, e a versão corrente é a DESTE arquivo. A 005 criou a função, a
-- 006 reescreveu as mensagens, e a 009 acrescenta o estacionamento aos campos travados.
--
-- O QUE FAZ
--   1. `viagens.valor_estacionamento` — o que a empresa pagou de estacionamento e cobra do
--      cliente. Nasce 0 em toda viagem, nunca negativo, nunca nulo.
--   2. `ordens_resumo` — `total`, `total_rohan` e `total_transbeleze` passam a somar frete +
--      estacionamento, e a view ganha `total_estacionamento` no fim. Como
--      `devidos_entre_empresas` (007) lê esses totais, o repasse passa a incluir o
--      estacionamento SEM mudar a fórmula: só T e V mudam de composição.
--   3. `trv_viagem_em_ordem` — em ordem fechada, recebida ou quitação de legado, o
--      estacionamento fica travado junto com frete, empresa e cliente. Entrar numa ordem
--      NÃO exige estacionamento.
--
-- POR QUE O TIPO DA COLUNA É LIDO DO BANCO
-- `viagens` foi criada pelo painel, e o tipo de `valor_frete` não está em migration nenhuma.
-- A coluna nova nasce com o mesmo tipo dele: assim `valor_frete + valor_estacionamento`
-- mantém o tipo das colunas da view, e o `create or replace view` não é recusado com
-- "cannot change data type of view column".
--
-- ORDENS JÁ RECEBIDAS
-- O devido de uma ordem recebida é derivado da view, não gravado. Como toda viagem existente
-- nasce com estacionamento 0, nenhum devido muda. Daqui para a frente, a trava do item 3
-- impede mudar o estacionamento de viagem em ordem fechada ou recebida.
--
-- IMPACTO NA WEB
-- A web desta spec grava e mostra o campo. A web antiga (antes do deploy) continua
-- funcionando: não conhece a coluna, e o insert dela grava 0. Os totais de ordem que ela
-- calcula em JS (`totaisPorEmpresa`) só divergem da view se houver estacionamento lançado
-- — e só a web nova lança.
--
-- IMPACTO NO AGENTE
-- Nenhum código muda. O insert dele não manda a coluna e grava 0; `atualizarViagem` mescla a
-- linha atual e não toca nela. O relatório dele soma só frete, coerente com a regra de que
-- estacionamento não é faturamento. A trava nova não o atinge: ele nunca grava a coluna.
--
-- PRÉ-CONDIÇÕES: migrations 005 a 007 aplicadas.

begin;

-- 1. Coluna -------------------------------------------------------------------------------
do $$
declare
  tipo text;
begin
  select format_type(atttypid, atttypmod) into tipo
    from pg_attribute
   where attrelid = 'public.viagens'::regclass
     and attname = 'valor_frete'
     and not attisdropped;

  execute format(
    'alter table viagens add column if not exists valor_estacionamento %s not null default 0',
    tipo);
end $$;

alter table viagens drop constraint if exists viagens_estacionamento_nao_negativo;
alter table viagens add constraint viagens_estacionamento_nao_negativo
  check (valor_estacionamento >= 0);

comment on column viagens.valor_estacionamento is
  'Estacionamento pago pela empresa e cobrado do cliente. Entra no total da ordem e no repasse; não entra no faturamento do Painel. Spec 05.';

-- 2. Resumo por ordem ---------------------------------------------------------------------
-- Mesmas colunas, na mesma ordem, e uma nova no fim: é o que `create or replace view`
-- aceita, e é o que evita recriar `devidos_entre_empresas` e `saldo_entre_empresas`, que
-- dependem desta view.
--
-- O `coalesce` no frete é defesa: viagem sem frete não entra em ordem (trigger), mas sem
-- ele uma linha com frete nulo levaria o estacionamento dela junto para fora da soma.
create or replace view ordens_resumo with (security_invoker = true) as
select
  o.id as ordem_id,
  count(v.id) as viagens,
  coalesce(sum(coalesce(v.valor_frete, 0) + v.valor_estacionamento), 0) as total,
  coalesce(sum(case when v.empresa = 'Rohan'
                    then coalesce(v.valor_frete, 0) + v.valor_estacionamento end), 0)
    as total_rohan,
  coalesce(sum(case when v.empresa = 'TransBeleze'
                    then coalesce(v.valor_frete, 0) + v.valor_estacionamento end), 0)
    as total_transbeleze,
  coalesce(sum(v.valor_estacionamento), 0) as total_estacionamento
from ordens_pagamento o
left join viagens v on v.ordem_id = o.id
group by o.id;

grant select on ordens_resumo to authenticated;

-- 3. Travas na viagem — versão corrente ---------------------------------------------------
-- Cópia da versão da 006, com uma mudança só: `valor_estacionamento` entra na trava da
-- ordem fechada/recebida/legado, e a mensagem passa a citá-lo.
create or replace function trv_viagem_em_ordem() returns trigger
language plpgsql as $$
declare
  ordem_antiga ordens_pagamento;
  ordem_nova ordens_pagamento;
  inicio date;
  -- Como a ordem é identificada na frase, e o que o usuário tem de fazer. Ordem de legado
  -- e ordem fechada admitem saídas diferentes.
  descricao text;
  saida text;
begin
  if tg_op = 'DELETE' then
    if old.ordem_id is not null then
      select * into ordem_antiga from ordens_pagamento where id = old.ordem_id;
      if ordem_antiga.id is not null and ordem_antiga.status <> 'aberta' then
        if ordem_antiga.legado then
          raise exception using errcode = 'TRV01', message = format(
            'Viagem #%s está na quitação de legado #%s. Tire a viagem da quitação e então exclua.',
            old.id, ordem_antiga.id);
        else
          raise exception using errcode = 'TRV01', message = format(
            'Viagem #%s está na ordem #%s (%s). Reabra a ordem na web, tire a viagem dela e então exclua.',
            old.id, ordem_antiga.id, ordem_antiga.status);
        end if;
      end if;
    end if;
    return old;
  end if;

  if new.ordem_id is not null
     and (tg_op = 'INSERT' or old.ordem_id is distinct from new.ordem_id) then
    select * into ordem_nova from ordens_pagamento where id = new.ordem_id;
  end if;

  -- Entrada na ordem. `ordem_nova.id` só está preenchido quando houve entrada E a ordem
  -- existe; ordem inexistente é assunto da chave estrangeira, não desta trigger.
  if ordem_nova.id is not null then
    if ordem_nova.cliente_id is distinct from new.cliente_id then
      raise exception using errcode = 'TRV01', message = format(
        'A ordem #%s é de outro cliente. Uma ordem só agrupa viagens do mesmo cliente.',
        ordem_nova.id);
    end if;

    if not ordem_nova.legado and ordem_nova.status <> 'aberta' then
      raise exception using errcode = 'TRV01', message = format(
        'A ordem #%s está %s. Reabra a ordem na web para incluir viagens.',
        ordem_nova.id, ordem_nova.status);
    end if;

    if new.empresa is null then
      raise exception using errcode = 'TRV01', message = format(
        'Viagem #%s não tem empresa definida e não pode entrar numa ordem.', new.id);
    end if;

    if new.valor_frete is null then
      raise exception using errcode = 'TRV01', message = format(
        'Viagem #%s não tem valor de frete e não pode entrar numa ordem.', new.id);
    end if;

    -- Pagamento ao motorista e estacionamento NÃO são exigidos.
    if new.status not in ('concluida', 'realizada_pendente') then
      raise exception using errcode = 'TRV01', message = format(
        'Viagem #%s não está realizada (situação: %s). Só viagem concluída, ou realizada com pagamento ao motorista pendente, entra numa ordem.',
        new.id, new.status);
    end if;

    if ordem_nova.legado then
      select inicio_controle into inicio from configuracao_financeira where id = 1;
      if new.data >= inicio then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s é de %s, a partir do início do controle (%s). Ela não é legado: inclua numa ordem normal.',
          new.id, to_char(new.data, 'DD/MM/YYYY'), to_char(inicio, 'DD/MM/YYYY'));
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.ordem_id is not null then
    select * into ordem_antiga from ordens_pagamento where id = old.ordem_id;

    if ordem_antiga.id is null then
      -- A ordem não existe mais: este update é a cascata do `on delete set null`,
      -- devolvendo a viagem para "a faturar" depois de a ordem aberta ser excluída.
      return new;
    end if;

    if ordem_antiga.status = 'aberta' then
      if new.status = 'cancelada' and old.status <> 'cancelada' then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está na ordem #%s. Tire a viagem da ordem antes de cancelá-la.',
          old.id, ordem_antiga.id);
      end if;
    else
      -- Ordem fechada, recebida ou quitação de legado. Fica livre tudo que não muda o que
      -- foi cobrado: valor_motorista, motorista, caminhão, data, observações, e a passagem
      -- entre realizada_pendente e concluida, de que a tarefa agendada (008) depende.
      if ordem_antiga.legado then
        descricao := format('na quitação de legado #%s', ordem_antiga.id);
        saida := format('Tire a viagem da quitação de legado #%s para poder alterá-la.',
                        ordem_antiga.id);
      else
        descricao := format('na ordem #%s (%s)', ordem_antiga.id, ordem_antiga.status);
        saida := 'Reabra a ordem na web para alterar.';
      end if;

      -- [spec 05] O estacionamento entra no total cobrado do cliente, então trava junto.
      if new.valor_frete is distinct from old.valor_frete
         or new.valor_estacionamento is distinct from old.valor_estacionamento
         or new.empresa is distinct from old.empresa
         or new.cliente_id is distinct from old.cliente_id then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está %s e o frete, o estacionamento, a empresa e o cliente dela estão travados. %s',
          old.id, descricao, saida);
      end if;

      if new.status = 'cancelada' and old.status <> 'cancelada' then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está %s e não pode ser cancelada. %s', old.id, descricao, saida);
      end if;

      -- Sair da ordem é liberado na quitação de legado, para desfazer quitação feita por
      -- engano. Numa ordem fechada ou recebida, sair mudaria o que foi cobrado do cliente.
      if new.ordem_id is distinct from old.ordem_id and not ordem_antiga.legado then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está na ordem #%s (%s). Reabra a ordem na web para tirá-la.',
          old.id, ordem_antiga.id, ordem_antiga.status);
      end if;
    end if;
  end if;

  return new;
end $$;

commit;

-- Conferência automática. É consulta, e não `raise notice`: o SQL Editor do Supabase
-- descarta notices e mostra só o resultado da última consulta.
-- Esperado: seis linhas, todas com ok = true.
select item, esperado, obtido, obtido = esperado as ok
from (
  values
    ('coluna valor_estacionamento com o mesmo tipo do frete',
     (select format_type(atttypid, atttypmod) from pg_attribute
       where attrelid = 'public.viagens'::regclass and attname = 'valor_frete'),
     (select format_type(atttypid, atttypmod) from pg_attribute
       where attrelid = 'public.viagens'::regclass and attname = 'valor_estacionamento')),

    ('nenhuma viagem com estacionamento nulo ou diferente de zero',
     '0',
     (select count(*)::text from viagens
       where valor_estacionamento is null or valor_estacionamento <> 0)),

    ('trava de valor negativo',
     '1',
     (select count(*)::text from pg_constraint
       where conname = 'viagens_estacionamento_nao_negativo')),

    ('ordens_resumo com total_estacionamento',
     '1',
     (select count(*)::text from information_schema.columns
       where table_schema = 'public' and table_name = 'ordens_resumo'
         and column_name = 'total_estacionamento')),

    ('ordens_resumo continua com security_invoker',
     'true',
     (select case when 'security_invoker=true' = any(coalesce(reloptions, '{}'))
                  then 'true' else 'false' end
        from pg_class where oid = 'public.ordens_resumo'::regclass)),

    ('a trava da viagem já conhece o estacionamento',
     'true',
     (select case when count(*) > 0 then 'true' else 'false' end
        from pg_proc
       where proname = 'trv_viagem_em_ordem'
         and prosrc like '%valor_estacionamento%'))
) as t(item, esperado, obtido);

-- Os critérios 1 a 5 da spec têm script próprio em
-- docs/verificacoes/009-estacionamento-testes.sql, todo dentro de begin/rollback.

-- Reversão. ATENÇÃO: apaga o estacionamento lançado. Antes de rodar, exporte
--   select id, data, empresa, valor_frete, valor_estacionamento
--     from viagens where valor_estacionamento > 0;
-- Reverta junto a web da spec 05: ela grava a coluna.
--
-- A view mantém a coluna `total_estacionamento` (zerada), porque `create or replace view`
-- não remove coluna, e derrubar a view levaria junto `devidos_entre_empresas` e
-- `saldo_entre_empresas`.
--
--   begin;
--   create or replace view ordens_resumo with (security_invoker = true) as
--   select
--     o.id as ordem_id,
--     count(v.id) as viagens,
--     coalesce(sum(v.valor_frete), 0) as total,
--     coalesce(sum(case when v.empresa = 'Rohan' then v.valor_frete end), 0) as total_rohan,
--     coalesce(sum(case when v.empresa = 'TransBeleze' then v.valor_frete end), 0)
--       as total_transbeleze,
--     coalesce(sum(v.valor_frete * 0), 0) as total_estacionamento
--   from ordens_pagamento o
--   left join viagens v on v.ordem_id = o.id
--   group by o.id;
--   -- e então rode a seção "1. Travas na viagem" da 006_mensagens_trava.sql
--   alter table viagens drop constraint if exists viagens_estacionamento_nao_negativo;
--   alter table viagens drop column if exists valor_estacionamento;
--   commit;

-- Migration: ordens de pagamento, recebimento e travas de viagem faturada
--
-- Rode este script inteiro no Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- O QUE FAZ
-- Aditiva: nenhuma coluna existente muda de tipo ou de significado. `viagens.status`
-- continua descrevendo só o ciclo operacional da viagem — estado financeiro nunca entra
-- nele. Cria:
--
--   1. `ordens_pagamento` — a cobrança que agrupa viagens realizadas de um cliente. O
--      total NUNCA é gravado: é sempre a soma de `valor_frete` das viagens da ordem.
--   2. `configuracao_financeira` — uma linha, com a data em que o controle começa
--      (01/10/2026). Antes dela, viagem sem ordem é "legado a conferir".
--   3. `viagens.ordem_id` — a ligação, opcional, com `on delete set null`.
--   4. `ordens_resumo` — view com quantidade, total e total por empresa de cada ordem.
--   5. Duas funções de trigger com as travas.
--
-- IMPACTO NA WEB
-- Nada quebra: a web só enxerga `ordem_id` depois que as telas da spec 02 subirem. Até
-- lá nenhuma viagem tem ordem, e as travas (que só olham viagem COM `ordem_id`) nunca
-- disparam. É por isso que esta migration pode subir antes do deploy.
--
-- IMPACTO NO AGENTE
-- As consultas dele listam colunas explícitas (`SELECT_COMPLETO` em
-- services/viagens.js), então `ordem_id` não aparece nos resultados, e nem
-- `criar_viagem_rascunho` nem `atualizar_viagem` enviam essa coluna. O agente só é
-- afetado quando tenta alterar uma viagem travada: aí recebe o erro TRV01 e repassa a
-- mensagem ao usuário. `gerar_relatorio` continua calculando pela data da viagem e não
-- enxerga ordens.
--
-- POR QUE AS REGRAS ESTÃO NO BANCO, E NÃO NA WEB
-- O agente usa a chave secreta e ignora RLS. Trava que vive no cliente não vale para ele.
-- Todo erro de regra sai com o SQLSTATE `TRV01` e uma mensagem escrita para ser mostrada
-- ao usuário como está — é o que a web põe no toast e o que o agente repassa no Telegram.
--
-- DUAS FUNÇÕES, NÃO SEIS
-- Uma trigger em `viagens` cobre os itens 1 a 3 da spec (entrada na ordem, viagem em
-- ordem aberta, viagem em ordem fechada ou recebida) e outra em `ordens_pagamento` cobre
-- as transições e a ordem de legado. Juntas num lugar por tabela, a ordem de avaliação
-- fica explícita e a reversão é previsível.
--
-- O QUE O TRIGGER GRAVA SOZINHO
-- `fechada_em` (quando não vem preenchida), `reaberta_em` e a limpeza de `recebida_em` /
-- `empresa_recebedora` ao desfazer um recebimento. Deixar isso para o cliente seria
-- confiar em quem chama; aqui vale igual para a web e para o agente.
--
-- PRÉ-CONDIÇÕES
--   1. Migration 004 aplicada (login dos gerentes). As tabelas novas nascem com RLS e a
--      mesma policy "gerentes autenticados".
--   2. Anotar antes os totais do Painel de setembro/2026 (critério 11 da spec).

begin;

-- 1. Configuração financeira ------------------------------------------------------------
-- Uma linha só, garantida pelo `check (id = 1)`: sem isso, nada impede uma segunda linha
-- com outra data de início e duas respostas diferentes para "isto é legado?".
create table if not exists configuracao_financeira (
  id int primary key default 1 check (id = 1),
  inicio_controle date not null
);

insert into configuracao_financeira (id, inicio_controle)
values (1, '2026-10-01')
on conflict (id) do nothing;

alter table configuracao_financeira enable row level security;

create policy "gerentes autenticados" on configuracao_financeira
  for all to authenticated using (true) with check (true);

-- 2. Ordens de pagamento ----------------------------------------------------------------
create table if not exists ordens_pagamento (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references clientes(id),
  status text not null default 'aberta'
    check (status in ('aberta', 'fechada', 'recebida')),
  -- Ordem de legado: quita viagens pagas antes do sistema. Nasce e fica 'recebida', sem
  -- data de recebimento, sem conta e sem nota — e por não ter data de recebimento, não
  -- entra no recebido de nenhum período.
  legado boolean not null default false,
  criada_em timestamptz not null default now(),
  fechada_em date,
  vencimento date,
  forma_pagamento text
    check (forma_pagamento in ('pix', 'boleto', 'transferencia', 'dinheiro')),
  com_nota boolean not null default false,
  empresa_nota text check (empresa_nota in ('Rohan', 'TransBeleze')),
  -- Número e data da nota são editáveis em qualquer estado: a nota costuma sair depois.
  numero_nota text,
  data_nota date,
  recebida_em date,
  -- Conta em que o dinheiro caiu. Não é a empresa que fez a viagem: nos resumos, cada
  -- viagem conta como recebida pela empresa que a realizou.
  empresa_recebedora text check (empresa_recebedora in ('Rohan', 'TransBeleze')),
  reaberta_em timestamptz,
  motivo_reabertura text,
  observacoes text,

  -- Os dois invariantes financeiros ficam também como constraint, não só na trigger: a
  -- trigger é quem dá a mensagem boa, mas uma constraint não pode ser desabilitada nem
  -- contornada. Na prática elas nunca disparam — a trigger barra antes.
  constraint ordem_recebida_tem_data_e_conta check (
    status <> 'recebida' or legado
    or (recebida_em is not null and empresa_recebedora is not null)
  ),
  constraint ordem_legado_e_recebida_e_limpa check (
    not legado
    or (status = 'recebida'
        and recebida_em is null and empresa_recebedora is null
        and com_nota = false and empresa_nota is null
        and numero_nota is null and data_nota is null)
  )
);

-- No máximo uma ordem de legado por cliente (critério 14).
create unique index if not exists ordens_legado_unica_por_cliente
  on ordens_pagamento (cliente_id) where legado;

create index if not exists ordens_pagamento_cliente_idx
  on ordens_pagamento (cliente_id);
create index if not exists ordens_pagamento_status_idx
  on ordens_pagamento (status);

alter table ordens_pagamento enable row level security;

create policy "gerentes autenticados" on ordens_pagamento
  for all to authenticated using (true) with check (true);

-- 3. Ligação da viagem com a ordem ------------------------------------------------------
-- `on delete set null`: excluir uma ordem aberta devolve as viagens para "a faturar"
-- (critério 8) sem apagar nada de viagem.
alter table viagens
  add column if not exists ordem_id bigint
    references ordens_pagamento(id) on delete set null;

create index if not exists viagens_ordem_idx on viagens (ordem_id);

-- 4. Resumo por ordem -------------------------------------------------------------------
-- `security_invoker = true` é o que faz a view rodar com os privilégios de quem consulta,
-- e portanto respeitar o RLS das tabelas de baixo. Sem isso ela roda como dona e fica
-- aberta para a chave publishable do bundle (critério 9).
create or replace view ordens_resumo with (security_invoker = true) as
select
  o.id as ordem_id,
  count(v.id) as viagens,
  coalesce(sum(v.valor_frete), 0) as total,
  coalesce(sum(case when v.empresa = 'Rohan' then v.valor_frete end), 0) as total_rohan,
  coalesce(sum(case when v.empresa = 'TransBeleze' then v.valor_frete end), 0)
    as total_transbeleze
from ordens_pagamento o
left join viagens v on v.ordem_id = o.id
group by o.id;

-- 5. Privilégios ------------------------------------------------------------------------
-- O Supabase costuma conceder isso por default privileges no schema public, mas um
-- `grant` explícito deixa a migration autossuficiente — e sem ele a web responderia 401
-- em vez de lista vazia, que é um sintoma bem mais confuso.
grant select, insert, update, delete on ordens_pagamento to authenticated;
grant select, update on configuracao_financeira to authenticated;
grant select on ordens_resumo to authenticated;

-- 6. Travas na viagem (itens 1 a 3 da spec) ---------------------------------------------
create or replace function trv_viagem_em_ordem() returns trigger
language plpgsql as $$
declare
  ordem_antiga ordens_pagamento;
  ordem_nova ordens_pagamento;
  inicio date;
begin
  if tg_op = 'DELETE' then
    if old.ordem_id is not null then
      select * into ordem_antiga from ordens_pagamento where id = old.ordem_id;
      if ordem_antiga.id is not null and ordem_antiga.status <> 'aberta' then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está na ordem #%s (%s). Tire a viagem da ordem antes de excluí-la.',
          old.id, ordem_antiga.id, ordem_antiga.status);
      end if;
    end if;
    return old;
  end if;

  -- Entrada na ordem: insert com ordem_id, ou update que muda o ordem_id.
  if new.ordem_id is not null
     and (tg_op = 'INSERT' or old.ordem_id is distinct from new.ordem_id) then
    select * into ordem_nova from ordens_pagamento where id = new.ordem_id;
  end if;

  -- Entrada na ordem. `ordem_nova.id` só está preenchido quando houve entrada E a ordem
  -- existe. Ordem inexistente não é assunto desta trigger: a chave estrangeira recusa a
  -- linha no fim do comando, com a mensagem padrão do Postgres. Sem esta guarda as
  -- comparações rodariam contra um registro todo nulo e acusariam "outro cliente" para um
  -- id que simplesmente não existe.
  if ordem_nova.id is not null then
    if ordem_nova.cliente_id is distinct from new.cliente_id then
      raise exception using errcode = 'TRV01', message = format(
        'A ordem #%s é de outro cliente. Uma ordem só agrupa viagens do mesmo cliente.',
        ordem_nova.id);
    end if;

    -- A ordem de legado é 'recebida' por definição e aceita entrada; as demais, só abertas.
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

    -- Pagamento ao motorista NÃO é exigido: a viagem pode ser cobrada antes de o acerto
    -- com o motorista estar fechado.
    if new.status not in ('concluida', 'realizada_pendente') then
      raise exception using errcode = 'TRV01', message = format(
        'Viagem #%s está %s. Só viagem realizada entra numa ordem.', new.id, new.status);
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

  -- Travas de quem já está numa ordem. Olha a ordem ANTIGA: é ela que foi enviada ao
  -- cliente e, no caso da fechada ou recebida, é ela que o valor não pode contrariar.
  if tg_op = 'UPDATE' and old.ordem_id is not null then
    select * into ordem_antiga from ordens_pagamento where id = old.ordem_id;

    if ordem_antiga.id is null then
      -- A ordem não existe mais: este update é a própria cascata do `on delete set null`,
      -- devolvendo a viagem para "a faturar" depois de a ordem aberta ser excluída
      -- (critério 8). Nada a travar — e deixar claro aqui evita que a permissão venha por
      -- acidente, da aritmética de NULL das comparações abaixo.
      return new;
    end if;

    if ordem_antiga.status = 'aberta' then
      -- Ordem aberta: tudo pode ser editado, menos cancelar.
      if new.status = 'cancelada' and old.status <> 'cancelada' then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está na ordem #%s. Tire a viagem da ordem antes de cancelá-la.',
          old.id, ordem_antiga.id);
      end if;
    else
      -- Ordem fechada ou recebida. Fica livre tudo que não muda o que foi cobrado:
      -- valor_motorista, motorista, caminhão, data, observações, e a passagem entre
      -- realizada_pendente e concluida, de que o cron do agente depende.
      if new.valor_frete is distinct from old.valor_frete then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está na ordem #%s (%s). Para alterar valor, empresa ou cliente, reabra a ordem na web.',
          old.id, ordem_antiga.id, ordem_antiga.status);
      end if;
      if new.empresa is distinct from old.empresa then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está na ordem #%s (%s). Para alterar valor, empresa ou cliente, reabra a ordem na web.',
          old.id, ordem_antiga.id, ordem_antiga.status);
      end if;
      if new.cliente_id is distinct from old.cliente_id then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está na ordem #%s (%s). Para alterar valor, empresa ou cliente, reabra a ordem na web.',
          old.id, ordem_antiga.id, ordem_antiga.status);
      end if;
      if new.status = 'cancelada' and old.status <> 'cancelada' then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está na ordem #%s (%s) e não pode ser cancelada. Reabra a ordem na web.',
          old.id, ordem_antiga.id, ordem_antiga.status);
      end if;
      -- Sair da ordem: liberado só na ordem de legado, para desfazer uma quitação feita
      -- por engano. Numa ordem fechada ou recebida de verdade, sair mudaria o que foi
      -- cobrado do cliente.
      if new.ordem_id is distinct from old.ordem_id and not ordem_antiga.legado then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está na ordem #%s (%s). Reabra a ordem na web para tirá-la.',
          old.id, ordem_antiga.id, ordem_antiga.status);
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trv_viagem_em_ordem on viagens;
create trigger trv_viagem_em_ordem
  before insert or update or delete on viagens
  for each row execute function trv_viagem_em_ordem();

-- 7. Travas da ordem (item 4 da spec) ---------------------------------------------------
create or replace function trv_ordem_transicao() returns trigger
language plpgsql as $$
declare
  qtd_viagens int;
begin
  if tg_op = 'DELETE' then
    -- Ordem de legado é 'recebida', então cai aqui pela mesma regra: só ordem aberta é
    -- excluída. Uma ordem de legado que ficou sem viagens continua existindo, vazia, e é
    -- reaproveitada na próxima quitação daquele cliente (há uma só por cliente).
    if old.status <> 'aberta' then
      raise exception using errcode = 'TRV01', message = format(
        'A ordem #%s está %s e não pode ser excluída. Só ordem aberta é excluída.',
        old.id, old.status);
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.legado then
      if new.status <> 'recebida' then
        raise exception using errcode = 'TRV01', message =
          'A ordem de legado nasce como recebida.';
      end if;
    elsif new.status <> 'aberta' then
      raise exception using errcode = 'TRV01', message =
        'Uma ordem nasce aberta. Feche-a depois de incluir as viagens.';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.legado is distinct from old.legado then
    raise exception using errcode = 'TRV01', message = format(
      'A ordem #%s não pode deixar de ser (ou passar a ser) ordem de legado.', old.id);
  end if;

  if old.legado then
    -- A ordem de legado não passa pelas transições: ela é só o carimbo de "já pago antes
    -- do sistema". O que muda nela é a composição de viagens, não o estado.
    if new.status is distinct from old.status then
      raise exception using errcode = 'TRV01', message = format(
        'A ordem de legado #%s não muda de situação.', old.id);
    end if;
    return new;
  end if;

  if new.cliente_id is distinct from old.cliente_id then
    select count(*) into qtd_viagens from viagens where ordem_id = old.id;
    if qtd_viagens > 0 then
      raise exception using errcode = 'TRV01', message = format(
        'A ordem #%s já tem %s viagem(ns). Tire as viagens antes de trocar o cliente.',
        old.id, qtd_viagens);
    end if;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'aberta' and new.status = 'fechada' then
      select count(*) into qtd_viagens from viagens where ordem_id = old.id;
      if qtd_viagens = 0 then
        raise exception using errcode = 'TRV01', message = format(
          'A ordem #%s não tem nenhuma viagem e não pode ser fechada.', old.id);
      end if;
      if new.com_nota and new.empresa_nota is null then
        raise exception using errcode = 'TRV01', message =
          'Informe qual empresa emite a nota desta ordem.';
      end if;
      -- Data de envio: aceita a que vem do cliente, senão hoje.
      new.fechada_em := coalesce(new.fechada_em, current_date);

    elsif old.status = 'fechada' and new.status = 'recebida' then
      if new.recebida_em is null then
        raise exception using errcode = 'TRV01', message =
          'Informe a data em que o dinheiro entrou.';
      end if;
      if new.empresa_recebedora is null then
        raise exception using errcode = 'TRV01', message =
          'Informe em qual conta o dinheiro caiu.';
      end if;

    elsif old.status = 'fechada' and new.status = 'aberta' then
      if coalesce(btrim(new.motivo_reabertura), '') = '' then
        raise exception using errcode = 'TRV01', message = format(
          'Informe o motivo para reabrir a ordem #%s.', old.id);
      end if;
      new.reaberta_em := now();

    elsif old.status = 'recebida' and new.status = 'fechada' then
      -- Desfazer recebimento: a limpeza é feita aqui, não pelo cliente, para não sobrar
      -- data de recebimento numa ordem que voltou a estar a receber.
      new.recebida_em := null;
      new.empresa_recebedora := null;

    else
      raise exception using errcode = 'TRV01', message = format(
        'A ordem #%s não pode ir de %s para %s.', old.id, old.status, new.status);
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trv_ordem_transicao on ordens_pagamento;
create trigger trv_ordem_transicao
  before insert or update or delete on ordens_pagamento
  for each row execute function trv_ordem_transicao();

commit;

-- Conferência automática. É uma CONSULTA, e não `raise notice`, de propósito: o SQL Editor
-- do Supabase descarta notices, e uma migration que confirma o próprio resultado em
-- mensagem invisível não confirma nada. Roda depois do commit, então é só leitura.
--
-- Esperado: sete linhas, todas com ok = true.
select item, esperado, obtido, obtido = esperado as ok
from (
  values
    ('inicio_controle',
     '2026-10-01',
     (select inicio_controle::text from configuracao_financeira where id = 1)),

    ('ordens existentes',
     '0',
     (select count(*)::text from ordens_pagamento)),

    ('viagens com ordem',
     '0',
     (select count(*)::text from viagens where ordem_id is not null)),

    ('policies "gerentes autenticados" nas tabelas novas',
     '2',
     (select count(*)::text from pg_policies
       where schemaname = 'public'
         and tablename in ('ordens_pagamento', 'configuracao_financeira')
         and policyname = 'gerentes autenticados'
         and roles = array['authenticated']::name[])),

    ('RLS ativo nas tabelas novas',
     '2',
     (select count(*)::text from pg_class
       where relnamespace = 'public'::regnamespace
         and relname in ('ordens_pagamento', 'configuracao_financeira')
         and relrowsecurity)),

    ('ordens_resumo com security_invoker',
     'true',
     (select case when 'security_invoker=true' = any(coalesce(reloptions, '{}'))
                  then 'true' else 'false' end
        from pg_class
       where relnamespace = 'public'::regnamespace and relname = 'ordens_resumo')),

    ('triggers de trava instaladas',
     '2',
     (select count(*)::text from pg_trigger
       where not tgisinternal
         and tgname in ('trv_viagem_em_ordem', 'trv_ordem_transicao')))
) as t(item, esperado, obtido);

-- Os critérios 1 a 8 e 12 a 14 da spec têm script próprio em
-- docs/specs/02-ordens-testes.sql, todo dentro de begin/rollback. O critério 9 é por curl,
-- no roteiro docs/specs/02-ordens-deploy.md.

-- Reversão. ATENÇÃO: apaga as ordens lançadas. Antes de rodar, exporte
--   select * from ordens_pagamento;
--   select id, ordem_id from viagens where ordem_id is not null;
-- A web da spec 02 precisa ser revertida junto (ela consulta estas tabelas). O agente
-- funciona com o banco antes e depois desta migration, e não precisa ser revertido.
--
--   begin;
--   drop trigger if exists trv_viagem_em_ordem on viagens;
--   drop trigger if exists trv_ordem_transicao on ordens_pagamento;
--   drop function if exists trv_viagem_em_ordem();
--   drop function if exists trv_ordem_transicao();
--   drop view if exists ordens_resumo;
--   alter table viagens drop column if exists ordem_id;
--   drop table if exists ordens_pagamento;
--   drop table if exists configuracao_financeira;
--   commit;

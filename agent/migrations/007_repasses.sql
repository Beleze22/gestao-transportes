-- Migration: repasses entre as empresas, alíquota e saldo
--
-- Rode este script inteiro no Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- ATENÇÃO AO NÚMERO: a spec 03 pede "006_repasses.sql", mas a 006 já existe e está
-- aplicada — é a correção das mensagens de trava que saiu da validação da spec 02. Esta é
-- a 007. A spec foi escrita antes de a 006 existir.
--
-- ONDE MORA A REGRA DE TRANSIÇÃO DA ORDEM, DEPOIS DESTA MIGRATION
-- Em `trv_ordem_transicao`, e a versão corrente é a DESTE arquivo. A 005 criou a função, a
-- 006 reescreveu as mensagens, e a 007 acrescenta a alíquota e as travas da ordem recebida.
-- Quem for ler a regra tem de ler aqui, não lá.
--
-- O QUE FAZ
--   1. `aliquotas_repasse` — uma linha por empresa, com a alíquota estimada de imposto.
--      Começa em 9% nas duas, que é a faixa de set/2026.
--   2. `ordens_pagamento.aliquota_repasse` — a alíquota da EMISSORA, copiada no momento do
--      recebimento. Mudar a alíquota depois não mexe em ordem já recebida: o repasse foi
--      combinado com o número daquele dia.
--   3. `movimentos_entre_empresas` — repasses (dinheiro que foi) e ajustes (dívida sem
--      ordem por trás, como o saldo anterior a 01/10/2026).
--   4. `devidos_entre_empresas` — a regra de cálculo aplicada às ordens recebidas. Nenhum
--      devido é gravado: ele é sempre derivado da ordem.
--   5. `saldo_entre_empresas` — devidos + ajustes − repasses, sempre no sentido
--      TransBeleze → Rohan.
--   6. Travas novas na ordem recebida.
--
-- A REGRA DE CÁLCULO, E POR QUE O TERCEIRO CASO É ASSIM
-- Sendo T o total da ordem, V a parte das viagens da OUTRA empresa (não a de quem recebeu)
-- e `a` a alíquota da emissora:
--
--   sem nota ................................. devido = V
--   nota de quem recebeu o dinheiro .......... devido = V × (1 − a)
--   nota da outra empresa .................... devido = V + a × (T − V)
--
-- No terceiro caso quem recebeu repassa a parte da outra inteira E devolve o imposto das
-- próprias viagens, porque quem vai pagar o imposto da nota inteira é a outra empresa.
--
-- Conferência com T=1500 (Rohan 1000, TB 500) e a=9%, que são os exemplos da spec:
--   sem nota, caiu na Rohan ........ Rohan deve 500,00 à TB
--   nota Rohan, caiu na Rohan ...... Rohan deve 455,00 à TB      (500 × 0,91)
--   nota Rohan, caiu na TB ......... TB deve 1.045,00 à Rohan    (1000 + 0,09 × 500)
--   nota TB, caiu na Rohan ......... Rohan deve 590,00 à TB      (500 + 0,09 × 1000)
--
-- IMPACTO NA WEB
-- Nada quebra. As telas da spec 02 não escrevem nos campos que esta migration trava — a
-- única forma de a web mexer em nota, conta ou data de recebimento é desfazendo o
-- recebimento, que continua permitido.
--
-- IMPACTO NO AGENTE
-- Nenhum. Ele não lê nem grava nenhuma das tabelas novas, e as travas novas são em colunas
-- de `ordens_pagamento`, que ele nunca escreve.
--
-- PRÉ-CONDIÇÕES: migrations 005 e 006 aplicadas.

begin;

-- 1. Alíquotas ---------------------------------------------------------------------------
-- O imposto é pago uma vez por mês, no mês seguinte, por quem emitiu a nota. O repasse não
-- pode esperar por isso, então usa uma estimativa: a do mês anterior, arredondada para
-- cima. É por isso que `atualizada_em` existe — a web avisa quando passa de 35 dias.
create table if not exists aliquotas_repasse (
  empresa text primary key check (empresa in ('Rohan', 'TransBeleze')),
  aliquota numeric not null check (aliquota >= 0 and aliquota <= 1),
  atualizada_em timestamptz not null default now()
);

insert into aliquotas_repasse (empresa, aliquota)
values ('Rohan', 0.09), ('TransBeleze', 0.09)
on conflict (empresa) do nothing;

alter table aliquotas_repasse enable row level security;

create policy "gerentes autenticados" on aliquotas_repasse
  for all to authenticated using (true) with check (true);

-- 2. A alíquota usada em cada ordem ------------------------------------------------------
alter table ordens_pagamento
  add column if not exists aliquota_repasse numeric
    check (aliquota_repasse is null or (aliquota_repasse >= 0 and aliquota_repasse <= 1));

-- 3. Movimentos entre as empresas --------------------------------------------------------
create table if not exists movimentos_entre_empresas (
  id bigint generated always as identity primary key,
  data date not null default current_date,
  tipo text not null check (tipo in ('repasse', 'ajuste')),
  de_empresa text not null check (de_empresa in ('Rohan', 'TransBeleze')),
  para_empresa text not null check (para_empresa in ('Rohan', 'TransBeleze')),
  valor numeric not null,
  observacao text,
  criado_em timestamptz not null default now(),

  -- As três regras do critério 8 também como constraint, além da trigger: a trigger dá a
  -- mensagem legível, a constraint é o que não se desabilita. Na prática nunca disparam.
  constraint movimento_entre_empresas_diferentes check (de_empresa <> para_empresa),
  constraint movimento_valor_positivo check (valor > 0),
  constraint movimento_ajuste_tem_observacao check (
    tipo <> 'ajuste' or coalesce(btrim(observacao), '') <> ''
  )
);

create index if not exists movimentos_entre_empresas_data_idx
  on movimentos_entre_empresas (data);

alter table movimentos_entre_empresas enable row level security;

create policy "gerentes autenticados" on movimentos_entre_empresas
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on aliquotas_repasse to authenticated;
grant select, insert, update, delete on movimentos_entre_empresas to authenticated;

-- 4. Trava dos movimentos ----------------------------------------------------------------
create or replace function trv_movimento_entre_empresas() returns trigger
language plpgsql as $$
begin
  if new.de_empresa = new.para_empresa then
    raise exception using errcode = 'TRV01', message =
      'Um movimento vai de uma empresa para a outra. Escolha empresas diferentes.';
  end if;

  if new.valor is null or new.valor <= 0 then
    raise exception using errcode = 'TRV01', message =
      'Informe um valor maior que zero.';
  end if;

  -- O ajuste é dívida sem ordem por trás: sem a explicação, ninguém entende meses depois
  -- de onde o valor veio. O repasse dispensa, porque a própria transferência explica.
  if new.tipo = 'ajuste' and coalesce(btrim(new.observacao), '') = '' then
    raise exception using errcode = 'TRV01', message =
      'Um ajuste precisa de observação dizendo de onde vem essa dívida.';
  end if;

  return new;
end $$;

drop trigger if exists trv_movimento_entre_empresas on movimentos_entre_empresas;
create trigger trv_movimento_entre_empresas
  before insert or update on movimentos_entre_empresas
  for each row execute function trv_movimento_entre_empresas();

-- 5. Transições da ordem — versão corrente ----------------------------------------------
-- Igual à da 006, mais: a cópia e a limpeza de `aliquota_repasse`, e a trava dos campos
-- que definem o repasse enquanto a ordem está recebida.
create or replace function trv_ordem_transicao() returns trigger
language plpgsql as $$
declare
  qtd_viagens int;
  legado_existente bigint;
  aliquota_da_emissora numeric;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'aberta' then
      if old.legado then
        raise exception using errcode = 'TRV01', message = format(
          'A quitação de legado #%s não é excluída. Tire as viagens dela, e ela fica vazia para a próxima quitação deste cliente.',
          old.id);
      else
        raise exception using errcode = 'TRV01', message = format(
          'A ordem #%s está %s e não pode ser excluída. Só ordem aberta é excluída.',
          old.id, old.status);
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.legado then
      if new.status <> 'recebida' then
        raise exception using errcode = 'TRV01', message =
          'A quitação de legado nasce como recebida.';
      end if;
      select id into legado_existente
        from ordens_pagamento
       where cliente_id = new.cliente_id and legado
       limit 1;
      if legado_existente is not null then
        raise exception using errcode = 'TRV01', message = format(
          'Este cliente já tem a quitação de legado #%s. Use ela para quitar outras viagens antigas.',
          legado_existente);
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
      'A ordem #%s não pode deixar de ser (ou passar a ser) quitação de legado.', old.id);
  end if;

  if old.legado then
    if new.status is distinct from old.status then
      raise exception using errcode = 'TRV01', message = format(
        'A quitação de legado #%s não muda de situação: ela só registra o que foi pago antes do sistema.',
        old.id);
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

  -- [spec 03] Ordem recebida: nota, conta, data e alíquota são o que define o repasse
  -- entre as empresas. Mexer neles com a ordem já recebida mudaria um valor que pode já
  -- ter sido transferido. A correção é desfazer o recebimento e receber de novo — e aí a
  -- alíquota é recopiada, com o valor de hoje.
  --
  -- A condição exige status inalterado de propósito: na transição recebida -> fechada é a
  -- própria função, mais abaixo, que limpa esses campos.
  if old.status = 'recebida' and new.status = old.status then
    if new.com_nota is distinct from old.com_nota
       or new.empresa_nota is distinct from old.empresa_nota
       or new.empresa_recebedora is distinct from old.empresa_recebedora
       or new.recebida_em is distinct from old.recebida_em
       or new.aliquota_repasse is distinct from old.aliquota_repasse then
      raise exception using errcode = 'TRV01', message = format(
        'A ordem #%s está recebida, e a nota, a conta e a data do recebimento definem o repasse entre as empresas. Desfaça o recebimento para corrigir qualquer um deles.',
        old.id);
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

      -- [spec 03] Congela a alíquota da emissora. Sem nota não há imposto a descontar, e a
      -- coluna fica nula — é o que a view usa para saber que o caso é "sem nota".
      if new.com_nota then
        select aliquota into aliquota_da_emissora
          from aliquotas_repasse where empresa = new.empresa_nota;
        if aliquota_da_emissora is null then
          raise exception using errcode = 'TRV01', message = format(
            'A alíquota de repasse da %s não está cadastrada. Cadastre em Alíquotas antes de receber esta ordem.',
            new.empresa_nota);
        end if;
        new.aliquota_repasse := aliquota_da_emissora;
      else
        new.aliquota_repasse := null;
      end if;

    elsif old.status = 'fechada' and new.status = 'aberta' then
      if coalesce(btrim(new.motivo_reabertura), '') = '' then
        raise exception using errcode = 'TRV01', message = format(
          'Informe o motivo para reabrir a ordem #%s.', old.id);
      end if;
      new.reaberta_em := now();

    elsif old.status = 'recebida' and new.status = 'fechada' then
      new.recebida_em := null;
      new.empresa_recebedora := null;
      -- [spec 03] A alíquota sai junto: ela só tem sentido com o recebimento de pé, e o
      -- devido desaparece do extrato no mesmo movimento (critério 5).
      new.aliquota_repasse := null;

    else
      raise exception using errcode = 'TRV01', message = format(
        'A ordem #%s não pode ir de %s para %s.', old.id, old.status, new.status);
    end if;
  end if;

  return new;
end $$;

-- A trigger continua a mesma, apontando para a função substituída. Recriada aqui só para o
-- caso de alguém ter rodado esta migration num banco onde ela não exista.
drop trigger if exists trv_ordem_transicao on ordens_pagamento;
create trigger trv_ordem_transicao
  before insert or update or delete on ordens_pagamento
  for each row execute function trv_ordem_transicao();

-- 6. Devidos -----------------------------------------------------------------------------
-- Uma linha por ordem recebida que gera devido. O valor NÃO é gravado em lugar nenhum: ele
-- é a regra aplicada sobre `ordens_resumo`, então corrigir a composição da ordem corrige o
-- devido sozinho.
--
-- `security_invoker = true` para a view respeitar o RLS das tabelas de baixo. Sem isso ela
-- roda como dona e entrega os valores para a chave publishable do bundle (critério 9).
create or replace view devidos_entre_empresas with (security_invoker = true) as
select *
from (
  select
    o.id as ordem_id,
    o.cliente_id,
    c.nome as cliente,
    o.recebida_em,
    o.com_nota,
    o.empresa_nota,
    o.empresa_recebedora as devedora,
    case when o.empresa_recebedora = 'Rohan' then 'TransBeleze' else 'Rohan' end as credora,
    coalesce(o.aliquota_repasse, 0) as aliquota,
    r.total,
    p.parte_da_outra,
    round(
      case
        -- Sem nota, não há imposto no meio: vai a parte da outra, inteira.
        when not o.com_nota then p.parte_da_outra
        -- Nota de quem recebeu: desconta o imposto que ele vai pagar sobre essa parte.
        when o.empresa_nota = o.empresa_recebedora
          then p.parte_da_outra * (1 - coalesce(o.aliquota_repasse, 0))
        -- Nota da outra: repassa a parte dela inteira e devolve o imposto das próprias
        -- viagens, porque é ela que vai pagar o imposto da nota toda.
        else p.parte_da_outra
             + coalesce(o.aliquota_repasse, 0) * (r.total - p.parte_da_outra)
      end,
      2
    ) as valor
  from ordens_pagamento o
  join ordens_resumo r on r.ordem_id = o.id
  left join clientes c on c.id = o.cliente_id
  cross join lateral (
    select case when o.empresa_recebedora = 'Rohan'
                then r.total_transbeleze else r.total_rohan end as parte_da_outra
  ) p
  -- Quitação de legado não gera devido: ela não recebeu dinheiro nenhum, só registra o que
  -- foi pago antes do sistema (critério 6).
  where o.status = 'recebida' and not o.legado
) d
-- Ordem só com viagens de quem recebeu, e com nota dele, não gera devido (critério 2).
where d.valor > 0;

-- 7. Saldo -------------------------------------------------------------------------------
-- Sempre no sentido TransBeleze -> Rohan: positivo, a TransBeleze deve à Rohan; negativo, o
-- contrário. Um sentido fixo evita a pergunta "positivo para quem?" em cada leitura.
--
-- Repasse entra com o sinal invertido porque ele PAGA a dívida de quem transferiu.
create or replace view saldo_entre_empresas with (security_invoker = true) as
select coalesce(sum(valor_com_sinal), 0) as saldo_tb_para_rohan
from (
  select case when devedora = 'TransBeleze' then valor else -valor end as valor_com_sinal
    from devidos_entre_empresas
  union all
  select case
           when tipo = 'repasse' then
             case when de_empresa = 'TransBeleze' then -valor else valor end
           else
             case when de_empresa = 'TransBeleze' then valor else -valor end
         end as valor_com_sinal
    from movimentos_entre_empresas
) t;

grant select on devidos_entre_empresas to authenticated;
grant select on saldo_entre_empresas to authenticated;

commit;

-- Conferência automática. É consulta, e não `raise notice`: o SQL Editor do Supabase
-- descarta notices e mostra só o resultado da última consulta.
-- Esperado: sete linhas, todas com ok = true.
select item, esperado, obtido, obtido = esperado as ok
from (
  values
    ('alíquotas cadastradas em 9%',
     '2',
     (select count(*)::text from aliquotas_repasse where aliquota = 0.09)),

    ('coluna aliquota_repasse em ordens_pagamento',
     '1',
     (select count(*)::text from information_schema.columns
       where table_schema = 'public' and table_name = 'ordens_pagamento'
         and column_name = 'aliquota_repasse')),

    ('movimentos: nenhum lançado ainda',
     '0',
     (select count(*)::text from movimentos_entre_empresas)),

    ('policies "gerentes autenticados" nas tabelas novas',
     '2',
     (select count(*)::text from pg_policies
       where schemaname = 'public'
         and tablename in ('aliquotas_repasse', 'movimentos_entre_empresas')
         and policyname = 'gerentes autenticados'
         and roles = array['authenticated']::name[])),

    ('RLS ativo nas tabelas novas',
     '2',
     (select count(*)::text from pg_class
       where relnamespace = 'public'::regnamespace
         and relname in ('aliquotas_repasse', 'movimentos_entre_empresas')
         and relrowsecurity)),

    ('as duas views novas com security_invoker',
     '2',
     (select count(*)::text from pg_class
       where relnamespace = 'public'::regnamespace
         and relname in ('devidos_entre_empresas', 'saldo_entre_empresas')
         and 'security_invoker=true' = any(coalesce(reloptions, '{}')))),

    ('a função de transição já conhece a alíquota',
     'true',
     (select case when count(*) > 0 then 'true' else 'false' end
        from pg_proc
       where proname = 'trv_ordem_transicao'
         and prosrc like '%aliquota_repasse%'))
) as t(item, esperado, obtido);

-- Os critérios 1 a 9 têm script próprio em docs/specs/03-repasses-testes.sql, todo dentro
-- de begin/rollback. O critério 10 (aviso de alíquota vencida) é manual, no roteiro
-- docs/specs/03-repasses-deploy.md.

-- Reversão. ATENÇÃO: apaga os movimentos lançados. Antes de rodar, exporte
--   select * from movimentos_entre_empresas;
-- A web da spec 03 precisa ser revertida junto. A spec 02 continua funcionando sem esta
-- migration, e o agente não é afetado.
--
-- A reversão precisa devolver `trv_ordem_transicao` à versão da 006 — rodar a seção 2 da
-- 006 faz isso, porque ela usa `create or replace`.
--
--   begin;
--   drop view if exists saldo_entre_empresas;
--   drop view if exists devidos_entre_empresas;
--   drop trigger if exists trv_movimento_entre_empresas on movimentos_entre_empresas;
--   drop function if exists trv_movimento_entre_empresas();
--   drop table if exists movimentos_entre_empresas;
--   alter table ordens_pagamento drop column if exists aliquota_repasse;
--   drop table if exists aliquotas_repasse;
--   -- e então rode a seção "2. Travas da ordem" da 006_mensagens_trava.sql
--   commit;

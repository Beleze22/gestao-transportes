-- Migration: corrige as mensagens das travas da 005
--
-- Rode este script inteiro no Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- POR QUE EXISTE
-- A 005 passou nos 36 casos de docs/specs/02-ordens-testes.sql, mas a leitura das mensagens
-- mostrou três que mandam o usuário fazer algo que a própria trava proíbe:
--
--   1. Viagem numa ordem de LEGADO dizia "reabra a ordem na web". Ordem de legado nunca
--      muda de situação — a instrução é impossível. O certo é tirar a viagem da quitação,
--      que é o que a trava permite justamente para desfazer quitação feita por engano.
--   2. Excluir viagem de ordem fechada dizia "tire a viagem da ordem antes de excluí-la".
--      Tirar a viagem também está travado nesse estado; primeiro é preciso reabrir.
--   3. "Viagem #589 está rascunho" / "está realizada_pendente" — status cru no meio da
--      frase, que o gerente lê no Telegram.
--
-- E uma quarta, de outra natureza: a segunda ordem de legado do mesmo cliente era barrada
-- pelo índice único, então a tela receberia "duplicate key value violates unique
-- constraint", em inglês e sem instrução. Agora a trigger confere antes e devolve TRV01. O
-- índice continua lá como rede de segurança.
--
-- O QUE NÃO MUDA
-- Nada de schema, nada de dado, nenhuma regra. Só o texto das mensagens e a ordem de
-- verificação da ordem de legado. As duas funções são substituídas por inteiro
-- (`create or replace`), e as triggers continuam apontando para elas — não é preciso
-- recriar trigger.
--
-- IMPACTO NA WEB E NO AGENTE
-- Nenhum, além de a mensagem melhorar. A web mostra o texto no toast e o agente repassa no
-- Telegram, os dois sem interpretar o conteúdo.
--
-- PRÉ-CONDIÇÃO: a 005 aplicada.

begin;

-- 1. Travas na viagem -------------------------------------------------------------------
create or replace function trv_viagem_em_ordem() returns trigger
language plpgsql as $$
declare
  ordem_antiga ordens_pagamento;
  ordem_nova ordens_pagamento;
  inicio date;
  -- Como a ordem é identificada na frase, e o que o usuário tem de fazer. Ordem de legado
  -- e ordem fechada admitem saídas diferentes, e é essa diferença que a 005 errava.
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

    -- A frase foi reescrita para não encaixar o status cru depois de "está": com
    -- 'rascunho' e 'realizada_pendente' aquilo saía torto. Agora o status aparece
    -- rotulado, e a frase diz o que vale em qualquer caso.
    -- Pagamento ao motorista NÃO é exigido: a viagem pode ser cobrada antes de o acerto
    -- com o motorista estar fechado.
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
      -- entre realizada_pendente e concluida, de que o cron do agente depende.
      if ordem_antiga.legado then
        descricao := format('na quitação de legado #%s', ordem_antiga.id);
        saida := format('Tire a viagem da quitação de legado #%s para poder alterá-la.',
                        ordem_antiga.id);
      else
        descricao := format('na ordem #%s (%s)', ordem_antiga.id, ordem_antiga.status);
        saida := 'Reabra a ordem na web para alterar.';
      end if;

      if new.valor_frete is distinct from old.valor_frete
         or new.empresa is distinct from old.empresa
         or new.cliente_id is distinct from old.cliente_id then
        raise exception using errcode = 'TRV01', message = format(
          'Viagem #%s está %s e o valor, a empresa e o cliente dela estão travados. %s',
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

-- 2. Travas da ordem --------------------------------------------------------------------
create or replace function trv_ordem_transicao() returns trigger
language plpgsql as $$
declare
  qtd_viagens int;
  legado_existente bigint;
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
      -- Confere antes do índice único: assim a tela recebe uma frase em português, com a
      -- ordem que já existe, e não o "duplicate key value violates unique constraint" do
      -- Postgres. O índice continua sendo a garantia de verdade.
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

    elsif old.status = 'fechada' and new.status = 'aberta' then
      if coalesce(btrim(new.motivo_reabertura), '') = '' then
        raise exception using errcode = 'TRV01', message = format(
          'Informe o motivo para reabrir a ordem #%s.', old.id);
      end if;
      new.reaberta_em := now();

    elsif old.status = 'recebida' and new.status = 'fechada' then
      new.recebida_em := null;
      new.empresa_recebedora := null;

    else
      raise exception using errcode = 'TRV01', message = format(
        'A ordem #%s não pode ir de %s para %s.', old.id, old.status, new.status);
    end if;
  end if;

  return new;
end $$;

commit;

-- Conferência: as duas funções foram substituídas e as triggers continuam ligadas a elas.
-- Esperado: duas linhas com ok = true.
select item, esperado, obtido, obtido = esperado as ok
from (
  values
    ('triggers ainda ligadas às funções',
     '2',
     (select count(*)::text from pg_trigger
       where not tgisinternal
         and tgname in ('trv_viagem_em_ordem', 'trv_ordem_transicao'))),

    -- Confirma que a substituição pegou, procurando o texto NOVO. Checar a ausência do
    -- texto antigo não serviria: a frase "Reabra a ordem na web" continua existindo, e com
    -- razão — ela é a instrução certa para ordem fechada, só não para quitação de legado.
    ('função da viagem já fala em "quitação de legado"',
     'true',
     (select case when count(*) > 0 then 'true' else 'false' end
        from pg_proc
       where proname = 'trv_viagem_em_ordem'
         and prosrc like '%quitação de legado%'))
) as t(item, esperado, obtido);

-- Depois desta migration, rode docs/specs/02-ordens-testes.sql de novo: ele ganhou três
-- casos que conferem o texto das mensagens, além dos 36 que já passavam.

-- Reversão: recria as funções como estavam na 005. Como só o texto muda, reverter é
-- cosmético — rodar a 005 de novo (ela usa `create or replace`) devolve as mensagens
-- antigas sem tocar em schema nem em dado.

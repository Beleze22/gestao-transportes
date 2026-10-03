-- Spec 02 — critérios 1 a 8 e 12 a 14, verificados no banco
--
-- Rode este script inteiro no SQL Editor DEPOIS da migration 005. Ele:
--   * cria os seus próprios dados de teste (cliente, motorista, caminhão e viagens),
--   * exercita cada critério,
--   * devolve UMA TABELA dizendo o que passou e o que não passou,
--   * e termina em `rollback` — nada fica no banco, nem as ordens nem as viagens de teste.
--
-- O resultado vem como tabela de propósito: o SQL Editor do Supabase não mostra `NOTICE`.
-- E vem como ÚLTIMA consulta porque o editor também mostra só o resultado final — por isso
-- o resumo (quantos passaram) sai antes do detalhe, invertendo a ordem que a intuição pede.
--
-- Olhe a coluna `passou`. Qualquer `false` é um desvio da spec — me mande a linha inteira.
--
-- O critério 9 (GET sem sessão devolve []) não é SQL: está no roteiro de deploy, em
-- docs/specs/02-ordens-deploy.md, como dois `curl`.
--
-- Os critérios 10 e 11 são de produção (Telegram e Painel), também no roteiro.

begin;

create temp table resultado_teste (
  criterio text,
  o_que text,
  esperado text,
  obtido text,
  passou boolean
) on commit drop;

do $$
declare
  cli_a bigint; cli_b bigint;
  mot bigint; cam bigint;
  ordem_normal bigint; ordem_mista bigint; ordem_legado bigint;
  v_concluida bigint; v_pendente bigint; v_confirmada bigint; v_cancelada bigint;
  v_rascunho bigint; v_sem_frete bigint; v_sem_empresa bigint; v_outro_cliente bigint;
  v_legado bigint; v_pos_controle bigint;
  v_rohan bigint; v_tb bigint;
  inicio date;
  tmp text; n int; d timestamptz;
begin
  select inicio_controle into inicio from configuracao_financeira where id = 1;

  -- ---------- dados de teste ----------
  insert into clientes (nome) values ('ZZ TESTE SPEC02 A') returning id into cli_a;
  insert into clientes (nome) values ('ZZ TESTE SPEC02 B') returning id into cli_b;
  insert into motoristas (nome) values ('ZZ TESTE SPEC02') returning id into mot;
  insert into caminhoes (placa, modelo) values ('ZZZ0000', 'Teste') returning id into cam;

  -- Uma viagem de cada situação, todas do cliente A salvo onde dito.
  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, 'Rohan', cli_a, mot, cam, 1000, 300, 'concluida')
  returning id into v_concluida;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, 'Rohan', cli_a, mot, cam, 500, null, 'realizada_pendente')
  returning id into v_pendente;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 30, 'Rohan', cli_a, mot, cam, 700, 200, 'confirmada')
  returning id into v_confirmada;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, 'Rohan', cli_a, mot, cam, 700, 200, 'cancelada')
  returning id into v_cancelada;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, 'Rohan', cli_a, mot, cam, 700, 200, 'rascunho')
  returning id into v_rascunho;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, 'Rohan', cli_a, mot, cam, null, 200, 'concluida')
  returning id into v_sem_frete;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, null, cli_a, mot, cam, 700, 200, 'concluida')
  returning id into v_sem_empresa;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, 'Rohan', cli_b, mot, cam, 700, 200, 'concluida')
  returning id into v_outro_cliente;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio - 20, 'Rohan', cli_a, mot, cam, 800, 250, 'concluida')
  returning id into v_legado;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 5, 'Rohan', cli_a, mot, cam, 900, 250, 'concluida')
  returning id into v_pos_controle;

  insert into ordens_pagamento (cliente_id) values (cli_a) returning id into ordem_normal;

  -- ---------- critério 1: quem não entra numa ordem ----------
  begin
    update viagens set ordem_id = ordem_normal where id = v_confirmada;
    insert into resultado_teste values ('1', 'viagem confirmada entra?', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('1', 'viagem confirmada entra?', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update viagens set ordem_id = ordem_normal where id = v_cancelada;
    insert into resultado_teste values ('1', 'viagem cancelada entra?', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('1', 'viagem cancelada entra?', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update viagens set ordem_id = ordem_normal where id = v_rascunho;
    insert into resultado_teste values ('1', 'viagem rascunho entra?', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('1', 'viagem rascunho entra?', 'recusa TRV01', sqlerrm, true);
    -- [006] "está rascunho" saía torto, e com 'realizada_pendente' sairia pior. O status
    -- agora vem rotulado, para a frase funcionar com qualquer valor.
    insert into resultado_teste values ('1', 'status aparece rotulado, não solto na frase',
      'com "situação: rascunho"', sqlerrm, sqlerrm like '%situação: rascunho%');
  end;

  begin
    update viagens set ordem_id = ordem_normal where id = v_sem_frete;
    insert into resultado_teste values ('1', 'viagem sem frete entra?', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('1', 'viagem sem frete entra?', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update viagens set ordem_id = ordem_normal where id = v_sem_empresa;
    insert into resultado_teste values ('1', 'viagem sem empresa entra?', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('1', 'viagem sem empresa entra?', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update viagens set ordem_id = ordem_normal where id = v_outro_cliente;
    insert into resultado_teste values ('1', 'viagem de outro cliente entra?', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('1', 'viagem de outro cliente entra?', 'recusa TRV01', sqlerrm, true);
  end;

  -- As duas que PODEM entrar: concluida e realizada_pendente (sem valor_motorista).
  begin
    update viagens set ordem_id = ordem_normal where id in (v_concluida, v_pendente);
    insert into resultado_teste values ('1', 'concluida e realizada_pendente entram', 'aceita', 'aceitou', true);
  exception when others then
    insert into resultado_teste values ('1', 'concluida e realizada_pendente entram', 'aceita', sqlerrm, false);
  end;

  -- ---------- critério 2: fechar ----------
  -- A ordem fica criada FORA do bloco com exception: a exceção desfaz tudo que o bloco
  -- gravou, e um `insert ... returning into` ali dentro deixaria a variável apontando para
  -- uma linha que não existe mais — os critérios 7 e 8 usam esta ordem depois.
  insert into ordens_pagamento (cliente_id) values (cli_b) returning id into ordem_mista;

  begin
    update ordens_pagamento set status = 'fechada' where id = ordem_mista;
    insert into resultado_teste values ('2', 'fechar ordem sem viagens', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('2', 'fechar ordem sem viagens', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update ordens_pagamento set status = 'fechada', com_nota = true, empresa_nota = null
     where id = ordem_normal;
    insert into resultado_teste values ('2', 'fechar com nota e sem empresa_nota', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('2', 'fechar com nota e sem empresa_nota', 'recusa TRV01', sqlerrm, true);
  end;

  -- Fecha de verdade, para os critérios 3 a 8.
  update ordens_pagamento
     set status = 'fechada', vencimento = inicio + 15, forma_pagamento = 'pix'
   where id = ordem_normal;

  select fechada_em into d from ordens_pagamento where id = ordem_normal;
  insert into resultado_teste values ('2', 'fechar grava fechada_em sozinho',
    'data preenchida', coalesce(d::text, 'nulo'), d is not null);

  -- ---------- critério 3: o que trava na ordem fechada ----------
  begin
    update viagens set valor_frete = 1200 where id = v_concluida;
    insert into resultado_teste values ('3', 'mudar valor_frete', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('3', 'mudar valor_frete', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update viagens set empresa = 'TransBeleze' where id = v_concluida;
    insert into resultado_teste values ('3', 'mudar empresa', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('3', 'mudar empresa', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update viagens set cliente_id = cli_b where id = v_concluida;
    insert into resultado_teste values ('3', 'mudar cliente', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('3', 'mudar cliente', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update viagens set status = 'cancelada' where id = v_concluida;
    insert into resultado_teste values ('3', 'cancelar a viagem', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('3', 'cancelar a viagem', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update viagens set ordem_id = null where id = v_concluida;
    insert into resultado_teste values ('3', 'tirar a viagem da ordem', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('3', 'tirar a viagem da ordem', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    delete from viagens where id = v_concluida;
    insert into resultado_teste values ('3', 'excluir a viagem', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('3', 'excluir a viagem', 'recusa TRV01', sqlerrm, true);
    -- [006] "Tire a viagem da ordem antes de excluí-la" era instrução morta: numa ordem
    -- fechada, tirar também está travado. Primeiro reabre.
    insert into resultado_teste values ('3', 'mensagem de exclusão manda reabrir primeiro',
      'com "Reabra a ordem"', sqlerrm, sqlerrm like '%Reabra a ordem%');
  end;

  -- ---------- critério 4: o que continua livre ----------
  begin
    update viagens set valor_motorista = 400, observacoes = 'acerto revisado'
     where id = v_concluida;
    insert into resultado_teste values ('4', 'mudar valor_motorista e observações', 'aceita', 'aceitou', true);
  exception when others then
    insert into resultado_teste values ('4', 'mudar valor_motorista e observações', 'aceita', sqlerrm, false);
  end;

  begin
    update viagens set motorista_id = mot, caminhao_id = cam, data = inicio + 2
     where id = v_concluida;
    insert into resultado_teste values ('4', 'mudar motorista, caminhão e data', 'aceita', 'aceitou', true);
  exception when others then
    insert into resultado_teste values ('4', 'mudar motorista, caminhão e data', 'aceita', sqlerrm, false);
  end;

  -- ---------- critério 5: o cron do agente não trava ----------
  -- É o que marcarRealizadasPendentes faz: preenche o valor e passa para concluida.
  begin
    update viagens set valor_motorista = 150 where id = v_pendente;
    update viagens set status = 'concluida' where id = v_pendente;
    insert into resultado_teste values ('5', 'realizada_pendente -> concluida em ordem fechada', 'aceita', 'aceitou', true);
  exception when others then
    insert into resultado_teste values ('5', 'realizada_pendente -> concluida em ordem fechada', 'aceita', sqlerrm, false);
  end;

  -- ---------- critério 6: reabrir ----------
  begin
    update ordens_pagamento set status = 'aberta' where id = ordem_normal;
    insert into resultado_teste values ('6', 'reabrir sem motivo', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('6', 'reabrir sem motivo', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update ordens_pagamento
       set status = 'aberta', motivo_reabertura = 'faltou uma viagem'
     where id = ordem_normal;
    select status, reaberta_em into tmp, d from ordens_pagamento where id = ordem_normal;
    insert into resultado_teste values ('6', 'reabrir com motivo grava reaberta_em',
      'aberta + reaberta_em', tmp || ' / ' || coalesce(d::text, 'nulo'),
      tmp = 'aberta' and d is not null);
  exception when others then
    insert into resultado_teste values ('6', 'reabrir com motivo grava reaberta_em',
      'aberta + reaberta_em', sqlerrm, false);
  end;

  -- ---------- critério 7: receber ----------
  -- Monta uma ordem mista: uma viagem de cada empresa, no mesmo cliente.
  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, 'Rohan', cli_b, mot, cam, 2100, 500, 'concluida')
  returning id into v_rohan;
  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, 'TransBeleze', cli_b, mot, cam, 1300, 400, 'concluida')
  returning id into v_tb;

  update viagens set ordem_id = ordem_mista where id in (v_rohan, v_tb);
  update ordens_pagamento
     set status = 'fechada', com_nota = true, empresa_nota = 'Rohan'
   where id = ordem_mista;

  begin
    update ordens_pagamento set status = 'recebida' where id = ordem_mista;
    insert into resultado_teste values ('7', 'receber sem data e sem conta', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('7', 'receber sem data e sem conta', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update ordens_pagamento set status = 'recebida', recebida_em = inicio + 20
     where id = ordem_mista;
    insert into resultado_teste values ('7', 'receber sem conta', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('7', 'receber sem conta', 'recusa TRV01', sqlerrm, true);
  end;

  -- Recebe de verdade, numa conta só (a da Rohan), com viagens das duas empresas.
  update ordens_pagamento
     set status = 'recebida', recebida_em = inicio + 20, empresa_recebedora = 'Rohan'
   where id = ordem_mista;

  -- A regra: cada viagem conta como recebida pela EMPRESA QUE A FEZ, não pela conta.
  select coalesce(sum(v.valor_frete) filter (where v.empresa = 'Rohan'), 0)::text
         || ' / ' ||
         coalesce(sum(v.valor_frete) filter (where v.empresa = 'TransBeleze'), 0)::text
    into tmp
    from viagens v
    join ordens_pagamento o on o.id = v.ordem_id
   where o.status = 'recebida' and o.legado = false
     and o.recebida_em between date_trunc('month', (inicio + 20)::date)::date
                           and (date_trunc('month', (inicio + 20)::date) + interval '1 month - 1 day')::date
     and v.cliente_id = cli_b;
  insert into resultado_teste values ('7', 'ordem mista: recebido por empresa no mês',
    '2100 / 1300', tmp, tmp = '2100 / 1300');

  select total_rohan::text || ' / ' || total_transbeleze::text || ' / ' || total::text
    into tmp from ordens_resumo where ordem_id = ordem_mista;
  insert into resultado_teste values ('7', 'view ordens_resumo da ordem mista',
    '2100 / 1300 / 3400', tmp, tmp = '2100 / 1300 / 3400');

  -- Desfazer recebimento limpa data e conta.
  update ordens_pagamento set status = 'fechada' where id = ordem_mista;
  select coalesce(recebida_em::text, 'nulo') || ' / ' || coalesce(empresa_recebedora, 'nulo')
    into tmp from ordens_pagamento where id = ordem_mista;
  insert into resultado_teste values ('7', 'desfazer recebimento limpa data e conta',
    'nulo / nulo', tmp, tmp = 'nulo / nulo');

  -- ---------- critério 8: excluir ordem ----------
  begin
    delete from ordens_pagamento where id = ordem_mista;
    insert into resultado_teste values ('8', 'excluir ordem fechada', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('8', 'excluir ordem fechada', 'recusa TRV01', sqlerrm, true);
  end;

  -- A ordem_normal está aberta (reaberta no critério 6): excluir devolve as viagens.
  delete from ordens_pagamento where id = ordem_normal;
  select count(*) into n from viagens
   where id in (v_concluida, v_pendente) and ordem_id is null;
  insert into resultado_teste values ('8', 'excluir ordem aberta devolve as viagens',
    '2 viagens sem ordem', n || ' viagens sem ordem', n = 2);

  -- ---------- critérios 12 a 14: legado ----------
  insert into ordens_pagamento (cliente_id, legado, status)
  values (cli_a, true, 'recebida') returning id into ordem_legado;

  -- [006] Antes isto era barrado pelo índice único, e a tela receberia "duplicate key value
  -- violates unique constraint", em inglês e sem instrução. A trigger passou a conferir
  -- antes; o índice continua como rede de segurança.
  begin
    insert into ordens_pagamento (cliente_id, legado, status)
    values (cli_a, true, 'recebida');
    insert into resultado_teste values ('14', 'segunda ordem de legado do mesmo cliente',
      'recusa TRV01', 'aceitou', false);
  exception
    when sqlstate 'TRV01' then
      insert into resultado_teste values ('14', 'segunda ordem de legado do mesmo cliente',
        'recusa TRV01', sqlerrm, true);
    when unique_violation then
      insert into resultado_teste values ('14', 'segunda ordem de legado do mesmo cliente',
        'recusa TRV01', 'barrou pelo índice único, sem mensagem em português — falta a 006',
        false);
  end;

  begin
    update viagens set ordem_id = ordem_legado where id = v_pos_controle;
    insert into resultado_teste values ('12', 'viagem pós-início entra na ordem de legado', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('12', 'viagem pós-início entra na ordem de legado', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update viagens set ordem_id = ordem_legado where id = v_legado;
    insert into resultado_teste values ('13', 'quitar viagem antiga no legado', 'aceita', 'aceitou', true);
  exception when others then
    insert into resultado_teste values ('13', 'quitar viagem antiga no legado', 'aceita', sqlerrm, false);
  end;

  -- Ordem de legado não tem data de recebimento, então não entra no recebido de período.
  select count(*) into n from viagens v
    join ordens_pagamento o on o.id = v.ordem_id
   where v.id = v_legado and o.recebida_em is not null;
  insert into resultado_teste values ('13', 'legado não entra no recebido de nenhum período',
    '0 com data de recebimento', n || ' com data', n = 0);

  -- Mas os campos travados continuam travados enquanto a viagem está nela.
  begin
    update viagens set valor_frete = 999 where id = v_legado;
    insert into resultado_teste values ('13', 'mudar valor de viagem quitada no legado', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('13', 'mudar valor de viagem quitada no legado', 'recusa TRV01', sqlerrm, true);
    -- [006] A mensagem não pode mandar reabrir: quitação de legado nunca muda de situação,
    -- então "reabra a ordem" é instrução impossível. A saída certa é tirar a viagem dela.
    insert into resultado_teste values ('13', 'mensagem do legado não manda reabrir',
      'sem "Reabra", com "quitação de legado"',
      sqlerrm,
      sqlerrm not like '%Reabra%' and sqlerrm like '%quitação de legado%');
  end;

  -- Sair da ordem de legado é liberado, para desfazer quitação feita por engano.
  begin
    update viagens set ordem_id = null where id = v_legado;
    insert into resultado_teste values ('13', 'tirar viagem da ordem de legado', 'aceita', 'aceitou', true);
  exception when others then
    insert into resultado_teste values ('13', 'tirar viagem da ordem de legado', 'aceita', sqlerrm, false);
  end;

  -- Viagem antiga pode ir para uma ordem NORMAL (ainda está a receber).
  insert into ordens_pagamento (cliente_id) values (cli_a) returning id into ordem_normal;
  begin
    update viagens set ordem_id = ordem_normal where id = v_legado;
    insert into resultado_teste values ('12', 'viagem anterior ao início entra em ordem normal', 'aceita', 'aceitou', true);
  exception when others then
    insert into resultado_teste values ('12', 'viagem anterior ao início entra em ordem normal', 'aceita', sqlerrm, false);
  end;

  -- A ordem de legado não muda de situação nem é excluída.
  begin
    update ordens_pagamento set status = 'aberta' where id = ordem_legado;
    insert into resultado_teste values ('13', 'mudar situação da ordem de legado', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('13', 'mudar situação da ordem de legado', 'recusa TRV01', sqlerrm, true);
  end;
end $$;

-- O SQL Editor do Supabase mostra só o resultado da ÚLTIMA consulta, então o resumo vem
-- primeiro e o detalhe por último — ao contrário do que a intuição pede.
select count(*) filter (where passou) as passaram,
       count(*) filter (where not passou) as falharam,
       count(*) as total
  from resultado_teste;

-- O detalhe. `passou = false` em qualquer linha é desvio da spec. A coluna `obtido` traz a
-- mensagem que o banco devolveu: é exatamente o texto que vai aparecer no toast da web e na
-- resposta do Telegram, então vale ler como se fosse usuário.
--
-- As que falharam primeiro, para não se perderem no meio de trinta linhas verdes.
select passou, criterio, o_que, esperado, obtido
  from resultado_teste
 order by passou, criterio::int, o_que;

rollback;

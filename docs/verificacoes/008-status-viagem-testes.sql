-- FIX #18 — passagem diária do status da viagem no banco (migration 008), verificada no banco
--
-- Rode este script inteiro no SQL Editor DEPOIS da migration 008. Ele cria os próprios
-- dados de teste, chama a mesma função que a tarefa agendada chama, confere a situação de
-- cada viagem e termina em `rollback` — nada fica no banco.
--
-- A função converte TODAS as viagens elegíveis, não só as de teste: as viagens reais que
-- estiverem presas também mudam aqui dentro, e voltam com o rollback. Por isso os casos
-- conferem viagem por viagem, e não o total que a função devolve.
--
-- O caso 6 (viagem de hoje continua confirmada) só prova o tratamento do fuso se o script
-- for rodado entre 21h e meia-noite: é a janela em que a data em UTC já é amanhã.
--
-- O resultado vem como tabela porque o SQL Editor não mostra `NOTICE`, e com as que
-- falharam no topo. Qualquer `false` na coluna `passou` é defeito — me mande a linha.
--
-- O que só se vê em produção (a tarefa rodando sozinha) está comentado no fim do arquivo.

begin;

create temp table resultado_teste (
  caso text,
  o_que text,
  esperado text,
  obtido text,
  passou boolean
) on commit drop;

do $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  ontem date := (now() at time zone 'America/Sao_Paulo')::date - 1;
  cli bigint; mot bigint; cam bigint; ordem bigint;
  v_completa bigint; v_sem_motorista bigint; v_sem_valor bigint; v_sem_valor_pago bigint;
  v_pendente_pago bigint; v_pendente_sem bigint;
  v_hoje bigint; v_amanha bigint; v_cancelada bigint; v_rascunho bigint;
  v_em_ordem bigint;
  c record;
  obtido text;
  n int;
begin
  -- ---------- dados de teste ----------
  insert into clientes (nome) values ('ZZ TESTE 008') returning id into cli;
  insert into motoristas (nome) values ('ZZ TESTE 008') returning id into mot;
  insert into caminhoes (placa, modelo) values ('ZZZ0008', 'Teste') returning id into cam;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (ontem, 'Rohan', cli, mot, cam, 500, 150, 'confirmada')
  returning id into v_completa;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (ontem, 'Rohan', cli, mot, cam, 500, null, 'confirmada')
  returning id into v_sem_motorista;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (ontem, 'TransBeleze', cli, mot, cam, null, null, 'confirmada_sem_valor')
  returning id into v_sem_valor;

  -- Não deveria existir (a edição recalcula o status), mas é o caso em que o update único
  -- e os três passos antigos chegam ao mesmo lugar por caminhos diferentes.
  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (ontem, 'TransBeleze', cli, mot, cam, 600, 200, 'confirmada_sem_valor')
  returning id into v_sem_valor_pago;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (ontem - 10, 'Rohan', cli, mot, cam, 450, 150, 'realizada_pendente')
  returning id into v_pendente_pago;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (ontem - 10, 'Rohan', cli, mot, cam, 450, null, 'realizada_pendente')
  returning id into v_pendente_sem;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (hoje, 'Rohan', cli, mot, cam, 500, 150, 'confirmada')
  returning id into v_hoje;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (hoje + 1, 'Rohan', cli, mot, cam, 500, 150, 'confirmada')
  returning id into v_amanha;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (ontem, 'Rohan', cli, mot, cam, 500, 150, 'cancelada')
  returning id into v_cancelada;

  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (ontem, 'Rohan', cli, mot, cam, 500, 150, 'rascunho')
  returning id into v_rascunho;

  -- Viagem numa ordem FECHADA, com o pagamento ao motorista preenchido depois do
  -- fechamento — é o que o critério 5 da spec 02 garantiu que a trigger deixa passar.
  insert into ordens_pagamento (cliente_id) values (cli) returning id into ordem;
  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status, ordem_id)
  values (ontem, 'Rohan', cli, mot, cam, 700, null, 'realizada_pendente', ordem)
  returning id into v_em_ordem;
  update ordens_pagamento set status = 'fechada' where id = ordem;
  update viagens set valor_motorista = 200 where id = v_em_ordem;

  -- ---------- a função, como a tarefa agendada chama ----------
  begin
    perform marcar_viagens_realizadas();
  exception when others then
    insert into resultado_teste values
      ('0', 'a função roda sem erro', 'sem erro', format('%s: %s', sqlstate, sqlerrm), false);
  end;

  for c in
    select * from (values
      ('1',  'confirmada de ontem, com frete e motorista',            v_completa,       'concluida'),
      ('2',  'confirmada de ontem, sem pagamento ao motorista',       v_sem_motorista,  'realizada_pendente'),
      ('3',  'confirmada_sem_valor de ontem, sem valores',            v_sem_valor,      'realizada_pendente'),
      ('4',  'confirmada_sem_valor de ontem, já com os dois valores', v_sem_valor_pago, 'concluida'),
      ('5',  'realizada_pendente antiga que recebeu os valores',      v_pendente_pago,  'concluida'),
      ('6',  'confirmada de hoje continua agendada',                  v_hoje,           'confirmada'),
      ('7',  'confirmada de amanhã continua agendada',                v_amanha,         'confirmada'),
      ('8',  'cancelada de ontem não é ressuscitada',                 v_cancelada,      'cancelada'),
      ('9',  'rascunho de ontem continua rascunho',                   v_rascunho,       'rascunho'),
      ('10', 'realizada_pendente ainda sem pagamento não muda',       v_pendente_sem,   'realizada_pendente'),
      ('11', 'realizada_pendente em ordem fechada, já paga',          v_em_ordem,       'concluida')
    ) as t(caso, o_que, viagem, esperado)
  loop
    select status into obtido from viagens where id = c.viagem;
    insert into resultado_teste values
      (c.caso, c.o_que, c.esperado, obtido, obtido is not distinct from c.esperado);
  end loop;

  -- ---------- idempotência ----------
  -- Logo depois da primeira execução não sobra nada elegível, nem viagem real: a segunda
  -- tem de devolver zero. Diferente de zero quer dizer que ela regrava linhas à toa.
  begin
    n := marcar_viagens_realizadas();
    insert into resultado_teste values
      ('12', 'segunda execução seguida não altera nada', '0', n::text, n = 0);
  exception when others then
    insert into resultado_teste values
      ('12', 'segunda execução seguida não altera nada', '0',
       format('%s: %s', sqlstate, sqlerrm), false);
  end;

  -- ---------- fora da API ----------
  obtido := has_function_privilege('anon', 'public.marcar_viagens_realizadas()', 'execute')::text;
  insert into resultado_teste values
    ('13', 'o site sem login (anon) não chama a função', 'false', obtido, obtido = 'false');

  obtido := has_function_privilege('authenticated', 'public.marcar_viagens_realizadas()', 'execute')::text;
  insert into resultado_teste values
    ('14', 'o gerente logado (authenticated) não chama a função', 'false', obtido, obtido = 'false');

  -- ---------- agendamento ----------
  select count(*)::text into obtido
    from cron.job
   where jobname = 'marcar-viagens-realizadas'
     and schedule = '5 * * * *'
     and command like '%marcar_viagens_realizadas()%'
     and active;
  insert into resultado_teste values
    ('15', 'tarefa agendada de hora em hora, ativa, chamando a função', '1', obtido, obtido = '1');
end $$;

select passou, caso, o_que, esperado, obtido
  from resultado_teste
 order by passou, caso::int;

rollback;


-- ======================================================================================
-- PRODUÇÃO — rode depois do minuto 5 da primeira hora cheia após aplicar a 008.
-- Esperado: execuções com status `succeeded` e "viagens presas" = 0. As sete de nov/2026
-- (#691, #692, #693, #695, #696, #698, #699) devem estar `concluida`.
--
-- begin;
--
-- select o_que, quando, situacao, detalhe
--   from (
--     select 1 as grupo, d.start_time as momento, 'execução' as o_que,
--            to_char(d.start_time at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as quando,
--            d.status as situacao, d.return_message as detalhe
--       from cron.job j
--       join cron.job_run_details d on d.jobid = j.jobid
--      where j.jobname = 'marcar-viagens-realizadas'
--     union all
--     select 2, null, 'viagens presas', null, count(*)::text, null
--       from viagens
--      where status in ('confirmada', 'confirmada_sem_valor')
--        and data < (now() at time zone 'America/Sao_Paulo')::date
--     union all
--     select 3, null, 'viagem #' || id, to_char(data, 'DD/MM/YYYY'), status, null
--       from viagens
--      where id in (691, 692, 693, 695, 696, 698, 699)
--   ) x
--  order by grupo, momento desc nulls last, o_que;
--
-- rollback;

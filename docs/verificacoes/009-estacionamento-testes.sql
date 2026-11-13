-- Spec 05 — estacionamento na viagem: critérios 1 a 5, verificados no banco
--
-- Rode este script inteiro no SQL Editor DEPOIS da migration 009. Ele cria os próprios
-- dados (cliente, motorista, caminhão, viagens e ordens), fixa a alíquota em 9% dentro da
-- transação, exercita cada critério e termina em `rollback` — nada fica no banco.
--
-- O critério 6 são os dois verificadores da spec 03 (03-repasses-testes.sql e
-- 03-repasses-verifica-formula.mjs). Os critérios 7 e 8 são manuais, na web.
--
-- O resultado vem como tabela porque o SQL Editor não mostra `NOTICE`, com as que falharam
-- no topo. Qualquer `false` na coluna `passou` é defeito — me mande a linha inteira.

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
  cli bigint; mot bigint; cam bigint;
  ord bigint; v_rohan bigint; v_tb bigint; v_sem bigint;
  inicio date;
  caso record;
  r record;
  got_valor numeric; got_dev text; got_cre text;
  n int; tmp text;
begin
  -- Sem a migration, o erro seria "column valor_estacionamento does not exist" no meio do
  -- critério 1, o que não diz o que fazer.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'viagens'
                    and column_name = 'valor_estacionamento') then
    raise exception 'A migration 009 não está aplicada. Rode agent/migrations/009_estacionamento.sql primeiro e depois este script.';
  end if;

  select inicio_controle into inicio from configuracao_financeira where id = 1;
  -- Os valores esperados da spec usam 9%. Fixar aqui deixa o teste independente da
  -- alíquota que estiver cadastrada em produção.
  update aliquotas_repasse set aliquota = 0.09;

  insert into clientes (nome) values ('ZZ TESTE SPEC05') returning id into cli;
  insert into motoristas (nome) values ('ZZ TESTE SPEC05') returning id into mot;
  insert into caminhoes (placa, modelo) values ('ZZZ0005', 'Teste') returning id into cam;

  -- ---------- critério 1: zero por padrão, nunca negativo ----------
  -- Insert sem a coluna, como o do agente.
  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, 'Rohan', cli, mot, cam, 400, 100, 'concluida')
  returning id into v_sem;
  select valor_estacionamento::text into tmp from viagens where id = v_sem;
  insert into resultado_teste values ('1', 'insert sem o campo grava zero',
    '0', tmp, tmp::numeric = 0);

  begin
    update viagens set valor_estacionamento = -10 where id = v_sem;
    insert into resultado_teste values ('1', 'estacionamento negativo',
      'recusado', 'aceitou', false);
  exception when others then
    insert into resultado_teste values ('1', 'estacionamento negativo',
      'recusado', format('recusado (%s)', sqlstate), sqlstate = '23514');
  end;

  -- ---------- critérios 2 e 3: o exemplo da spec ----------
  -- Rohan R$ 1.000; TransBeleze R$ 500 + R$ 30 de estacionamento. Total 1.530, parte da
  -- TransBeleze 530. O que muda entre os casos é a nota e a conta.
  for caso in
    select * from (values
      (false, null::text, 'Rohan',       530.00, 'Rohan',       'TransBeleze', 'sem nota, caiu na Rohan'),
      (true,  'Rohan',    'Rohan',       482.30, 'Rohan',       'TransBeleze', 'nota Rohan, caiu na Rohan'),
      (true,  'Rohan',    'TransBeleze', 1047.70, 'TransBeleze', 'Rohan',      'nota Rohan, caiu na TransBeleze')
    ) as c(com_nota, empresa_nota, conta, valor_esperado, devedora, credora, descricao)
  loop
    insert into ordens_pagamento (cliente_id) values (cli) returning id into ord;

    insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                         valor_frete, valor_motorista, valor_estacionamento, status, ordem_id)
    values (inicio + 1, 'Rohan', cli, mot, cam, 1000, 300, 0, 'concluida', ord)
    returning id into v_rohan;
    insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                         valor_frete, valor_motorista, valor_estacionamento, status, ordem_id)
    values (inicio + 1, 'TransBeleze', cli, mot, cam, 500, 150, 30, 'concluida', ord)
    returning id into v_tb;

    -- Critério 2 só uma vez, na primeira ordem (ainda aberta).
    if not caso.com_nota then
      select * into r from ordens_resumo where ordem_id = ord;
      insert into resultado_teste values ('2', 'ordens_resumo do exemplo',
        'total 1530, Rohan 1000, TB 530, estacionamento 30',
        format('total %s, Rohan %s, TB %s, estacionamento %s',
               r.total::numeric, r.total_rohan::numeric, r.total_transbeleze::numeric,
               r.total_estacionamento::numeric),
        r.total = 1530 and r.total_rohan = 1000 and r.total_transbeleze = 530
          and r.total_estacionamento = 30);
    end if;

    update ordens_pagamento
       set status = 'fechada', com_nota = caso.com_nota, empresa_nota = caso.empresa_nota
     where id = ord;

    -- ---------- critério 5: trava em ordem fechada (testada na primeira ordem) ----------
    if not caso.com_nota then
      begin
        update viagens set valor_estacionamento = 50 where id = v_tb;
        insert into resultado_teste values ('5', 'mudar estacionamento com a ordem fechada',
          'recusado com TRV01', 'aceitou', false);
      exception when others then
        insert into resultado_teste values ('5', 'mudar estacionamento com a ordem fechada',
          'recusado com TRV01', format('%s: %s', sqlstate, sqlerrm), sqlstate = 'TRV01');
      end;

      begin
        update viagens set valor_frete = 600 where id = v_tb;
        insert into resultado_teste values ('5', 'mudar frete com a ordem fechada (continua travado)',
          'recusado com TRV01', 'aceitou', false);
      exception when others then
        insert into resultado_teste values ('5', 'mudar frete com a ordem fechada (continua travado)',
          'recusado com TRV01', format('%s: %s', sqlstate, sqlerrm), sqlstate = 'TRV01');
      end;

      begin
        update viagens set valor_motorista = 160 where id = v_tb;
        insert into resultado_teste values ('5', 'mudar pagamento ao motorista com a ordem fechada',
          'aceito', 'aceitou', true);
      exception when others then
        insert into resultado_teste values ('5', 'mudar pagamento ao motorista com a ordem fechada',
          'aceito', format('%s: %s', sqlstate, sqlerrm), false);
      end;
    end if;

    update ordens_pagamento
       set status = 'recebida', recebida_em = inicio + 10, empresa_recebedora = caso.conta
     where id = ord;

    select valor, devedora, credora into got_valor, got_dev, got_cre
      from devidos_entre_empresas where ordem_id = ord;

    insert into resultado_teste values ('3', caso.descricao,
      format('%s deve %s a %s', caso.devedora, caso.valor_esperado, caso.credora),
      format('%s deve %s a %s', coalesce(got_dev, 'ninguém'), coalesce(got_valor, 0), coalesce(got_cre, '—')),
      got_valor = caso.valor_esperado and got_dev = caso.devedora and got_cre = caso.credora);
  end loop;

  -- ---------- critério 5: com a ordem aberta, mudar é aceito ----------
  insert into ordens_pagamento (cliente_id) values (cli) returning id into ord;
  update viagens set ordem_id = ord where id = v_sem;
  begin
    update viagens set valor_estacionamento = 25 where id = v_sem;
    select total_estacionamento::text into tmp from ordens_resumo where ordem_id = ord;
    insert into resultado_teste values ('5', 'mudar estacionamento com a ordem aberta',
      'aceito, e a ordem soma 25 de estacionamento', format('aceito, ordem soma %s', tmp),
      tmp::numeric = 25);
  exception when others then
    insert into resultado_teste values ('5', 'mudar estacionamento com a ordem aberta',
      'aceito', format('%s: %s', sqlstate, sqlerrm), false);
  end;

  -- ---------- critério 4: ordens recebidas antes da 009 ----------
  -- O devido é calculado a partir dos totais de ordens_resumo. Se, em toda ordem recebida
  -- real, o total da view for igual à soma só do frete, nenhum devido mudou. As ordens de
  -- teste acima ficam de fora pelo cliente.
  -- O alias não pode ser `r`: é o nome da variável record declarada acima, e o PL/pgSQL
  -- recusa a referência como ambígua (42702).
  select count(*) into n
    from ordens_pagamento o
    join ordens_resumo res on res.ordem_id = o.id
   where o.status = 'recebida'
     and o.cliente_id <> cli
     and res.total <> (select coalesce(sum(v.valor_frete), 0) from viagens v where v.ordem_id = o.id);
  insert into resultado_teste values ('4', 'ordens recebidas reais com total diferente do frete',
    '0', n::text, n = 0);
end $$;

select passou, criterio, o_que, esperado, obtido
  from resultado_teste
 order by passou, criterio::int, o_que;

rollback;

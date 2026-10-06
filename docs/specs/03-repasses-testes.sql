-- Spec 03 — critérios 1 a 8, verificados no banco
--
-- Rode este script inteiro no SQL Editor DEPOIS da migration 007. Ele cria os próprios
-- dados, exercita cada critério e termina em `rollback` — nada fica no banco, nem ordens,
-- nem viagens, nem movimentos, nem a alteração de alíquota do critério 3.
--
-- O resultado vem como tabela porque o SQL Editor não mostra `NOTICE`, e o DETALHE é a
-- última consulta porque ele mostra só o resultado final. O resumo (quantos passaram) vem
-- antes, invertendo a ordem que a intuição pede.
--
-- O critério 9 (GET sem sessão devolve []) é por curl, e o 10 (aviso de alíquota vencida)
-- é manual — os dois estão em docs/specs/03-repasses-deploy.md.

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
  ord bigint; ord_b bigint; ord_so_rohan bigint; ord_legado bigint; ord_nova bigint;
  v1 bigint; v2 bigint; v_legado bigint;
  inicio date;
  caso record;
  got_valor numeric; got_dev text; got_cre text; got_aliq numeric;
  saldo numeric; n int; tmp text;
begin
  select inicio_controle into inicio from configuracao_financeira where id = 1;

  insert into clientes (nome) values ('ZZ TESTE SPEC03') returning id into cli;
  insert into motoristas (nome) values ('ZZ TESTE SPEC03') returning id into mot;
  insert into caminhoes (placa, modelo) values ('ZZZ0003', 'Teste') returning id into cam;

  -- ---------- critério 1: os quatro casos da tabela da spec ----------
  -- Toda ordem aqui é R$ 1.000 de viagem da Rohan + R$ 500 de viagem da TransBeleze, com
  -- alíquota de 9%. O que muda é quem emitiu a nota e em qual conta o dinheiro caiu.
  for caso in
    select * from (values
      (false, null::text, 'Rohan',       500.00, 'Rohan',       'TransBeleze', 'sem nota, caiu na Rohan'),
      (true,  'Rohan',    'Rohan',       455.00, 'Rohan',       'TransBeleze', 'nota da Rohan, caiu na Rohan'),
      (true,  'Rohan',    'TransBeleze', 1045.00, 'TransBeleze', 'Rohan',      'nota da Rohan, caiu na TransBeleze'),
      (true,  'TransBeleze', 'Rohan',     590.00, 'Rohan',       'TransBeleze', 'nota da TransBeleze, caiu na Rohan')
    ) as c(com_nota, empresa_nota, conta, valor_esperado, devedora, credora, descricao)
  loop
    insert into ordens_pagamento (cliente_id) values (cli) returning id into ord;

    insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                         valor_frete, valor_motorista, status)
    values (inicio + 1, 'Rohan', cli, mot, cam, 1000, 300, 'concluida') returning id into v1;
    insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                         valor_frete, valor_motorista, status)
    values (inicio + 1, 'TransBeleze', cli, mot, cam, 500, 150, 'concluida') returning id into v2;

    update viagens set ordem_id = ord where id in (v1, v2);
    update ordens_pagamento
       set status = 'fechada', com_nota = caso.com_nota, empresa_nota = caso.empresa_nota
     where id = ord;
    update ordens_pagamento
       set status = 'recebida', recebida_em = inicio + 10, empresa_recebedora = caso.conta
     where id = ord;

    -- Guarda a segunda ordem (nota Rohan, conta Rohan) para os critérios 3, 4 e 5.
    if caso.descricao = 'nota da Rohan, caiu na Rohan' then ord_b := ord; end if;

    select valor, devedora, credora into got_valor, got_dev, got_cre
      from devidos_entre_empresas where ordem_id = ord;

    insert into resultado_teste values ('1', caso.descricao,
      format('%s deve %s a %s', caso.devedora, caso.valor_esperado, caso.credora),
      format('%s deve %s a %s', coalesce(got_dev, 'ninguém'), coalesce(got_valor, 0), coalesce(got_cre, '—')),
      got_valor = caso.valor_esperado and got_dev = caso.devedora and got_cre = caso.credora);
  end loop;

  -- ---------- critério 7 (parte em SQL): saldo e repasse ----------
  -- Com os quatro casos acima e nada mais: 1045 (TB deve) menos 500, 455 e 590 (Rohan
  -- deve) = -500. Negativo é Rohan devendo à TransBeleze.
  select saldo_tb_para_rohan into saldo from saldo_entre_empresas;
  insert into resultado_teste values ('7', 'saldo depois dos quatro casos',
    '-500.00 (Rohan deve 500 à TransBeleze)', saldo::text, saldo = -500.00);

  -- Um repasse no valor do saldo zera o saldo. Quem deve é a Rohan, então é ela que paga.
  insert into movimentos_entre_empresas (data, tipo, de_empresa, para_empresa, valor, observacao)
  values (inicio + 11, 'repasse', 'Rohan', 'TransBeleze', 500.00, 'teste');

  select saldo_tb_para_rohan into saldo from saldo_entre_empresas;
  insert into resultado_teste values ('7', 'repasse no valor do saldo zera o saldo',
    '0', saldo::text, saldo = 0);

  -- ---------- critério 6: legado não gera devido ----------
  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio - 20, 'TransBeleze', cli, mot, cam, 800, 250, 'concluida')
  returning id into v_legado;

  insert into ordens_pagamento (cliente_id, legado, status)
  values (cli, true, 'recebida') returning id into ord_legado;
  update viagens set ordem_id = ord_legado where id = v_legado;

  select count(*) into n from devidos_entre_empresas where ordem_id = ord_legado;
  insert into resultado_teste values ('6', 'quitação de legado gera devido?',
    '0 devidos', n || ' devidos', n = 0);

  -- ---------- critério 2: ordem sem parte da outra empresa ----------
  insert into ordens_pagamento (cliente_id) values (cli) returning id into ord_so_rohan;
  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 1, 'Rohan', cli, mot, cam, 1000, 300, 'concluida') returning id into v1;
  update viagens set ordem_id = ord_so_rohan where id = v1;
  update ordens_pagamento set status = 'fechada', com_nota = true, empresa_nota = 'Rohan'
   where id = ord_so_rohan;
  update ordens_pagamento
     set status = 'recebida', recebida_em = inicio + 10, empresa_recebedora = 'Rohan'
   where id = ord_so_rohan;

  select count(*) into n from devidos_entre_empresas where ordem_id = ord_so_rohan;
  insert into resultado_teste values ('2', 'só viagens da Rohan, nota e conta da Rohan',
    '0 devidos', n || ' devidos', n = 0);

  -- ---------- critério 3: mudar a alíquota não mexe no passado ----------
  update aliquotas_repasse set aliquota = 0.10, atualizada_em = now() where empresa = 'Rohan';

  select valor into got_valor from devidos_entre_empresas where ordem_id = ord_b;
  insert into resultado_teste values ('3', 'ordem já recebida mantém o devido antigo',
    '455.00', coalesce(got_valor, 0)::text, got_valor = 455.00);

  -- Uma ordem recebida AGORA usa 10%: 500 × 0,90 = 450.
  insert into ordens_pagamento (cliente_id) values (cli) returning id into ord_nova;
  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 2, 'Rohan', cli, mot, cam, 1000, 300, 'concluida') returning id into v1;
  insert into viagens (data, empresa, cliente_id, motorista_id, caminhao_id,
                       valor_frete, valor_motorista, status)
  values (inicio + 2, 'TransBeleze', cli, mot, cam, 500, 150, 'concluida') returning id into v2;
  update viagens set ordem_id = ord_nova where id in (v1, v2);
  update ordens_pagamento set status = 'fechada', com_nota = true, empresa_nota = 'Rohan'
   where id = ord_nova;
  update ordens_pagamento
     set status = 'recebida', recebida_em = inicio + 12, empresa_recebedora = 'Rohan'
   where id = ord_nova;

  select valor, aliquota into got_valor, got_aliq
    from devidos_entre_empresas where ordem_id = ord_nova;
  insert into resultado_teste values ('3', 'ordem recebida depois da mudança usa 10%',
    '450.00 com alíquota 0.10',
    coalesce(got_valor, 0)::text || ' com alíquota ' || coalesce(got_aliq, 0)::text,
    got_valor = 450.00 and got_aliq = 0.10);

  -- ---------- critério 4: travas da ordem recebida ----------
  begin
    update ordens_pagamento set com_nota = false where id = ord_b;
    insert into resultado_teste values ('4', 'mudar com_nota na recebida', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('4', 'mudar com_nota na recebida', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update ordens_pagamento set empresa_nota = 'TransBeleze' where id = ord_b;
    insert into resultado_teste values ('4', 'mudar empresa_nota na recebida', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('4', 'mudar empresa_nota na recebida', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update ordens_pagamento set empresa_recebedora = 'TransBeleze' where id = ord_b;
    insert into resultado_teste values ('4', 'mudar empresa_recebedora na recebida', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('4', 'mudar empresa_recebedora na recebida', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update ordens_pagamento set recebida_em = inicio + 15 where id = ord_b;
    insert into resultado_teste values ('4', 'mudar recebida_em na recebida', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('4', 'mudar recebida_em na recebida', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    update ordens_pagamento set aliquota_repasse = 0.5 where id = ord_b;
    insert into resultado_teste values ('4', 'mudar aliquota_repasse na recebida', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('4', 'mudar aliquota_repasse na recebida', 'recusa TRV01', sqlerrm, true);
  end;

  -- O que CONTINUA livre na recebida: número e data da nota (a nota sai depois).
  begin
    update ordens_pagamento set numero_nota = '431', data_nota = inicio + 11 where id = ord_b;
    insert into resultado_teste values ('4', 'número e data da nota continuam editáveis', 'aceita', 'aceitou', true);
  exception when others then
    insert into resultado_teste values ('4', 'número e data da nota continuam editáveis', 'aceita', sqlerrm, false);
  end;

  -- ---------- critério 5: desfazer o recebimento ----------
  update ordens_pagamento set status = 'fechada' where id = ord_b;

  select count(*) into n from devidos_entre_empresas where ordem_id = ord_b;
  select coalesce(aliquota_repasse::text, 'nulo') into tmp
    from ordens_pagamento where id = ord_b;
  insert into resultado_teste values ('5', 'desfazer tira o devido e apaga a alíquota',
    '0 devidos / alíquota nula', n || ' devidos / alíquota ' || tmp, n = 0 and tmp = 'nulo');

  -- ---------- critério 8: movimentos inválidos ----------
  begin
    insert into movimentos_entre_empresas (tipo, de_empresa, para_empresa, valor)
    values ('ajuste', 'Rohan', 'TransBeleze', 100);
    insert into resultado_teste values ('8', 'ajuste sem observação', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('8', 'ajuste sem observação', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    insert into movimentos_entre_empresas (tipo, de_empresa, para_empresa, valor)
    values ('repasse', 'Rohan', 'Rohan', 100);
    insert into resultado_teste values ('8', 'de_empresa igual a para_empresa', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('8', 'de_empresa igual a para_empresa', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    insert into movimentos_entre_empresas (tipo, de_empresa, para_empresa, valor)
    values ('repasse', 'Rohan', 'TransBeleze', 0);
    insert into resultado_teste values ('8', 'valor zero', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('8', 'valor zero', 'recusa TRV01', sqlerrm, true);
  end;

  begin
    insert into movimentos_entre_empresas (tipo, de_empresa, para_empresa, valor)
    values ('repasse', 'Rohan', 'TransBeleze', -100);
    insert into resultado_teste values ('8', 'valor negativo', 'recusa TRV01', 'aceitou', false);
  exception when sqlstate 'TRV01' then
    insert into resultado_teste values ('8', 'valor negativo', 'recusa TRV01', sqlerrm, true);
  end;

  -- Repasse SEM observação é válido: a própria transferência explica o movimento.
  begin
    insert into movimentos_entre_empresas (tipo, de_empresa, para_empresa, valor)
    values ('repasse', 'TransBeleze', 'Rohan', 10);
    insert into resultado_teste values ('8', 'repasse sem observação é válido', 'aceita', 'aceitou', true);
  exception when others then
    insert into resultado_teste values ('8', 'repasse sem observação é válido', 'aceita', sqlerrm, false);
  end;
end $$;

-- Resumo primeiro: o SQL Editor mostra só o resultado da última consulta.
select count(*) filter (where passou) as passaram,
       count(*) filter (where not passou) as falharam,
       count(*) as total
  from resultado_teste;

-- O detalhe, com as que falharam no topo. A coluna `obtido` traz a mensagem do banco: é o
-- texto que vai aparecer no toast da web, então vale ler como se fosse usuário.
select passou, criterio, o_que, esperado, obtido
  from resultado_teste
 order by passou, criterio::int, o_que;

rollback;

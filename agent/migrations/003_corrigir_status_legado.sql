-- Migration: corrige datas com ano corrompido e o status legado das viagens
-- Rode este script inteiro no Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- Contexto: a migration 001 fez `add column if not exists status text default 'rascunho'`
-- numa tabela que já tinha histórico, então TODO registro anterior herdou 'rascunho'.
-- São 376 viagens completas (empresa, cliente, motorista, caminhão e ambos os valores)
-- com data no passado, marcadas como rascunho sem motivo — o que domina o gráfico de
-- status do Dashboard e enche a tabela de badges errados.

begin;

-- 0. Backup do estado anterior. Um script rodado à mão não tem "down migration";
--    esta tabela é o caminho de volta. O rollback está no fim do arquivo.
create table if not exists backup_003_viagens as
  select id, data, status from viagens where status = 'rascunho';

-- 1. Três viagens com o ano mutilado. Em todas, mês e dia estão corretos e só o ano
--    saiu errado — e a data pretendida está confirmada pelo criado_em e pelas viagens
--    vizinhas, cadastradas no mesmo dia:
--
--      #170 '0206-04-01' -> '2026-04-01'  (criada 2026-04-02; #171 e #172 em 2026-04-01)
--      #255 '0026-04-27' -> '2026-04-27'  (criada 2026-04-27; #254 em 2026-04-27)
--      #324 '0026-05-15' -> '2026-05-15'  (criada 2026-05-15; #325 em 2026-05-15)
--
--    Como '0026-...' < '2026-...', elas caem fora de todo filtro de período e estão
--    invisíveis na interface hoje. Guardado tanto o id quanto o valor atual, para o
--    script ser idempotente e não atingir uma linha já corrigida.
update viagens set data = '2026-04-01' where id = 170 and data = '0206-04-01';
update viagens set data = '2026-04-27' where id = 255 and data = '0026-04-27';
update viagens set data = '2026-05-15' where id = 324 and data = '0026-05-15';

-- 2. Recalcula o status legado. Mesma regra do statusPorCompletude (services/viagens.js
--    e src/lib/viagem.js). O destino é 'concluida' e não 'confirmada' porque todas têm
--    data no passado e ambos os valores: o cron marcarRealizadasPendentes as levaria
--    para lá na próxima meia-noite de qualquer forma.
--
--    Roda DEPOIS do passo 1, para que as três datas corrigidas entrem no recálculo.
update viagens set status = 'concluida'
where status = 'rascunho'
  and data < current_date
  and empresa is not null
  and cliente_id is not null
  and motorista_id is not null
  and caminhao_id is not null
  and valor_frete is not null
  and valor_motorista is not null;

commit;

-- Conferência esperada:
--   select status, count(*) from viagens group by status order by 2 desc;
--     concluida 472 · realizada_pendente 5 · confirmada 5 · cancelada 2 · rascunho 1
--   O único rascunho restante é a #487 (2026-09-01, Rohan), sem motorista_id — está
--   correta, é uma viagem realmente incompleta.
--
-- Atenção: o passo 1 MUDA números na tela. As três viagens estavam fora de todos os
-- filtros e voltam para abr/2026 (x2) e mai/2026, somando +R$ 1.450 de frete e
-- +R$ 430 de pagamento a motorista em "Este ano". O passo 2 não muda valor nenhum —
-- os KPIs já incluíam rascunhos, só 'cancelada' fica de fora.

-- Rollback:
--   update viagens v set data = b.data, status = b.status
--     from backup_003_viagens b where b.id = v.id;
--   drop table backup_003_viagens;

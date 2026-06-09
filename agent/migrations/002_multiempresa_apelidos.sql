-- Migration: suporte a 1 número gerenciando múltiplas empresas + apelidos de motoristas
-- Rode no Supabase Dashboard -> SQL Editor -> New query -> Run

-- 1. Permitir pré-agendar uma viagem para um cliente sem ainda saber qual empresa
--    (Rohan ou TransBeleze) vai atendê-la. Fica como rascunho até a empresa ser definida.
alter table viagens
  alter column empresa drop not null;

-- 2. Apelidos de motoristas: mapeia um apelido informado em conversa para o
--    motorista correto já cadastrado, para o agente reconhecer da próxima vez.
create table if not exists motoristas_apelidos (
  apelido text primary key,
  motorista_id bigint not null references motoristas(id) on delete cascade,
  created_at timestamptz default now()
);

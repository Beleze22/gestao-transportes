-- Migration: suporte ao agente IA via WhatsApp
-- Rode este script inteiro no Supabase Dashboard -> SQL Editor -> New query -> Run

-- 1. Novos campos de logística e ciclo de vida em "viagens"
alter table viagens
  add column if not exists status text default 'rascunho',
  add column if not exists local_carregamento text,
  add column if not exists local_descarregamento text,
  add column if not exists horario_carregamento time,
  add column if not exists horario_descarregamento time,
  add column if not exists observacoes text;

-- 2. Relaxar NOT NULL para permitir viagens em "rascunho" (dados incompletos)
alter table viagens
  alter column cliente_id drop not null,
  alter column motorista_id drop not null,
  alter column caminhao_id drop not null,
  alter column valor_frete drop not null,
  alter column valor_motorista drop not null;

-- 3. Histórico de conversas por telefone (memória do agente)
create table if not exists conversas (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  role text not null,        -- 'user' | 'assistant' | 'tool'
  content text not null,
  created_at timestamptz default now()
);
create index if not exists conversas_telefone_created_idx
  on conversas (telefone, created_at);

-- 4. Configuração de notificações proativas por número da whitelist
create table if not exists config_notificacoes (
  telefone text primary key,
  nome text,
  empresa_padrao text,             -- 'Rohan', 'TransBeleze' ou null (todas)
  horario_manha time default '07:00',
  horario_noite time default '18:00',
  ativo boolean default true,
  dias_antecedencia int default 3
);

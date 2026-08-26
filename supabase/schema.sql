-- ============================================================================
-- Equipe de Rua (Estéfane Sampaio) — script de configuração do banco Supabase.
--
-- Como usar: Supabase → seu projeto → menu "SQL Editor" → "New query" → cole ESTE ARQUIVO
-- INTEIRO → botão "Run". Pode rodar de novo sem medo (todos os comandos são "se não existir"
-- / "sem duplicar"), então não tem problema clicar duas vezes.
--
-- O que este script cria:
--   1. Tabela "pessoas"     — a equipe contratada (nome, contato, função, status)
--   2. Tabela "localidades" — pontos de panfletagem e de reunião/café, por RA
--   3. Tabela "agenda"      — a agenda diária de atividades, ligada a pessoas e localidades
--   4. Regras de segurança (RLS) abertas nas 3 tabelas — igual ao formulário de Cadastro dos
--      outros painéis deste repositório: qualquer pessoa com o link do app consegue ler e
--      gravar (não tem login aqui), o que é o esperado pra uso rápido por toda a equipe de rua
--   5. Tempo real nas 3 tabelas — quem estiver com o app aberto vê os cadastros de outra
--      pessoa aparecerem sozinhos, sem precisar recarregar a página
-- ============================================================================

-- 1) PESSOAS ------------------------------------------------------------------
create table if not exists pessoas (
  id bigint generated always as identity primary key,
  nome text not null,
  contato text not null default '',
  funcao text not null default '',
  status text not null default 'ativo', -- 'ativo' | 'inativo'
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- 2) LOCALIDADES ----------------------------------------------------------------
-- id em texto (não numérico) pra poder já vir com um código fixo no cronograma pré-carregado
-- (ex.: "loc-ceilandia") e continuar dando pra criar localidades novas pelo app com um id
-- gerado ali mesmo (uuid).
create table if not exists localidades (
  id text primary key,
  ra text not null,                        -- região administrativa
  tipo text not null default 'panfletagem', -- 'panfletagem' | 'reuniao'
  endereco text not null default '',
  anfitriao_nome text not null default '',
  anfitriao_contato text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- 3) AGENDA DIÁRIA ----------------------------------------------------------------
create table if not exists agenda (
  id text primary key,
  data date not null,
  tipo_atividade text not null default 'panfletagem', -- 'panfletagem' | 'reuniao' | 'paredao' | 'evento'
  localidade_id text references localidades(id) on delete set null,
  equipe_label text not null default '',   -- rótulo livre, ex: "Grupo 1"
  pessoas_ids bigint[] not null default '{}', -- ids da tabela "pessoas"
  ponto_saida text not null default '',
  ponto_retorno text not null default '',
  horario_inicio text not null default '',
  visita text not null default '',         -- ex: "1ª visita", "2ª visita (retorno)"
  status text not null default 'nao_iniciado', -- 'nao_iniciado' | 'na_rua' | 'retornou'
  observacoes text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- 4) REGRAS DE SEGURANÇA (RLS) -------------------------------------------------
-- Aviso: como o app não tem login, esse acesso de leitura/escrita fica aberto pra qualquer
-- pessoa que tenha o link — o mesmo modelo já usado no formulário de Cadastro do
-- painel-captacao. Adequado pra uso interno rápido pela equipe de rua.
alter table pessoas enable row level security;
alter table localidades enable row level security;
alter table agenda enable row level security;

drop policy if exists "Leitura pública" on pessoas;
create policy "Leitura pública" on pessoas for select using (true);
drop policy if exists "Inserção pública" on pessoas;
create policy "Inserção pública" on pessoas for insert with check (true);
drop policy if exists "Atualização pública" on pessoas;
create policy "Atualização pública" on pessoas for update using (true) with check (true);
drop policy if exists "Remoção pública" on pessoas;
create policy "Remoção pública" on pessoas for delete using (true);

drop policy if exists "Leitura pública" on localidades;
create policy "Leitura pública" on localidades for select using (true);
drop policy if exists "Inserção pública" on localidades;
create policy "Inserção pública" on localidades for insert with check (true);
drop policy if exists "Atualização pública" on localidades;
create policy "Atualização pública" on localidades for update using (true) with check (true);
drop policy if exists "Remoção pública" on localidades;
create policy "Remoção pública" on localidades for delete using (true);

drop policy if exists "Leitura pública" on agenda;
create policy "Leitura pública" on agenda for select using (true);
drop policy if exists "Inserção pública" on agenda;
create policy "Inserção pública" on agenda for insert with check (true);
drop policy if exists "Atualização pública" on agenda;
create policy "Atualização pública" on agenda for update using (true) with check (true);
drop policy if exists "Remoção pública" on agenda;
create policy "Remoção pública" on agenda for delete using (true);

-- 5) TEMPO REAL ----------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table pessoas;
exception when duplicate_object then
  null; -- já estava habilitado — tudo bem, só ignora
end $$;

do $$
begin
  alter publication supabase_realtime add table localidades;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table agenda;
exception when duplicate_object then
  null;
end $$;

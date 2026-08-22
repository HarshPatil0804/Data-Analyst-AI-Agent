-- Run this in Supabase → SQL Editor → New query, once per project.
-- Full-detail history: one row per completed question (sql/python/insights/meta),
-- storing engine + generated code + the actual result, scoped to whichever
-- user asked it.

create table if not exists conversation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_name text not null,
  question text not null,
  engine text not null check (engine in ('sql', 'python', 'insights', 'meta')),
  code text,                  -- the generated SQL/Python; null for insights/meta turns
  result_summary text not null,  -- compact text form of the result (same shape as
                                  -- summarizeResultForHistory() already produces client-side)
  answer_summary text,        -- the 1-2 line caption from generate-answer-summary, if it resolved
  created_at timestamptz not null default now()
);

-- One user's history should never be visible to another. This is the only
-- thing standing between "my saved queries" and "everyone's saved queries",
-- so it is not optional.
alter table conversation_history enable row level security;

create policy "Users can view their own history"
  on conversation_history for select
  using (auth.uid() = user_id);

create policy "Users can insert their own history"
  on conversation_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own history"
  on conversation_history for delete
  using (auth.uid() = user_id);

-- No update policy on purpose — history entries are a record of what actually
-- happened, not something meant to be edited after the fact.

create index if not exists conversation_history_user_created_idx
  on conversation_history (user_id, created_at desc);

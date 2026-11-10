-- In-app notices for an apartment, e.g. "your reservation was cancelled by the space owner".
-- Additive only: no existing table or column changes.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments (id) on delete cascade,
  kind text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_apartment_idx on notifications (apartment_id, created_at);

alter table notifications enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on notifications from anon, authenticated;
  end if;
end
$$;

-- Reservations: an apartment claims part of a period another apartment has made available.
-- Additive only: no existing table or column changes.
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  parking_space_id uuid not null references parking_spaces (id) on delete cascade,
  apartment_id uuid not null references apartments (id) on delete cascade,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  created_at timestamptz not null default now(),
  check (end_datetime > start_datetime)
);
create index if not exists reservations_space_idx on reservations (parking_space_id, end_datetime);
create index if not exists reservations_apartment_idx on reservations (apartment_id, end_datetime);

alter table reservations enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on reservations from anon, authenticated;
  end if;
end
$$;

-- ParkShare initial schema.
-- All data access goes through the server API (service connection); browser clients never talk to the database.

create table if not exists apartments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  access_code_hash text,
  code_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists parking_spaces (
  id uuid primary key default gen_random_uuid(),
  space_number integer not null unique check (space_number > 0),
  apartment_id uuid references apartments (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists parking_spaces_apartment_idx on parking_spaces (apartment_id);

-- One row per one-off period or recurring series. Occurrences are derived, never stored.
create table if not exists availability_schedules (
  id uuid primary key default gen_random_uuid(),
  parking_space_id uuid not null references parking_spaces (id) on delete cascade,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  recurrence_type text not null default 'none'
    check (recurrence_type in ('none', 'daily', 'weekly', 'weekdays')),
  recurrence_days smallint[] not null default '{}',
  recurrence_end_date date,
  timezone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_datetime > start_datetime),
  check (recurrence_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  check (recurrence_type <> 'weekdays' or cardinality(recurrence_days) > 0)
);
create index if not exists availability_schedules_space_idx on availability_schedules (parking_space_id);

create table if not exists availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references availability_schedules (id) on delete cascade,
  occurrence_date date not null,
  exception_type text not null check (exception_type in ('cancelled', 'modified')),
  modified_start_datetime timestamptz,
  modified_end_datetime timestamptz,
  created_at timestamptz not null default now(),
  unique (schedule_id, occurrence_date),
  check (
    exception_type = 'cancelled'
    or (modified_start_datetime is not null and modified_end_datetime > modified_start_datetime)
  )
);

create table if not exists sessions (
  token_hash text primary key,
  kind text not null check (kind in ('apartment', 'admin')),
  apartment_id uuid references apartments (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (kind = 'admin' or apartment_id is not null)
);
create index if not exists sessions_apartment_idx on sessions (apartment_id);

create table if not exists login_attempts (
  id bigint generated always as identity primary key,
  client_key text not null,
  kind text not null check (kind in ('apartment', 'admin')),
  success boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists login_attempts_time_idx on login_attempts (kind, attempted_at);
create index if not exists login_attempts_client_idx on login_attempts (client_key, attempted_at);

create table if not exists activity_log (
  id bigint generated always as identity primary key,
  apartment_id uuid references apartments (id) on delete set null,
  parking_space_id uuid references parking_spaces (id) on delete set null,
  actor text not null check (actor in ('apartment', 'admin')),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_time_idx on activity_log (created_at desc);

-- Row Level Security: enabled without policies => no access for Supabase's public roles.
alter table apartments enable row level security;
alter table parking_spaces enable row level security;
alter table availability_schedules enable row level security;
alter table availability_exceptions enable row level security;
alter table sessions enable row level security;
alter table login_attempts enable row level security;
alter table activity_log enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on apartments, parking_spaces, availability_schedules, availability_exceptions,
      sessions, login_attempts, activity_log from anon, authenticated;
  end if;
end
$$;

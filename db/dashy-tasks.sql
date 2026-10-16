-- Dashy tasks for the screen + Claude (MCP). Run once in the Supabase SQL editor.
-- Row level security is ON with no policies: the public (anon) key can read and write nothing.
-- Only the server, with the service role key (SUPABASE_SERVICE_ROLE_KEY, never in the browser), can reach these tables.
-- The names are prefixed so the tables can live next to other apps in a shared project.

create table if not exists public.dashy_tasks (
  id          text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  title       text not null check (char_length(title) between 1 and 200),
  category    text not null check (category in ('werk', 'sport', 'thuis', 'prive')),
  due_at      bigint,                              -- epoch ms; local midnight when has_time is false
  has_time    boolean not null default false,
  note        text check (note is null or char_length(note) <= 400),
  done        boolean not null default false,
  done_at     bigint,
  position    double precision not null,
  created_at  bigint not null
);
alter table public.dashy_tasks enable row level security;

create table if not exists public.dashy_appointment (
  id       int primary key default 1 check (id = 1),   -- one appointment at a time
  title    text not null,
  at       bigint not null,
  ends_at  bigint
);
alter table public.dashy_appointment enable row level security;

-- Hours (time spent per project) for the screen and Claude. Run this part once more if you set up the tables earlier.
create table if not exists public.dashy_time (
  id          text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  day         text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  project     text check (project is null or char_length(project) <= 60),
  description text not null check (char_length(description) between 1 and 120),
  minutes     int  not null check (minutes between 1 and 960),
  booked      boolean not null default false,
  task_id     text,
  created_at  bigint not null
);
create index if not exists dashy_time_day on public.dashy_time (day);
alter table public.dashy_time enable row level security;

create table if not exists public.trips (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text not null,
  payload jsonb not null,
  client_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, trip_id)
);

create index if not exists trips_user_server_updated_idx on public.trips (user_id, server_updated_at desc);
create index if not exists trips_user_deleted_idx on public.trips (user_id, deleted_at);

create or replace function public.set_trips_server_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

drop trigger if exists trips_set_server_updated_at on public.trips;
create trigger trips_set_server_updated_at before update on public.trips
for each row execute function public.set_trips_server_updated_at();

alter table public.trips enable row level security;

drop policy if exists "Users can select their trips" on public.trips;
create policy "Users can select their trips" on public.trips for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their trips" on public.trips;
create policy "Users can insert their trips" on public.trips for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their trips" on public.trips;
create policy "Users can update their trips" on public.trips for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their trips" on public.trips;
create policy "Users can delete their trips" on public.trips for delete to authenticated using ((select auth.uid()) = user_id);

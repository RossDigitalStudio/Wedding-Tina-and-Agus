-- A&A Wedding Planner - Album digital por QR
-- Ejecutar en Supabase SQL Editor despues del schema principal del planner.

create table if not exists public.wedding_albums (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null unique references public.weddings(id) on delete cascade,
  slug text not null unique,
  title text not null,
  subtitle text,
  welcome_message text not null default 'Ayudanos a guardar esta noche desde todos los puntos de vista.',
  event_date date,
  is_active boolean not null default true,
  uploads_enabled boolean not null default true,
  gallery_enabled boolean not null default true,
  live_enabled boolean not null default true,
  moderation_enabled boolean not null default false,
  allow_videos boolean not null default true,
  max_photo_mb integer not null default 25 check (max_photo_mb between 1 and 100),
  max_video_mb integer not null default 150 check (max_video_mb between 10 and 1000),
  max_video_seconds integer not null default 60 check (max_video_seconds between 5 and 600),
  live_interval_seconds integer not null default 8 check (live_interval_seconds between 3 and 60),
  show_guest_names boolean not null default true,
  missions_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.album_media (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.wedding_albums(id) on delete cascade,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  media_type text not null check (media_type in ('photo', 'video')),
  guest_name text,
  uploader_session_id uuid,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  preview_mime_type text not null default 'image/webp',
  original_key text not null unique,
  preview_key text not null unique,
  upload_state text not null default 'uploading' check (upload_state in ('uploading', 'ready', 'failed')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'hidden', 'rejected')),
  show_in_gallery boolean not null default true,
  show_in_live boolean not null default true,
  favorite boolean not null default false,
  width integer,
  height integer,
  duration_seconds numeric(8,2),
  upload_token_hash text,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.album_missions (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.wedding_albums(id) on delete cascade,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  title text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists album_media_album_created_idx on public.album_media (album_id, created_at desc);
create index if not exists album_media_public_idx on public.album_media (album_id, upload_state, moderation_status, created_at desc);
create index if not exists album_media_uploader_idx on public.album_media (album_id, uploader_session_id) where uploader_session_id is not null;
create index if not exists album_missions_album_order_idx on public.album_missions (album_id, active, sort_order);

create or replace function public.album_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wedding_albums_touch_updated_at on public.wedding_albums;
create trigger wedding_albums_touch_updated_at
before update on public.wedding_albums
for each row execute function public.album_touch_updated_at();

drop trigger if exists album_media_touch_updated_at on public.album_media;
create trigger album_media_touch_updated_at
before update on public.album_media
for each row execute function public.album_touch_updated_at();

drop trigger if exists album_missions_touch_updated_at on public.album_missions;
create trigger album_missions_touch_updated_at
before update on public.album_missions
for each row execute function public.album_touch_updated_at();

create or replace function public.album_is_wedding_member(p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.wedding_members wm
    where wm.wedding_id = p_wedding_id
      and wm.user_id = auth.uid()
  );
$$;

revoke all on function public.album_is_wedding_member(uuid) from public;
grant execute on function public.album_is_wedding_member(uuid) to authenticated;

alter table public.wedding_albums enable row level security;
alter table public.album_media enable row level security;
alter table public.album_missions enable row level security;

drop policy if exists "album public read" on public.wedding_albums;
create policy "album public read"
on public.wedding_albums
for select
to anon, authenticated
using (is_active = true or public.album_is_wedding_member(wedding_id));

drop policy if exists "album members manage" on public.wedding_albums;
create policy "album members manage"
on public.wedding_albums
for all
to authenticated
using (public.album_is_wedding_member(wedding_id))
with check (public.album_is_wedding_member(wedding_id));

drop policy if exists "album media public read" on public.album_media;
create policy "album media public read"
on public.album_media
for select
to anon, authenticated
using (
  public.album_is_wedding_member(wedding_id)
  or (
    upload_state = 'ready'
    and moderation_status = 'approved'
    and (show_in_gallery = true or show_in_live = true)
    and exists (
      select 1
      from public.wedding_albums a
      where a.id = album_media.album_id
        and a.is_active = true
        and (a.gallery_enabled = true or a.live_enabled = true)
    )
  )
);

drop policy if exists "album media members manage" on public.album_media;
create policy "album media members manage"
on public.album_media
for all
to authenticated
using (public.album_is_wedding_member(wedding_id))
with check (public.album_is_wedding_member(wedding_id));

drop policy if exists "album missions public read" on public.album_missions;
create policy "album missions public read"
on public.album_missions
for select
to anon, authenticated
using (
  public.album_is_wedding_member(wedding_id)
  or (
    active = true
    and exists (
      select 1
      from public.wedding_albums a
      where a.id = album_missions.album_id
        and a.is_active = true
        and a.missions_enabled = true
    )
  )
);

drop policy if exists "album missions members manage" on public.album_missions;
create policy "album missions members manage"
on public.album_missions
for all
to authenticated
using (public.album_is_wedding_member(wedding_id))
with check (public.album_is_wedding_member(wedding_id));

grant select on public.wedding_albums, public.album_media, public.album_missions to anon;
grant select, insert, update, delete on public.wedding_albums, public.album_media, public.album_missions to authenticated;

-- Crea automaticamente un album para cada boda existente utilizando el slug ya definido.
insert into public.wedding_albums (wedding_id, slug, title, subtitle, event_date)
select
  w.id,
  w.slug,
  trim(w.partner_one_name || ' & ' || w.partner_two_name),
  'Nuestro album compartido',
  w.ceremony_date::date
from public.weddings w
on conflict (wedding_id) do nothing;

-- Misiones iniciales. Solo se insertan cuando el album todavia no tiene ninguna.
insert into public.album_missions (album_id, wedding_id, title, description, sort_order)
select a.id, a.wedding_id, seed.title, seed.description, seed.sort_order
from public.wedding_albums a
cross join (
  values
    ('Una foto con los novios', 'Buscanos y saquemonos una foto juntos.', 10),
    ('La foto de tu mesa', 'Queremos ver a todo tu equipo junto.', 20),
    ('La mejor selfie de la noche', 'Puede ser elegante, espontanea o completamente caotica.', 30),
    ('El mejor paso de baile', 'Congela ese momento de la pista.', 40),
    ('Una foto con alguien que conociste hoy', 'Nuevo recuerdo, nueva persona.', 50)
) as seed(title, description, sort_order)
where not exists (
  select 1 from public.album_missions existing where existing.album_id = a.id
);

alter table public.album_media replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'album_media'
  ) then
    alter publication supabase_realtime add table public.album_media;
  end if;
end;
$$;

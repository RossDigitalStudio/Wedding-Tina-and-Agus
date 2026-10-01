-- Ejecutar después de 004_album_digital.sql. No elimina fotos ni datos existentes.
begin;
alter table public.wedding_albums
  add column if not exists max_uploads_per_guest integer not null default 10 check (max_uploads_per_guest between 0 and 1000),
  add column if not exists people_enabled boolean not null default true,
  add column if not exists sparks_enabled boolean not null default true,
  add column if not exists instagram_on_match boolean not null default true,
  add column if not exists likes_enabled boolean not null default true,
  add column if not exists gallery_reveal_at timestamptz;

create table if not exists public.album_guests (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.wedding_albums(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  instagram_handle text check (instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'),
  profile_photo_key text,
  social_enabled boolean not null default false,
  sparks_enabled boolean not null default false,
  is_adult boolean not null default false,
  blocked boolean not null default false,
  session_token_hash text not null unique,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (album_id, id),
  check (not sparks_enabled or (social_enabled and is_adult))
);
alter table public.album_media add column if not exists guest_id uuid references public.album_guests(id) on delete set null;
alter table public.album_media add column if not exists client_upload_id uuid;
create unique index if not exists album_media_client_upload_idx on public.album_media(guest_id, client_upload_id) where client_upload_id is not null;
create index if not exists album_media_guest_idx on public.album_media(album_id, guest_id, upload_state);
create index if not exists album_guests_album_idx on public.album_guests(album_id, joined_at);

create table if not exists public.album_sparks (
  album_id uuid not null references public.wedding_albums(id) on delete cascade,
  from_guest_id uuid not null,
  to_guest_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (album_id, from_guest_id, to_guest_id),
  foreign key (album_id, from_guest_id) references public.album_guests(album_id, id) on delete cascade,
  foreign key (album_id, to_guest_id) references public.album_guests(album_id, id) on delete cascade,
  check (from_guest_id <> to_guest_id)
);
create table if not exists public.album_likes (
  album_id uuid not null references public.wedding_albums(id) on delete cascade,
  media_id uuid not null references public.album_media(id) on delete cascade,
  guest_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (media_id, guest_id),
  foreign key (album_id, guest_id) references public.album_guests(album_id, id) on delete cascade
);
create table if not exists public.album_reports (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.wedding_albums(id) on delete cascade,
  reporter_guest_id uuid not null,
  media_id uuid references public.album_media(id) on delete cascade,
  reported_guest_id uuid,
  reason text not null check (char_length(reason) between 1 and 300),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (album_id, reporter_guest_id) references public.album_guests(album_id, id) on delete cascade,
  foreign key (album_id, reported_guest_id) references public.album_guests(album_id, id) on delete cascade,
  check ((media_id is null) <> (reported_guest_id is null))
);
create unique index if not exists album_reports_media_once on public.album_reports(reporter_guest_id, media_id) where media_id is not null;
create unique index if not exists album_reports_guest_once on public.album_reports(reporter_guest_id, reported_guest_id) where reported_guest_id is not null;

alter table public.album_guests enable row level security;
alter table public.album_sparks enable row level security;
alter table public.album_likes enable row level security;
alter table public.album_reports enable row level security;
-- Guests access these through cookie-authenticated server endpoints, never directly.
revoke all on public.album_guests, public.album_sparks, public.album_likes, public.album_reports from anon, authenticated;
grant all on public.album_guests, public.album_sparks, public.album_likes, public.album_reports to service_role;
grant select(id, album_id, display_name, social_enabled, sparks_enabled, is_adult, blocked, joined_at, last_seen_at) on public.album_guests to authenticated;
grant update(blocked) on public.album_guests to authenticated;
grant select, update on public.album_reports to authenticated;
drop policy if exists "album guests members read" on public.album_guests;
create policy "album guests members read" on public.album_guests for select to authenticated using (exists (select 1 from public.wedding_albums a where a.id = album_id and public.album_is_wedding_member(a.wedding_id)));
drop policy if exists "album guests members block" on public.album_guests;
create policy "album guests members block" on public.album_guests for update to authenticated using (exists (select 1 from public.wedding_albums a where a.id = album_id and public.album_is_wedding_member(a.wedding_id))) with check (exists (select 1 from public.wedding_albums a where a.id = album_id and public.album_is_wedding_member(a.wedding_id)));
drop policy if exists "album reports members manage" on public.album_reports;
create policy "album reports members manage" on public.album_reports for all to authenticated using (exists (select 1 from public.wedding_albums a where a.id = album_id and public.album_is_wedding_member(a.wedding_id))) with check (exists (select 1 from public.wedding_albums a where a.id = album_id and public.album_is_wedding_member(a.wedding_id)));
-- The existing public media policy calls this function for anonymous guests too.
grant execute on function public.album_is_wedding_member(uuid) to anon;

-- Serialize reservations per guest: concurrent devices/tabs cannot exceed the quota.
create or replace function public.album_reserve_upload(p_guest_id uuid, p_media jsonb)
returns public.album_media
language plpgsql security invoker set search_path = '' as $$
declare
  g public.album_guests;
  a public.wedding_albums;
  m public.album_media;
  used integer;
begin
  select * into g from public.album_guests where id = p_guest_id for update;
  if g.id is null or g.blocked then raise exception 'GUEST_BLOCKED'; end if;
  select * into a from public.wedding_albums where id = g.album_id for share;
  if not a.is_active or not a.uploads_enabled then raise exception 'UPLOADS_PAUSED'; end if;
  select * into m from public.album_media where guest_id = g.id and client_upload_id = (p_media->>'client_upload_id')::uuid;
  if m.id is not null and m.upload_state = 'ready' then return m; end if;
  select count(*) into used from public.album_media
    where guest_id = g.id and (m.id is null or id <> m.id)
    and (upload_state = 'ready' or (upload_state = 'uploading' and updated_at > now() - interval '24 hours'));
  if a.max_uploads_per_guest > 0 and used >= a.max_uploads_per_guest then raise exception 'GUEST_LIMIT'; end if;
  if m.id is not null then
    update public.album_media set upload_state = 'uploading', upload_token_hash = p_media->>'upload_token_hash', updated_at = now() where id = m.id returning * into m;
  else
    insert into public.album_media(id, album_id, wedding_id, guest_id, client_upload_id, media_type, guest_name, original_filename, mime_type, file_size_bytes, original_key, preview_key, moderation_status, upload_token_hash)
    values ((p_media->>'id')::uuid, a.id, a.wedding_id, g.id, (p_media->>'client_upload_id')::uuid, p_media->>'media_type', g.display_name, p_media->>'original_filename', p_media->>'mime_type', (p_media->>'file_size_bytes')::bigint, p_media->>'original_key', p_media->>'preview_key', case when a.moderation_enabled then 'pending' else 'approved' end, p_media->>'upload_token_hash') returning * into m;
  end if;
  return m;
end;
$$;
revoke all on function public.album_reserve_upload(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.album_reserve_upload(uuid, jsonb) to service_role;

create or replace function public.album_finish_upload(p_guest_id uuid, p_media_id uuid, p_token_hash text, p_width integer, p_height integer, p_duration numeric)
returns public.album_media
language plpgsql security invoker set search_path = '' as $$
declare g public.album_guests; a public.wedding_albums; m public.album_media; used integer;
begin
  select * into g from public.album_guests where id = p_guest_id for update;
  if g.id is null or g.blocked then raise exception 'GUEST_BLOCKED'; end if;
  select * into a from public.wedding_albums where id = g.album_id for share;
  if not a.is_active or not a.uploads_enabled then raise exception 'UPLOADS_PAUSED'; end if;
  select * into m from public.album_media where id = p_media_id and guest_id = g.id for update;
  if m.id is null or m.upload_state <> 'uploading' or m.upload_token_hash is distinct from p_token_hash then raise exception 'INVALID_UPLOAD'; end if;
  if m.updated_at <= now() - interval '24 hours' then raise exception 'UPLOAD_EXPIRED'; end if;
  if m.media_type = 'video' and (p_duration is null or p_duration <= 0 or p_duration > a.max_video_seconds) then raise exception 'VIDEO_DURATION'; end if;
  select count(*) into used from public.album_media where guest_id = g.id and id <> m.id and upload_state = 'ready';
  if a.max_uploads_per_guest > 0 and used >= a.max_uploads_per_guest then raise exception 'GUEST_LIMIT'; end if;
  update public.album_media set upload_state = 'ready', upload_token_hash = null, width = p_width, height = p_height, duration_seconds = p_duration, uploaded_at = now() where id = m.id returning * into m;
  return m;
end;
$$;
revoke all on function public.album_finish_upload(uuid, uuid, text, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.album_finish_upload(uuid, uuid, text, integer, integer, numeric) to service_role;
-- Scheduled reveal is enforced in the public database policy too.
drop policy if exists "album media public read" on public.album_media;
create policy "album media public read" on public.album_media for select to anon, authenticated using (
  public.album_is_wedding_member(wedding_id) or (
    upload_state = 'ready' and moderation_status = 'approved' and exists (
      select 1 from public.wedding_albums a where a.id = album_media.album_id and a.is_active and (
        (a.gallery_enabled and (a.gallery_reveal_at is null or a.gallery_reveal_at <= now()) and show_in_gallery)
        or (a.live_enabled and show_in_live)
      )
    )
  )
);
create index if not exists album_sparks_incoming_idx on public.album_sparks(album_id, to_guest_id);
create index if not exists album_likes_album_idx on public.album_likes(album_id);
create index if not exists album_reports_album_idx on public.album_reports(album_id, resolved);
commit;

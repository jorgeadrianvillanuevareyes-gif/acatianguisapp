-- ACATIANGUIS: tablas, permisos y fotografías de productos.
-- Preparado el 22 de octubre de 2026. PENDIENTE DE AUTORIZACIÓN Y APLICACIÓN.
-- No modifica las tablas del juego Corre a Clase Acatlán.

create table if not exists public.student_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  alias text not null check (char_length(alias) between 2 and 38),
  career text not null check (char_length(career) between 2 and 80),
  bio text not null default '' check (char_length(bio) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.student_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  whatsapp_e164 text check (whatsapp_e164 is null or whatsapp_e164 ~ '^52[0-9]{10}$'),
  whatsapp_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint whatsapp_requires_number check (not whatsapp_enabled or whatsapp_e164 is not null)
);
create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.student_profiles(id) on delete cascade,
  type text not null check (type in ('offer','want')),
  name text not null check (char_length(name) between 2 and 65),
  category text not null check (category in ('Libros','Tecnología','Materiales','Otros')),
  price integer not null check (price between 0 and 100000),
  description text not null check (char_length(description) between 3 and 240),
  condition text check (condition is null or condition in ('Como nuevo','Buen estado','Con detalles','Para reparar')),
  zone text not null default '' check (char_length(zone) <= 80),
  status text not null default 'Disponible' check (status in ('Disponible','Vendido')),
  image_path text check (image_path is null or (char_length(image_path) <= 200 and image_path like user_id::text || '/%')),
  -- Público solamente cuando el anunciante activa WhatsApp.
  contact_whatsapp text check (contact_whatsapp is null or contact_whatsapp ~ '^52[0-9]{10}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists market_listings_by_created on public.market_listings (created_at desc);
create index if not exists market_listings_by_user on public.market_listings (user_id);

alter table public.student_profiles enable row level security;
alter table public.student_contacts enable row level security;
alter table public.market_listings enable row level security;
grant usage on schema public to anon, authenticated;
revoke all on public.student_profiles, public.student_contacts, public.market_listings from anon, authenticated;
grant select on public.student_profiles, public.market_listings to anon, authenticated;
grant insert, update, delete on public.student_profiles, public.market_listings to authenticated;
grant select, insert, update, delete on public.student_contacts to authenticated;

drop policy if exists "Public student names" on public.student_profiles;
create policy "Public student names" on public.student_profiles
  for select to anon, authenticated using (true);
drop policy if exists "Create own profile" on public.student_profiles;
create policy "Create own profile" on public.student_profiles
  for insert to authenticated with check (
    (select auth.uid()) = id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false)
  );
drop policy if exists "Update own profile" on public.student_profiles;
create policy "Update own profile" on public.student_profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
drop policy if exists "Delete own profile" on public.student_profiles;
create policy "Delete own profile" on public.student_profiles
  for delete to authenticated using ((select auth.uid()) = id);

drop policy if exists "Read own contact" on public.student_contacts;
create policy "Read own contact" on public.student_contacts
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Create own contact" on public.student_contacts;
create policy "Create own contact" on public.student_contacts
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own contact" on public.student_contacts;
create policy "Update own contact" on public.student_contacts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own contact" on public.student_contacts;
create policy "Delete own contact" on public.student_contacts
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Anyone reads listings" on public.market_listings;
create policy "Anyone reads listings" on public.market_listings
  for select to anon, authenticated using (true);
drop policy if exists "Create own listing" on public.market_listings;
create policy "Create own listing" on public.market_listings
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own listing" on public.market_listings;
create policy "Update own listing" on public.market_listings
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own listing" on public.market_listings;
create policy "Delete own listing" on public.market_listings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Funciones privadas de trigger: copian únicamente el contacto autorizado.
create schema if not exists private;
create or replace function private.sync_listing_contact()
returns trigger language plpgsql security definer set search_path = '' as $$
declare contact_number text;
begin
  if (select auth.uid()) is not null and (select auth.uid()) is distinct from new.user_id then
    raise exception 'No puedes cambiar anuncios de otra cuenta.' using errcode = '42501';
  end if;
  select c.whatsapp_e164 into contact_number
  from public.student_contacts c
  where c.user_id = new.user_id and c.whatsapp_enabled = true;
  new.contact_whatsapp := contact_number;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.sync_listing_contact() from public, anon, authenticated;
drop trigger if exists set_listing_contact on public.market_listings;
create trigger set_listing_contact before insert or update on public.market_listings
for each row execute function private.sync_listing_contact();

create or replace function private.propagate_contact_setting()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  if tg_op = 'DELETE' then owner_id := old.user_id; else owner_id := new.user_id; end if;
  if (select auth.uid()) is not null and (select auth.uid()) is distinct from owner_id then
    raise exception 'No puedes cambiar el contacto de otra cuenta.' using errcode = '42501';
  end if;
  -- El trigger de anuncios consulta la preferencia actual y limpia el número al eliminarla.
  update public.market_listings set updated_at = now() where user_id = owner_id;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.propagate_contact_setting() from public, anon, authenticated;
drop trigger if exists propagate_student_contact on public.student_contacts;
create trigger propagate_student_contact after insert or update or delete on public.student_contacts
for each row execute function private.propagate_contact_setting();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('acatianguis-products','acatianguis-products',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=excluded.public,
  file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Read product photos" on storage.objects;
create policy "Read product photos" on storage.objects
for select to anon, authenticated using (bucket_id = 'acatianguis-products');
drop policy if exists "Upload in own folder" on storage.objects;
create policy "Upload in own folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'acatianguis-products'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false)
);
drop policy if exists "Delete own product photos" on storage.objects;
create policy "Delete own product photos" on storage.objects
for delete to authenticated using (
  bucket_id = 'acatianguis-products'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

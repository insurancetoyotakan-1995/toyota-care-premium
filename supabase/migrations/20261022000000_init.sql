-- ข้อมูลตารางเบี้ย TOYOTA CARE: แต่ละชุดที่อัปโหลดเก็บเป็น 1 แถว (jsonb) และมีชุด "ปัจจุบัน" ชุดเดียว

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table public.rate_sets (
  version    text primary key,
  as_of      text,
  file       text,
  cars       int,
  rows       int,
  data       jsonb not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index rate_sets_one_current on public.rate_sets (is_current) where is_current;

alter table public.admins    enable row level security;
alter table public.rate_sets enable row level security;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) $$;

-- ทุกคนอ่านได้, ไม่มี policy เขียน: การเขียนทำผ่านฟังก์ชันด้านล่างซึ่งตรวจสิทธิ์ผู้ดูแล
create policy "read rate sets" on public.rate_sets for select to anon, authenticated using (true);
create policy "read own admin row" on public.admins for select to authenticated using (user_id = (select auth.uid()));

create function public.publish_rates(p_version text, p_as_of text, p_file text, p_cars int, p_rows int, p_data jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.rate_sets set is_current = false where is_current;
  insert into public.rate_sets (version, as_of, file, cars, rows, data, is_current)
  values (p_version, p_as_of, p_file, p_cars, p_rows, p_data, true);
  -- เก็บย้อนหลังไว้ 5 ชุดล่าสุด
  delete from public.rate_sets where version not in
    (select version from public.rate_sets order by created_at desc limit 5);
end $$;

create function public.reset_rates() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.rate_sets set is_current = false where is_current;
end $$;

revoke all on function public.publish_rates, public.reset_rates from public, anon;
grant execute on function public.publish_rates, public.reset_rates to authenticated;
grant execute on function public.is_admin to anon, authenticated;

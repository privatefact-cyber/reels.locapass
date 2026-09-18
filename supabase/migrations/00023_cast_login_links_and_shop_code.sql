-- 【目的1】キャストが投稿用マイページのURLを紛失したりログアウトしたりしても、
-- 店舗管理画面からいつでも「投稿用リンク(マジックリンク)」を再確認・再共有(URLコピー/LINE送信/QR)
-- できるようにする。cast_field_tokens(00013, GPS/SOS用)と同じ「トークン自体が認証情報」設計を
-- 踏襲しつつ、こちらはマイページへの本ログインを許可する強い権限を持つため、
-- 完全に別テーブルへ分離する(混同・使い回し防止)。

create table public.cast_login_tokens (
  cast_id uuid primary key references public.cast_members (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index idx_cast_login_tokens_shop_id on public.cast_login_tokens (shop_id);

alter table public.cast_login_tokens enable row level security;

-- 店舗スタッフ(自店舗)・運営者のみ閲覧可。cast_field_tokensと同じくanonからの直接読み取りは許可しない
-- (トークンはredeem_cast_login_token経由でのみ消費させ、一覧取得はさせない)。
create policy "shop read own cast login tokens"
  on public.cast_login_tokens for select
  to authenticated
  using (shop_id in (select public.current_shop_ids()) or public.is_platform_admin());

-- cast_members作成時に自動発行する。
create or replace function public.create_cast_login_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cast_login_tokens (cast_id, shop_id)
  values (new.id, new.shop_id)
  on conflict (cast_id) do nothing;
  return new;
end;
$$;

create trigger trg_cast_members_create_login_token
  after insert on public.cast_members
  for each row
  execute function public.create_cast_login_token();

-- 既存キャストへバックフィル。
insert into public.cast_login_tokens (cast_id, shop_id)
select id, shop_id from public.cast_members
on conflict (cast_id) do nothing;

-- リンク漏洩時などに店舗スタッフが失効(再発行)できるようにする。
create or replace function public.regenerate_cast_login_token(p_cast_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_new_token uuid := gen_random_uuid();
begin
  select shop_id into v_shop_id from public.cast_members where id = p_cast_id;
  if v_shop_id is null then
    raise exception 'cast not found';
  end if;
  if v_shop_id not in (select public.current_shop_ids()) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  update public.cast_login_tokens set token = v_new_token where cast_id = p_cast_id;
  return v_new_token;
end;
$$;

revoke all on function public.regenerate_cast_login_token(uuid) from public;
revoke execute on function public.regenerate_cast_login_token(uuid) from anon;
grant execute on function public.regenerate_cast_login_token(uuid) to authenticated;

-- トークンを1回使い切りにせず、何度でも踏める「マジックリンク」として運用する。
-- 訪問のたびにワンタイムパスワードを新規発行してauth.usersへ反映し、
-- クライアント側でそのままsignInWithPasswordする(Supabase Admin API(service role)が
-- このアプリの実行環境に無いため、00015_cast_invite.sqlと同じ「SECURITY DEFINER関数から
-- auth.usersを直接更新する」方式を踏襲。project_modella_overviewに記録済みの既知の制約)。
create or replace function public.redeem_cast_login_token(p_token uuid)
returns table(login_email text, one_time_password text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cast_id uuid;
  v_user_id uuid;
  v_email text;
  v_password text;
  v_encrypted text;
begin
  select cast_id into v_cast_id from public.cast_login_tokens where token = p_token;
  if v_cast_id is null then
    raise exception 'invalid token';
  end if;

  select user_id into v_user_id from public.cast_members where id = v_cast_id;
  if v_user_id is null then
    raise exception 'login not provisioned for this cast yet';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  v_password := substr(md5(gen_random_uuid()::text), 1, 10);
  v_encrypted := crypt(v_password, gen_salt('bf'));
  update auth.users set encrypted_password = v_encrypted, updated_at = now() where id = v_user_id;

  return query select v_email, v_password;
end;
$$;

revoke all on function public.redeem_cast_login_token(uuid) from public;
grant execute on function public.redeem_cast_login_token(uuid) to anon, authenticated;

-- 【目的2】店舗を人が識別・入力しやすい短いコードで管理できるようにする(将来の店舗数拡大に備え、
-- UUIDより扱いやすい一意な英数字6桁コードを自動採番)。今回はキャストログインには使わず、
-- 店舗情報画面に表示するだけの独立した識別子として追加する。
alter table public.shops add column shop_code text unique;

create or replace function public.generate_shop_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 紛らわしい 0/O, 1/I を除外
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.shops where shop_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.set_shop_code()
returns trigger
language plpgsql
as $$
begin
  if new.shop_code is null then
    new.shop_code := public.generate_shop_code();
  end if;
  return new;
end;
$$;

create trigger trg_shops_set_shop_code
  before insert on public.shops
  for each row
  execute function public.set_shop_code();

update public.shops set shop_code = public.generate_shop_code() where shop_code is null;

alter table public.shops alter column shop_code set not null;

-- p_avatar_urlを省略可能にする(クライアント側でnullを渡さずに済むようにするため。
-- supabase-jsの型生成はfunction引数のnull許容を表現できず、
-- デフォルト値付きの引数のみoptionalとして扱われる)。
create or replace function public.update_own_cast_profile(
  p_name text,
  p_pr_text text,
  p_avatar_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cast_members
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    pr_text = p_pr_text,
    avatar_url = coalesce(p_avatar_url, avatar_url)
  where id = public.current_cast_id();
end;
$$;

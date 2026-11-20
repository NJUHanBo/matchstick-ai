-- 书案速查（desk.matchstick-ai.xyz）随手留底本
-- 在 Supabase → SQL Editor 里整段运行一次。
-- 运行前把最后一行 '改成你的口令' 换成你在 Vercel 环境变量里填的同一个 DESK_PASSWORD。
-- 两张表都开 RLS 且不建 policy：公开 anon key 不能直接读写，只能通过口令校验函数操作。

create table if not exists desk_clippings (
  id text primary key check (char_length(id) between 4 and 64),
  created_at timestamptz not null default now(),
  ts_label text not null default '',
  title text not null,
  tags jsonb not null default '[]'::jsonb,
  bullets jsonb not null default '[]'::jsonb,
  raw_body text not null default '',
  user_note text not null default '',
  sources jsonb not null default '[]'::jsonb,
  origin text not null default 'web'
);
create index if not exists desk_clippings_created_idx on desk_clippings (created_at desc);

create table if not exists desk_config (
  key text primary key,
  value text not null
);

alter table desk_clippings enable row level security;
alter table desk_config enable row level security;

create or replace function desk_check_pwd(p_pwd text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value from desk_config where key = 'access_password'), '') = ''
      or coalesce(p_pwd, '') = (select value from desk_config where key = 'access_password');
$$;

create or replace function desk_list_clippings(p_pwd text, p_query text default '', p_limit int default 80)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
  lim int := greatest(1, least(coalesce(p_limit, 80), 200));
begin
  if not desk_check_pwd(p_pwd) then
    raise exception 'bad_password';
  end if;
  return coalesce((
    select json_agg(row_to_json(t))
    from (
      select
        id,
        coalesce(nullif(ts_label, ''), to_char(created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI')) as timestamp,
        title,
        tags,
        bullets,
        raw_body,
        user_note,
        sources,
        origin
      from desk_clippings
      where q = ''
         or lower(title) like '%' || q || '%'
         or lower(user_note) like '%' || q || '%'
         or lower(raw_body) like '%' || q || '%'
         or lower(tags::text) like '%' || q || '%'
         or lower(bullets::text) like '%' || q || '%'
      order by created_at desc, id desc
      limit lim
    ) t
  ), '[]'::json);
end $$;

create or replace function desk_upsert_clipping(p_pwd text, p_item jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_id text := btrim(coalesce(p_item->>'id', ''));
  v_ts text := btrim(coalesce(p_item->>'timestamp', ''));
  v_title text := left(btrim(coalesce(p_item->>'title', '随手留底')), 120);
begin
  if not desk_check_pwd(p_pwd) then
    raise exception 'bad_password';
  end if;
  if v_id = '' then
    v_id := to_char(now() at time zone 'Asia/Shanghai', 'YYYYMMDD-HH24MISS');
  end if;
  if v_ts = '' then
    v_ts := to_char(now() at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI');
  end if;

  insert into desk_clippings (id, ts_label, title, tags, bullets, raw_body, user_note, sources, origin)
  values (
    v_id,
    v_ts,
    v_title,
    coalesce(p_item->'tags', '[]'::jsonb),
    coalesce(p_item->'bullets', '[]'::jsonb),
    coalesce(p_item->>'raw_body', ''),
    coalesce(p_item->>'user_note', ''),
    coalesce(p_item->'sources', '[]'::jsonb),
    coalesce(nullif(p_item->>'origin', ''), 'web')
  )
  on conflict (id) do update set
    title = excluded.title,
    tags = excluded.tags,
    bullets = excluded.bullets,
    raw_body = excluded.raw_body,
    user_note = excluded.user_note,
    sources = excluded.sources;

  return json_build_object('ok', true, 'id', v_id, 'timestamp', v_ts);
end $$;

create or replace function desk_delete_clipping(p_pwd text, p_id text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not desk_check_pwd(p_pwd) then
    raise exception 'bad_password';
  end if;
  delete from desk_clippings where id = p_id;
  return json_build_object('ok', true, 'deleted', p_id);
end $$;

grant execute on function desk_list_clippings(text, text, int) to anon;
grant execute on function desk_upsert_clipping(text, jsonb) to anon;
grant execute on function desk_delete_clipping(text, text) to anon;

-- 个人访问口令：默认留空表示免密直进；以后想加锁时改成与 Vercel DESK_PASSWORD 相同的字符串即可
insert into desk_config (key, value) values ('access_password', '')
on conflict (key) do update set value = excluded.value;

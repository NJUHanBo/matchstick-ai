-- 奇奇妙妙屋 · 万圣节赏金猎人（hunt/）
-- 在 Supabase → SQL Editor 里整段运行一次。运行前把最后一行的店员密码改掉。
-- 三张表都开 RLS 且不建 policy：公开 key 不能直接读写，只能调用下面三个函数。

create table if not exists hunt_hunters (
  id text primary key check (char_length(id) between 8 and 40),
  no bigserial unique,
  codename text not null check (char_length(codename) between 1 and 12),
  invited_by text,
  created_at timestamptz not null default now()
);
create index if not exists hunt_hunters_invited_by on hunt_hunters (invited_by);

create table if not exists hunt_captures (
  monster_id int primary key check (monster_id between 1 and 42),
  captured_at timestamptz not null default now()
);

create table if not exists hunt_config (
  key text primary key,
  value text not null
);

alter table hunt_hunters enable row level security;
alter table hunt_captures enable row level security;
alter table hunt_config enable row level security;

-- 登记猎人；已登记的直接返回原编号。邀请人必须是已登记的猎人，且不能是自己。
create or replace function hunt_register(p_id text, p_codename text, p_from text)
returns json language plpgsql security definer set search_path = public as $$
declare r hunt_hunters;
begin
  select * into r from hunt_hunters where id = p_id;
  if not found then
    insert into hunt_hunters (id, codename, invited_by)
    values (
      p_id,
      left(btrim(p_codename), 12),
      case when p_from is not null and p_from <> p_id
                and exists (select 1 from hunt_hunters where id = p_from)
           then p_from end
    )
    returning * into r;
  end if;
  return json_build_object('no', r.no, 'codename', r.codename);
end $$;

-- 页面状态：已归案名单、登记总人数、我的编号、我邀请了几人
create or replace function hunt_state(p_id text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'captured', coalesce((select json_agg(monster_id order by captured_at) from hunt_captures), '[]'::json),
    'hunters', (select count(*) from hunt_hunters),
    'me', (select json_build_object('no', no, 'codename', codename) from hunt_hunters where id = p_id),
    'invites', (select count(*) from hunt_hunters where invited_by = p_id)
  );
$$;

-- 店员标记归案 / 撤回。p_monster 为空时只校验密码。
create or replace function hunt_capture(p_pwd text, p_monster int, p_undo boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_pwd is distinct from (select value from hunt_config where key = 'admin_password') then
    raise exception 'bad_password';
  end if;
  if p_monster is not null then
    if p_undo then
      delete from hunt_captures where monster_id = p_monster;
    else
      insert into hunt_captures (monster_id) values (p_monster) on conflict do nothing;
    end if;
  end if;
  return coalesce((select json_agg(monster_id order by captured_at) from hunt_captures), '[]'::json);
end $$;

grant execute on function hunt_register(text, text, text) to anon;
grant execute on function hunt_state(text) to anon;
grant execute on function hunt_capture(text, int, boolean) to anon;

-- 店员后台密码（改成你自己的）
insert into hunt_config (key, value) values ('admin_password', '改成你的密码')
on conflict (key) do update set value = excluded.value;

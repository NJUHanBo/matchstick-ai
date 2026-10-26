-- 赏金猎人：记录每位猎人领了哪只怪物（在 supabase-hunt.sql 之后运行一次）
-- 领令仍由页面随机抽取；这里只记账，供店员后台查看。

create table if not exists hunt_claims (
  hunter_id text not null references hunt_hunters (id) on delete cascade,
  monster_id int not null check (monster_id between 1 and 42),
  claimed_at timestamptz not null default now(),
  primary key (hunter_id, monster_id)
);
alter table hunt_claims enable row level security;

-- 页面领令 / 换令时上报；未登记的编号直接忽略
create or replace function hunt_claim(p_id text, p_monster int)
returns void language sql security definer set search_path = public as $$
  insert into hunt_claims (hunter_id, monster_id)
  select p_id, p_monster where exists (select 1 from hunt_hunters where id = p_id)
  on conflict do nothing;
$$;

-- 店员后台：领令明细（需要店员密码）
create or replace function hunt_claims_list(p_pwd text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_pwd is distinct from (select value from hunt_config where key = 'admin_password') then
    raise exception 'bad_password';
  end if;
  return coalesce((
    select json_agg(json_build_object('m', c.monster_id, 'no', h.no, 'cn', h.codename, 't', c.claimed_at)
                    order by c.monster_id, c.claimed_at)
    from hunt_claims c join hunt_hunters h on h.id = c.hunter_id
  ), '[]'::json);
end $$;

grant execute on function hunt_claim(text, int) to anon;
grant execute on function hunt_claims_list(text) to anon;

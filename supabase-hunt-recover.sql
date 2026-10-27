-- 赏金猎人：换了浏览器或手机后找回猎人身份（在 supabase-hunt-claims.sql 之后运行一次）
-- 页面靠浏览器本地存储认人；换浏览器（例如微信里登记、又用相机扫码打开）就认不出来。
-- 凭「猎人编号 + 代号」找回原来的身份，并把服务器上记着的令一起带回。

create or replace function hunt_recover(p_no bigint, p_codename text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('id', id)
  from hunt_hunters
  where no = p_no and codename = left(btrim(p_codename), 12);
$$;

-- 页面状态多返回一项 mine：这位猎人在服务器上记着的令
create or replace function hunt_state(p_id text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'captured', coalesce((select json_agg(monster_id order by captured_at) from hunt_captures), '[]'::json),
    'hunters', (select count(*) from hunt_hunters),
    'me', (select json_build_object('no', no, 'codename', codename) from hunt_hunters where id = p_id),
    'invites', (select count(*) from hunt_hunters where invited_by = p_id),
    'mine', coalesce((select json_agg(monster_id order by claimed_at) from hunt_claims where hunter_id = p_id), '[]'::json)
  );
$$;

-- 猎人名册：页面上公开列出编号、代号、登记日期（不含内部 id），点「是我」再走 hunt_recover
create or replace function hunt_roster()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'no', no, 'cn', codename, 't', to_char(created_at at time zone 'Asia/Shanghai', 'MM.DD'))
         order by no), '[]'::json)
  from hunt_hunters;
$$;

grant execute on function hunt_recover(bigint, text) to anon;
grant execute on function hunt_roster() to anon;
grant execute on function hunt_state(text) to anon;

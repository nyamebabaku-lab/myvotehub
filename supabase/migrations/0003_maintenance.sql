-- Guards apply to signed-in app users. Direct database maintenance (the Supabase SQL editor, no signed-in user)
-- is not blocked. Anonymous visitors have no update rights on profiles at all (row-level security).
create or replace function guard_profile_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin()
     and (new.role <> old.role or new.status <> old.status or new.super <> old.super or new.company_id is distinct from old.company_id) then
    raise exception 'Only MyVoteHub admins can change roles or approval';
  end if;
  return new;
end $$;

-- Push changes for every table the dashboards show (row-level security still decides who receives what).
alter publication supabase_realtime add table payments, profiles, companies, categories, evictions;

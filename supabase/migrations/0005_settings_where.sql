-- Supabase rejects UPDATE without WHERE on API requests (pg_safeupdate). Settings has one row (id = true).
create or replace function set_test_mode(flag boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super() then raise exception 'Only a Super Admin can do this'; end if;
  update settings set test_mode = flag where id;
  perform audit(case when flag then 'Test mode on' else 'Test mode off — live payments only' end, null);
end $$;

create or replace function set_ussd_code(code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super() then raise exception 'Only a Super Admin can do this'; end if;
  update settings set ussd_code = nullif(trim(code), '') where id;
  perform audit('USSD code set', coalesce(nullif(trim(code), ''), 'none'));
end $$;

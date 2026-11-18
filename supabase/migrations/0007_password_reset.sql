-- Password help.
-- 1) Self-service: Supabase emails a 6-digit recovery code (needs SMTP; see docs/LAUNCH.md).
-- 2) Admin reset: an admin sets a temporary password; the user must change it at next sign-in.
-- 3) "Ask an admin": a signed-out user can ask MyVoteHub admins for help (rate-limited).

alter table profiles add column must_change_password boolean not null default false;

create table password_help (
  id bigint generated always as identity primary key,
  email text not null,
  created_at timestamptz not null default now(),
  handled boolean not null default false
);
alter table password_help enable row level security;
create policy "admins read password help" on password_help for select using (is_admin());
create policy "admins handle password help" on password_help for update using (is_admin());

-- Signed-out users: tell admins someone needs help. Answers the same whether or not the email exists.
create or replace function request_password_help(addr text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(addr)); p profiles;
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if exists (select 1 from password_help where email = e and created_at > now() - interval '15 minutes') then return; end if;
  if (select count(*) from password_help where created_at > now() - interval '1 hour') > 30 then return; end if;
  select * into p from profiles where lower(email) = e;
  if p.id is null then return; end if;
  insert into password_help (email) values (e);
  insert into notifications (to_role, title, body, link) values ('admin', 'Password help requested', p.name || ' (' || e || ')', '/app/accounts');
end $$;

-- Admins set a temporary password (bcrypt, the format Supabase Auth uses). Super Admin only for admin accounts.
create or replace function admin_reset_password(target uuid, temp_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare t profiles;
begin
  if not is_admin() then raise exception 'Only MyVoteHub admins can do this'; end if;
  if target = auth.uid() then raise exception 'Change your own password from your profile menu'; end if;
  if length(temp_password) < 8 then raise exception 'Temporary passwords need at least 8 characters'; end if;
  select * into t from profiles where id = target;
  if t.id is null then raise exception 'Account not found'; end if;
  if t.role = 'admin' and not is_super() then raise exception 'Only a Super Admin can reset an admin''s password'; end if;
  update auth.users set encrypted_password = crypt(temp_password, gen_salt('bf')), updated_at = now() where id = target;
  update profiles set must_change_password = true where id = target;
  update password_help set handled = true where email = lower(t.email) and not handled;
  perform audit('Password reset by admin', t.name || ' (' || t.email || ')', t.company_id);
end $$;

-- Called by the app after the user sets their own new password.
create or replace function password_changed() returns void
language sql security definer set search_path = public as $$
  update profiles set must_change_password = false where id = auth.uid();
$$;

grant execute on function request_password_help(text) to anon, authenticated;

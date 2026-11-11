-- Ruta X: acceso exclusivamente desde el servidor de Vercel.
begin;
create table public.rx_profiles (
 code text primary key check (code ~ '^[A-Z0-9_-]{1,40}$'),
 name text not null, zone text not null default '', role text not null default 'messenger' check(role in ('messenger','admin')),
 pin_hash text not null, active boolean not null default true,
 avatar text, theme text not null default 'system' check(theme in ('light','dark','system')),
 settings jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.rx_settings (id boolean primary key default true check(id), settings jsonb not null);
insert into public.rx_settings values(true, '{"requireRecipient":false,"allowNoPhoto":false,"promptWhatsApp":true,"requireSignature":true,"signatureColor":"#a3e635","geocodeCountry":""}');
create table public.rx_packages (
 id text not null, code text not null references public.rx_profiles(code),
 position integer not null default 0, status text not null default 'pending' check(status in ('pending','delivered','issue')),
 data jsonb not null, deleted_at timestamptz, created_at timestamptz not null default now(), primary key(code,id)
);
create index rx_packages_route on public.rx_packages(code,position) where deleted_at is null;
create table public.rx_events (
 id text not null, code text not null references public.rx_profiles(code), package_id text,
 timestamp bigint not null, data jsonb not null, deleted_at timestamptz, deleted_by text references public.rx_profiles(code), primary key(code,id)
);
create index rx_events_history on public.rx_events(code,timestamp desc) where deleted_at is null;
create index rx_events_date on public.rx_events(timestamp desc) where deleted_at is null;
create index rx_events_package on public.rx_events(code,package_id);
create table public.rx_sessions (token_hash text primary key, code text not null references public.rx_profiles(code), expires_at timestamptz not null);
create index rx_sessions_code on public.rx_sessions(code);
create index rx_sessions_expiry on public.rx_sessions(expires_at);
create table public.rx_login_limits (key text primary key, attempts integer not null default 0, until_at timestamptz not null);
create table public.rx_notices (id uuid primary key default gen_random_uuid(), title text not null, body text not null, level text not null check(level in ('urgent','info','friendly')), created_by text not null references public.rx_profiles(code), created_at timestamptz not null default now());
create table public.rx_notice_receipts (notice_id uuid not null references public.rx_notices(id) on delete cascade, code text not null references public.rx_profiles(code), read_at timestamptz, primary key(code,notice_id));
create index rx_notice_receipts_notice on public.rx_notice_receipts(notice_id);
create table public.rx_push (id uuid primary key default gen_random_uuid(), code text not null references public.rx_profiles(code), endpoint text unique not null, subscription jsonb not null, created_at timestamptz not null default now());
create index rx_push_code on public.rx_push(code);
-- PIN propio: Vercel valida sesión y propietario antes de cada acceso. Ninguna tabla está abierta a clientes.
do $$ declare t text; begin
 foreach t in array array['rx_profiles','rx_settings','rx_packages','rx_events','rx_sessions','rx_login_limits','rx_notices','rx_notice_receipts','rx_push'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create function public.rx_rate_limit(p_key text, p_max integer, p_seconds integer) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare n integer; begin
 insert into public.rx_login_limits(key,attempts,until_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set attempts=case when rx_login_limits.until_at < now() then 1 else rx_login_limits.attempts+1 end,
 until_at=case when rx_login_limits.until_at < now() then now()+make_interval(secs=>p_seconds) else rx_login_limits.until_at end returning attempts into n;
 return n <= p_max;
end $$;
create function public.rx_commit_event(p_code text,p_event jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare previous jsonb; begin
 perform 1 from public.rx_packages where code=p_code and id=p_event->>'packageId' and deleted_at is null for update;
 if not found then raise exception 'Paquete no disponible'; end if;
 select data into previous from public.rx_events where code=p_code and id=p_event->>'id';
 if found then return previous; end if;
 insert into public.rx_events(code,id,package_id,timestamp,data) values(p_code,p_event->>'id',p_event->>'packageId',(p_event->>'timestamp')::bigint,p_event);
 update public.rx_packages set status=p_event->>'status',data=data||jsonb_build_object('status',p_event->>'status','retry',false) where code=p_code and id=p_event->>'packageId';
 return p_event;
end $$;
create function public.rx_apply_settings(p_codes text[],p_patch jsonb,p_all boolean) returns void
language plpgsql security invoker set search_path = '' as $$ begin
 if p_all then update public.rx_settings set settings=settings||p_patch where id=true; end if;
 update public.rx_profiles set settings=settings||p_patch where role='messenger' and (p_all or code=any(p_codes));
end $$;
create function public.rx_delete_deliveries(p_keys jsonb,p_admin text) returns integer
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; n integer=0; begin
 for item in select * from jsonb_array_elements(p_keys) loop
 update public.rx_events set deleted_at=now(),deleted_by=p_admin where code=item->>'code' and id=item->>'id' and deleted_at is null;
 if found then n=n+1; end if;
 end loop;
 return n;
end $$;
create function public.rx_broadcast(p_admin text,p_title text,p_body text,p_level text) returns uuid
language plpgsql security invoker set search_path = '' as $$ declare n uuid; begin
 insert into public.rx_notices(title,body,level,created_by) values(p_title,p_body,p_level,p_admin) returning id into n;
 insert into public.rx_notice_receipts(notice_id,code) select n,code from public.rx_profiles where role='messenger' and active;
 return n;
end $$;
create function public.rx_undo(p_code text,p_id text,p_reason text) returns void
language plpgsql security invoker set search_path = '' as $$ declare e public.rx_events; begin
 select * into e from public.rx_events where code=p_code and id=p_id and deleted_at is null for update;
 if not found or e.data ? 'undoneAt' or (extract(epoch from now())*1000-e.timestamp)>3600000 then raise exception 'No se puede deshacer esta entrega'; end if;
 update public.rx_events set data=data||jsonb_build_object('undoneAt',extract(epoch from now())*1000,'undoReason',p_reason,'undoBy',p_code) where code=p_code and id=p_id;
 update public.rx_packages set status='pending',data=data||'{"status":"pending","retry":true}'::jsonb where code=p_code and id=e.package_id;
end $$;
revoke all on function public.rx_rate_limit(text,integer,integer), public.rx_commit_event(text,jsonb), public.rx_apply_settings(text[],jsonb,boolean), public.rx_delete_deliveries(jsonb,text), public.rx_broadcast(text,text,text,text), public.rx_undo(text,text,text) from public,anon,authenticated;
grant execute on function public.rx_rate_limit(text,integer,integer), public.rx_commit_event(text,jsonb), public.rx_apply_settings(text[],jsonb,boolean), public.rx_delete_deliveries(jsonb,text), public.rx_broadcast(text,text,text,text), public.rx_undo(text,text,text) to service_role;
commit;

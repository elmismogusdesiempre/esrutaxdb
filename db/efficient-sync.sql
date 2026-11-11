begin;
alter table public.rx_profiles add column data_version bigint not null default 1;
alter table public.rx_packages add column completed_at timestamptz;
create index rx_packages_completed on public.rx_packages(code,completed_at) where deleted_at is null;
create function public.rx_touch_profile() returns trigger
language plpgsql security invoker set search_path = '' as $$ begin
 if tg_op='DELETE' then update public.rx_profiles set data_version=data_version+1 where code=old.code; return old; end if;
 update public.rx_profiles set data_version=data_version+1 where code=new.code;
 return new;
end $$;
create function public.rx_version_profile() returns trigger
language plpgsql security invoker set search_path = '' as $$ begin
 new.data_version=old.data_version+1; return new;
end $$;
create function public.rx_package_completion() returns trigger
language plpgsql security invoker set search_path = '' as $$ begin
 if new.status='delivered' and (tg_op='INSERT' or old.status<>'delivered') then new.completed_at=now(); end if;
 if new.status<>'delivered' then new.completed_at=null; end if;
 return new;
end $$;
create trigger rx_profile_version before update on public.rx_profiles for each row execute function public.rx_version_profile();
create trigger rx_package_completed before insert or update on public.rx_packages for each row execute function public.rx_package_completion();
create trigger rx_package_version after insert or update or delete on public.rx_packages for each row execute function public.rx_touch_profile();
create trigger rx_event_version after insert or update or delete on public.rx_events for each row execute function public.rx_touch_profile();
revoke all on function public.rx_touch_profile(),public.rx_version_profile(),public.rx_package_completion() from public,anon,authenticated;
grant execute on function public.rx_touch_profile(),public.rx_version_profile(),public.rx_package_completion() to service_role;
commit;

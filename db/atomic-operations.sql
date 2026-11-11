begin;
create or replace function public.rx_commit_event(p_code text,p_event jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare previous jsonb; pkg_status text; begin
 select status into pkg_status from public.rx_packages where code=p_code and id=p_event->>'packageId' and deleted_at is null for update;
 if not found then raise exception 'Paquete no disponible'; end if;
 select data into previous from public.rx_events where code=p_code and id=p_event->>'id';
 if found then return previous; end if;
 if pkg_status='delivered' then raise exception 'Paquete ya entregado'; end if;
 insert into public.rx_events(code,id,package_id,timestamp,data) values(p_code,p_event->>'id',p_event->>'packageId',(p_event->>'timestamp')::bigint,p_event);
 update public.rx_packages set status=p_event->>'status',data=data||jsonb_build_object('status',p_event->>'status','retry',false) where code=p_code and id=p_event->>'packageId';
 return p_event;
end $$;
create or replace function public.rx_undo(p_code text,p_id text,p_reason text) returns void
language plpgsql security invoker set search_path = '' as $$ declare e public.rx_events; begin
 select * into e from public.rx_events where code=p_code and id=p_id and deleted_at is null for update;
 if not found or e.data ? 'undoneAt' or (extract(epoch from now())*1000-e.timestamp)>3600000 then raise exception 'No se puede deshacer esta entrega'; end if;
 perform 1 from public.rx_packages where code=p_code and id=e.package_id for update;
 if exists(select 1 from public.rx_events where code=p_code and package_id=e.package_id and deleted_at is null and timestamp>e.timestamp and not data ? 'undoneAt') then raise exception 'Existe un registro posterior'; end if;
 update public.rx_events set data=data||jsonb_build_object('undoneAt',extract(epoch from now())*1000,'undoReason',p_reason,'undoBy',p_code) where code=p_code and id=p_id;
 update public.rx_packages set status='pending',data=data||'{"status":"pending","retry":true}'::jsonb where code=p_code and id=e.package_id;
end $$;
create function public.rx_assign_route(p_code text,p_rows jsonb,p_replace boolean) returns integer
language plpgsql security invoker set search_path = '' as $$ declare item jsonb; n integer=0; start_order integer; begin
 perform 1 from public.rx_profiles where code=p_code and role='messenger' for update;
 if not found then raise exception 'Repartidor no disponible'; end if;
 if p_replace then update public.rx_packages set deleted_at=now() where code=p_code and status='pending' and deleted_at is null; end if;
 select coalesce(max(position),0) into start_order from public.rx_packages where code=p_code;
 for item in select * from jsonb_array_elements(p_rows) loop
 n=n+1;
 insert into public.rx_packages(code,id,position,data) values(p_code,item->>'id',start_order+n,item||jsonb_build_object('order',start_order+n));
 end loop;
 return n;
end $$;
revoke all on function public.rx_assign_route(text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.rx_assign_route(text,jsonb,boolean) to service_role;
commit;

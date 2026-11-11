begin;
alter table public.rx_packages add column location_version bigint not null default 0;
create function public.rx_edit_location(p_actor text,p_code text,p_id text,p_address text,p_pin jsonb,p_version bigint) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare pkg public.rx_packages; actor_role text; updated jsonb; begin
 select role into actor_role from public.rx_profiles where code=p_actor and active;
 if actor_role is null or (actor_role<>'admin' and (actor_role<>'messenger' or p_actor<>p_code)) then return '{"ok":false,"reason":"forbidden"}'; end if;
 if length(trim(p_address)) not between 1 and 500 then return '{"ok":false,"reason":"invalid"}';end if;
 if p_pin is not null and (jsonb_typeof(p_pin->'lat') is distinct from 'number' or jsonb_typeof(p_pin->'lng') is distinct from 'number' or abs((p_pin->>'lat')::numeric)>90 or abs((p_pin->>'lng')::numeric)>180) then return '{"ok":false,"reason":"invalid"}';end if;
 select * into pkg from public.rx_packages where code=p_code and id=p_id and deleted_at is null for update;
 if not found then return '{"ok":false,"reason":"missing"}';end if;
 if pkg.status='delivered' then return '{"ok":false,"reason":"delivered"}';end if;
 if p_version is distinct from pkg.location_version then return '{"ok":false,"reason":"conflict"}';end if;
 updated=(pkg.data-'lat'-'lng'-'locationSource')||jsonb_build_object('address',trim(p_address),'locationUpdatedBy',p_actor,'locationUpdatedAt',now());
 if p_pin is not null then updated=updated||jsonb_build_object('lat',p_pin->'lat','lng',p_pin->'lng')||'{"locationSource":"manual"}'::jsonb;end if;
 update public.rx_packages set data=updated,location_version=location_version+1 where code=p_code and id=p_id;
 return jsonb_build_object('ok',true,'package',updated||jsonb_build_object('id',p_id,'status',pkg.status,'locationVersion',pkg.location_version+1));
end $$;
create function public.rx_save_route_plan(p_actor text,p_items jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; pkg public.rx_packages; n integer; next_data jsonb; coordinates_changed boolean; begin
 if not exists(select 1 from public.rx_profiles where code=p_actor and active and role='messenger') then return '{"ok":false,"reason":"forbidden"}';end if;
 n=jsonb_array_length(p_items);if n not between 1 and 250 then return '{"ok":false,"reason":"invalid"}';end if;
 perform 1 from public.rx_packages where code=p_actor and deleted_at is null and status<>'delivered' order by id for update;
 if (select count(*) from public.rx_packages where code=p_actor and deleted_at is null and status<>'delivered')<>n then return '{"ok":false,"reason":"conflict"}';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_items) x)<>n then return '{"ok":false,"reason":"invalid"}';end if;
 for item in select * from jsonb_array_elements(p_items) loop
  select * into pkg from public.rx_packages where code=p_actor and id=item->>'id' and deleted_at is null and status<>'delivered';
  if not found or pkg.location_version is distinct from (item->>'locationVersion')::bigint then return '{"ok":false,"reason":"conflict"}';end if;
  if (item->>'order')::integer not between 1 and 1000000 then return '{"ok":false,"reason":"invalid"}';end if;
  if item ? 'lat' and (jsonb_typeof(item->'lat') is distinct from 'number' or jsonb_typeof(item->'lng') is distinct from 'number' or abs((item->>'lat')::numeric)>90 or abs((item->>'lng')::numeric)>180) then return '{"ok":false,"reason":"invalid"}';end if;
 end loop;
 for item in select * from jsonb_array_elements(p_items) loop
  select * into pkg from public.rx_packages where code=p_actor and id=item->>'id';
  next_data=pkg.data||jsonb_build_object('order',(item->>'order')::integer);coordinates_changed=false;
  if item ? 'lat' and coalesce(pkg.data->>'locationSource','')<>'manual' then
   coordinates_changed=(pkg.data->'lat' is distinct from item->'lat' or pkg.data->'lng' is distinct from item->'lng');
   next_data=next_data||jsonb_build_object('lat',(item->>'lat')::double precision,'lng',(item->>'lng')::double precision);
  end if;
  update public.rx_packages set position=(item->>'order')::integer,data=next_data,location_version=location_version+case when coordinates_changed then 1 else 0 end where code=p_actor and id=pkg.id;
 end loop;
 return '{"ok":true}';
end $$;
revoke all on function public.rx_edit_location(text,text,text,text,jsonb,bigint),public.rx_save_route_plan(text,jsonb) from public,anon,authenticated;
grant execute on function public.rx_edit_location(text,text,text,text,jsonb,bigint),public.rx_save_route_plan(text,jsonb) to service_role;
commit;

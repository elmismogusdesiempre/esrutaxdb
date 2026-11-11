-- Retira solo destinos todavía pendientes. No elimina evidencias ni registros de entrega.
begin;
create function public.rx_delete_pending(p_code text,p_ids text[],p_admin text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare removed_ids text[]; begin
 if not exists(select 1 from public.rx_profiles where code=p_admin and role='admin' and active) then raise exception 'Solo administración'; end if;
 if coalesce(cardinality(p_ids),0) not between 1 and 1000 then raise exception 'Selección inválida'; end if;
 with removed as (
  update public.rx_packages set deleted_at=now(),data=data||jsonb_build_object('deletedBy',p_admin)
  where code=p_code and id=any(p_ids) and status='pending' and deleted_at is null
  returning id
 ) select coalesce(array_agg(id),'{}'::text[]) into removed_ids from removed;
 return jsonb_build_object('deleted',to_jsonb(removed_ids),'skipped',to_jsonb(array(select distinct unnest(p_ids) except select unnest(removed_ids))));
end $$;
revoke all on function public.rx_delete_pending(text,text[],text) from public,anon,authenticated;
grant execute on function public.rx_delete_pending(text,text[],text) to service_role;
commit;

-- Complemento da 007: atribuição manual deixa o pedido em ASSIGNED.
-- O entregador deve poder aceitar esse pedido antes de iniciar a coleta.
-- Não altera contas nem pedidos existentes.
create or replace function app.guard_order_update()
returns trigger language plpgsql set search_path = public, app as $$
begin
  if current_user <> 'authenticated' or app.is_staff() then return new; end if;
  if not app.is_courier_user() or old.courier_id is distinct from app.current_courier_id() or
     (to_jsonb(new) - array['status','collected_at','delivered_at','cancelled_at','updated_at'])
     is distinct from
     (to_jsonb(old) - array['status','collected_at','delivered_at','cancelled_at','updated_at']) then
    raise exception 'Pedido: campos protegidos' using errcode = '42501';
  end if;
  if not (
       (old.status = 'ASSIGNED' and new.status = 'ACCEPTED') or
       (old.status = 'ACCEPTED' and new.status = 'PICKING_UP') or
       (old.status = 'PICKING_UP' and new.status = 'COLLECTED') or
       (old.status = 'COLLECTED' and new.status = 'IN_TRANSIT') or
       (old.status = 'IN_TRANSIT' and new.status in ('DELIVERED','FAILED'))
  ) then
    raise exception 'Transição de pedido inválida' using errcode = '42501';
  end if;
  if (new.collected_at is distinct from old.collected_at and new.status <> 'COLLECTED') or
     (new.delivered_at is distinct from old.delivered_at and new.status <> 'DELIVERED') or
     (new.cancelled_at is distinct from old.cancelled_at and new.status <> 'FAILED') then
    raise exception 'Data de etapa inválida' using errcode = '42501';
  end if;
  -- O banco registra a aceitação, evitando horários forjados pelo cliente.
  if new.status = 'ACCEPTED' then new.accepted_at := now(); end if;
  if new.status = 'COLLECTED' then new.collected_at := now(); end if;
  if new.status = 'DELIVERED' then new.delivered_at := now(); end if;
  if new.status = 'FAILED' then new.cancelled_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function app.guard_order_update() from public, anon, authenticated;

-- A disponibilidade ON_DELIVERY vem do trigger de pedidos. O cliente não
-- pode se marcar como disponível durante uma entrega em andamento.
create or replace function app.guard_courier_update()
returns trigger language plpgsql set search_path = public, app as $$
begin
  if current_user <> 'authenticated' or app.is_staff() then return new; end if;
  if not app.is_courier_user() or old.profile_id is distinct from auth.uid() or
     (to_jsonb(new) - array['phone','availability','location_sharing_enabled',
                            'current_latitude','current_longitude','current_location_at','updated_at'])
     is distinct from
     (to_jsonb(old) - array['phone','availability','location_sharing_enabled',
                            'current_latitude','current_longitude','current_location_at','updated_at']) then
    raise exception 'Entregador: campos protegidos' using errcode = '42501';
  end if;
  if new.availability not in ('AVAILABLE','OFFLINE') and
     new.availability is distinct from old.availability then
    raise exception 'Disponibilidade inválida' using errcode = '42501';
  end if;
  if old.availability = 'ON_DELIVERY' and new.availability is distinct from old.availability and
     exists (select 1 from public.orders where courier_id = old.id and
       status in ('ACCEPTED','PICKING_UP','COLLECTED','IN_TRANSIT')) then
    raise exception 'Entrega em andamento: disponibilidade protegida' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function app.guard_courier_update() from public, anon, authenticated;

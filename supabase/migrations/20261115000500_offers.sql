-- =====================================================================
-- D'Luca Connect — 05 · Aceite/recusa de oferta resolvidos no banco
-- =====================================================================
-- Motivo: a política RLS de `orders` impede que o entregador altere o pedido
-- antes de estar vinculado a ele. A resposta da oferta precisa ser atômica e
-- consistente, então é resolvida por trigger SECURITY DEFINER.

create or replace function app.trg_offer_response()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  -- Aceite: vincula o pedido ao entregador e encerra as outras ofertas
  if new.status = 'ACCEPTED' and (tg_op = 'INSERT' or old.status is distinct from 'ACCEPTED') then
    update public.orders
       set status = 'ACCEPTED',
           courier_id = new.courier_id,
           assigned_at = coalesce(assigned_at, now()),
           accepted_at = now()
     where id = new.order_id
       and status not in ('DELIVERED', 'CANCELLED', 'FAILED');

    update public.delivery_offers
       set status = 'CANCELLED', responded_at = now()
     where order_id = new.order_id
       and id <> new.id
       and status = 'PENDING';

    insert into public.order_events(order_id, status, event, description, actor_id)
    values (new.order_id, 'ACCEPTED', 'OFFER_ACCEPTED', 'Oferta aceita pelo entregador', null);

  -- Recusa, expiração ou cancelamento: devolve o pedido para a fila
  elsif tg_op = 'UPDATE'
        and new.status in ('DECLINED', 'EXPIRED', 'CANCELLED')
        and old.status is distinct from new.status then

    insert into public.order_events(order_id, event, description, actor_id)
    values (new.order_id, 'OFFER_' || new.status::text,
            'Oferta ' || lower(new.status::text) || ' pelo entregador', null);

    if not exists (
      select 1 from public.delivery_offers
       where order_id = new.order_id and status = 'PENDING'
    ) then
      update public.orders
         set status = 'PENDING'
       where id = new.order_id
         and status = 'OFFERED';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists offer_response on public.delivery_offers;
create trigger offer_response
after insert or update of status on public.delivery_offers
for each row execute function app.trg_offer_response();

-- Endurece a política: entregador só altera o próprio pedido já vinculado,
-- e não pode trocar o pedido de dono nem mudar a farmácia.
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update using (
  app.is_staff()
  or (app.is_pharmacy_user() and pharmacy_id = app.current_pharmacy_id() and status in ('DRAFT', 'PENDING', 'CANCELLED'))
  or (courier_id = app.current_courier_id())
) with check (
  app.is_staff()
  or (app.is_pharmacy_user() and pharmacy_id = app.current_pharmacy_id())
  or (courier_id = app.current_courier_id())
);

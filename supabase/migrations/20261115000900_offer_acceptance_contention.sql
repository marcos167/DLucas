-- Complemento da 007: dois aceites simultâneos do mesmo pedido não devem
-- entrar em deadlock (cada UPDATE já bloqueou a sua própria oferta antes do
-- trigger tentar cancelar as demais). Apenas um obtém o lock não bloqueante;
-- o outro faz rollback, libera sua oferta e recebe um erro de conflito.
-- Aplicar com 007 e 008 antes de publicar o novo frontend.
create or replace function app.trg_offer_response()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_rows integer;
begin
  if tg_op = 'UPDATE' and new.status = 'ACCEPTED' and old.status = 'PENDING' then
    if not pg_try_advisory_xact_lock(hashtextextended(new.order_id::text, 0)) then
      raise exception 'Pedido em processamento: tente novamente'
        using errcode = 'P0001';
    end if;
    update public.orders
       set status = 'ACCEPTED', courier_id = new.courier_id,
           assigned_at = coalesce(assigned_at, now()), accepted_at = now()
     where id = new.order_id and status in ('PENDING','OFFERED') and courier_id is null;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'Pedido indisponível para aceite' using errcode = '42501';
    end if;
    update public.delivery_offers set status = 'CANCELLED', responded_at = now()
     where order_id = new.order_id and id <> new.id and status = 'PENDING';
    insert into public.order_events(order_id, status, event, description, actor_id)
    values (new.order_id, 'ACCEPTED', 'OFFER_ACCEPTED', 'Oferta aceita pelo entregador', auth.uid());
  elsif tg_op = 'UPDATE' and old.status = 'PENDING' and
        new.status in ('DECLINED','EXPIRED','CANCELLED') then
    insert into public.order_events(order_id, event, description, actor_id)
    values (new.order_id, 'OFFER_' || new.status::text,
            'Oferta ' || lower(new.status::text) || ' pelo entregador', auth.uid());
    if not exists (select 1 from public.delivery_offers
                    where order_id = new.order_id and status = 'PENDING') then
      update public.orders set status = 'PENDING'
       where id = new.order_id and status = 'OFFERED';
    end if;
  end if;
  return new;
end $$;
revoke execute on function app.trg_offer_response() from public, anon, authenticated;

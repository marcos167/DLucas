-- =====================================================================
-- D'Luca Connect · endurecimento de autorização (sem tocar em contas/dados)
-- Executar após 00100–00600. Aplicação é idempotente para políticas/triggers.
-- =====================================================================

-- Uma conta inativa não herda privilégios enquanto o JWT ainda não expirou.
-- Os helpers são SECURITY DEFINER para consultar profiles sem recursão de RLS.
create or replace function app.current_role()
returns public.user_role language sql stable security definer set search_path = public, app as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;
create or replace function app.current_pharmacy_id()
returns uuid language sql stable security definer set search_path = public, app as $$
  select pharmacy_id from public.profiles where id = auth.uid() and is_active = true;
$$;
create or replace function app.current_courier_id()
returns uuid language sql stable security definer set search_path = public, app as $$
  select c.id from public.couriers c join public.profiles p on p.id = c.profile_id
  where p.id = auth.uid() and p.is_active = true and c.status = 'ACTIVE';
$$;
create or replace function app.is_staff()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select is_active and role in ('SUPER_ADMIN','ADMIN','DISPATCHER','FINANCE')
                   from public.profiles where id = auth.uid()), false);
$$;
create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select is_active and role in ('SUPER_ADMIN','ADMIN')
                   from public.profiles where id = auth.uid()), false);
$$;
create or replace function app.is_super_admin()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select is_active and role = 'SUPER_ADMIN'
                   from public.profiles where id = auth.uid()), false);
$$;
create or replace function app.is_finance()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select is_active and role in ('SUPER_ADMIN','ADMIN','FINANCE')
                   from public.profiles where id = auth.uid()), false);
$$;
create or replace function app.is_pharmacy_user()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select is_active and role in ('PHARMACY_ADMIN','PHARMACY_STAFF')
                   from public.profiles where id = auth.uid()), false);
$$;
create or replace function app.is_courier_user()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select is_active and role = 'COURIER'
                   from public.profiles where id = auth.uid()), false);
$$;

-- Não confiar em raw_user_meta_data para papel/vínculo: mesmo que um dia o
-- signup seja ativado, um usuário novo nasce SEM privilégios e sem farmácia.
-- O fluxo admin-users (service role) atribui esses campos após criar a conta.
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  insert into public.profiles (id, email, full_name, phone, role, pharmacy_id)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
          new.raw_user_meta_data->>'phone', 'PHARMACY_STAFF', null)
  on conflict (id) do nothing;
  return new;
end $$;

-- A confirmação de troca da senha temporária é um evento do Auth (não uma
-- flag que o navegador pode alterar arbitrariamente por REST). O admin-users
-- redefine a flag para TRUE depois de atualizar a senha administrativamente.
create or replace function app.clear_password_change_requirement()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles set must_change_password = false where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists clear_password_change_requirement on auth.users;
create trigger clear_password_change_requirement
  after update of encrypted_password on auth.users
  for each row execute function app.clear_password_change_requirement();

-- Proteção por coluna com OLD/NEW: RLS decide QUAL linha, o trigger decide O
-- QUE pode mudar. `current_user=postgres` só ocorre em caminhos privilegiados
-- como service role/SECURITY DEFINER; clientes REST são `authenticated`.
create or replace function app.guard_profile_update()
returns trigger language plpgsql set search_path = public, app as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if not app.is_admin() then
    if old.id <> auth.uid() or not old.is_active or
       (to_jsonb(new) - array['full_name','phone','avatar_url','last_seen_at','updated_at'])
       is distinct from
       (to_jsonb(old) - array['full_name','phone','avatar_url','last_seen_at','updated_at']) then
      raise exception 'Perfil: campos protegidos' using errcode = '42501';
    end if;
  else
    -- As políticas permissivas se somam com OR: a checagem precisa ser
    -- independente da policy de UPDATE self, inclusive para outro usuário.
    if not app.is_super_admin() and
       (old.role = 'SUPER_ADMIN' or new.role = 'SUPER_ADMIN') then
      raise exception 'Somente SUPER_ADMIN gerencia SUPER_ADMIN' using errcode = '42501';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Alterações de e-mail exigem o fluxo Auth' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update before update on public.profiles
  for each row execute function app.guard_profile_update();

-- A policy antiga FOR ALL permitia também DELETE e INSERT de SUPER_ADMIN.
-- A interface administra perfis por UPDATE; criação autorizada permanece
-- possível somente para papéis abaixo de SUPER_ADMIN (ou por SUPER_ADMIN).
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for update to authenticated
  using (app.is_admin()) with check (app.is_admin());
drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles for insert to authenticated
  with check (app.is_admin() and (role <> 'SUPER_ADMIN' or app.is_super_admin()));
revoke delete on public.profiles from authenticated;

-- Um entregador edita apenas dados operacionais próprios. Aprovação, CNH,
-- vínculo com profile, notas administrativas e status só via equipe.
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
  return new;
end $$;
drop trigger if exists guard_courier_update on public.couriers;
create trigger guard_courier_update before update on public.couriers
  for each row execute function app.guard_courier_update();

-- Na criação pela farmácia, preço e repasse vêm do contrato no BANCO, não do
-- corpo da requisição. Distância usa coordenadas da unidade quando disponíveis;
-- coordenada de destino vem do cliente e continua sendo uma estimativa sujeita
-- a conferência operacional (sem serviço de geocodificação confiável aqui).
create or replace function app.guard_order_insert()
returns trigger language plpgsql set search_path = public, app as $$
declare
  v_unit public.pharmacy_units%rowtype;
  v_contract public.contracts%rowtype;
  v_km numeric;
  v_h double precision;
begin
  if current_user <> 'authenticated' or app.is_staff() then return new; end if;
  if not app.is_pharmacy_user() or new.pharmacy_id is distinct from app.current_pharmacy_id() or
     new.status not in ('DRAFT','PENDING') or new.courier_id is not null then
    raise exception 'Criação de pedido não permitida' using errcode = '42501';
  end if;
  select * into v_unit from public.pharmacy_units
   where id = new.unit_id and pharmacy_id = new.pharmacy_id and is_active = true;
  if not found then
    raise exception 'Unidade de coleta inválida' using errcode = '42501';
  end if;
  -- A origem deve ser sempre a unidade cadastrada, não um endereço/posição
  -- arbitrários enviados pelo navegador. Sem posição na unidade, sem adicional
  -- por distância até que a operação confirme uma origem geocodificada.
  new.pickup_zip_code := v_unit.zip_code;
  new.pickup_street := v_unit.street;
  new.pickup_number := v_unit.number;
  new.pickup_complement := v_unit.complement;
  new.pickup_district := v_unit.district;
  new.pickup_city := v_unit.city;
  new.pickup_state := v_unit.state;
  new.pickup_latitude := v_unit.latitude;
  new.pickup_longitude := v_unit.longitude;
  new.code := null; -- set_order_code gera código único
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  new.assigned_at := null;
  new.accepted_at := null;
  new.collected_at := null;
  new.delivered_at := null;
  new.cancelled_at := null;
  new.cancel_reason := null;
  new.dispatch_notes := null;

  if (new.pickup_latitude is not null and new.pickup_longitude is not null and
      new.delivery_latitude is not null and new.delivery_longitude is not null) then
    if abs(new.pickup_latitude) > 90 or abs(new.delivery_latitude) > 90 or
       abs(new.pickup_longitude) > 180 or abs(new.delivery_longitude) > 180 then
      raise exception 'Coordenadas inválidas' using errcode = '22023';
    end if;
    v_h := power(sin(radians(new.delivery_latitude - new.pickup_latitude) / 2), 2)
           + cos(radians(new.pickup_latitude)) * cos(radians(new.delivery_latitude))
           * power(sin(radians(new.delivery_longitude - new.pickup_longitude) / 2), 2);
    v_km := round((2 * 6371 * asin(sqrt(least(1, greatest(0, v_h)))))::numeric, 2);
  else
    v_km := null;
  end if;
  new.estimated_distance_km := v_km;

  if new.contract_id is null then
    if exists (select 1 from public.contracts where pharmacy_id = new.pharmacy_id and status = 'ACTIVE') then
      raise exception 'Contrato ativo obrigatório' using errcode = '42501';
    end if;
    new.quoted_price_cents := 0;
    new.courier_payout_cents := 0;
  else
    select * into v_contract from public.contracts
     where id = new.contract_id and pharmacy_id = new.pharmacy_id and status = 'ACTIVE';
    if not found then
      raise exception 'Contrato inválido para a farmácia' using errcode = '42501';
    end if;
    new.quoted_price_cents := v_contract.base_price_cents
      + case when v_km is not null then
          round(greatest(v_km - v_contract.included_km, 0) * v_contract.price_per_extra_km_cents)::integer
        else 0 end
      + case new.priority when 'URGENT' then v_contract.urgency_fee_cents
          when 'HIGH' then round(v_contract.urgency_fee_cents::numeric / 2)::integer else 0 end
      + case when new.is_temperature_controlled then v_contract.temperature_fee_cents else 0 end;
    new.courier_payout_cents := v_contract.courier_payout_cents;
  end if;
  return new;
end $$;
drop trigger if exists guard_order_insert on public.orders;
create trigger guard_order_insert before insert on public.orders
  for each row execute function app.guard_order_insert();

-- Farmácias não editam pedidos diretamente (a UI atual apenas cria); o
-- entregador só avança o fluxo na ordem certa e nunca muda preço/destino.
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update to authenticated
using (app.is_staff() or (app.is_courier_user() and courier_id = app.current_courier_id()))
with check (app.is_staff() or (app.is_courier_user() and courier_id = app.current_courier_id()));

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
  -- Horários são escritos pelo servidor, não pelo relógio do navegador.
  if new.status = 'COLLECTED' then new.collected_at := now(); end if;
  if new.status = 'DELIVERED' then new.delivered_at := now(); end if;
  if new.status = 'FAILED' then new.cancelled_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_order_update on public.orders;
create trigger guard_order_update before update on public.orders
  for each row execute function app.guard_order_update();

-- A oferta pertence sempre ao mesmo pedido/entregador; o servidor é o único
-- que cancela outras ofertas ao atribuir. O entregador só responde à própria
-- oferta ainda válida, uma única vez.
create or replace function app.guard_offer_write()
returns trigger language plpgsql set search_path = public, app as $$
declare v_order_status public.order_status;
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    if not app.is_staff() or new.status <> 'PENDING' or
       new.expires_at is null or new.expires_at <= now() or
       not exists (select 1 from public.couriers c join public.profiles p on p.id = c.profile_id
                   where c.id = new.courier_id and c.status = 'ACTIVE' and p.is_active = true) then
      raise exception 'Oferta inicial inválida' using errcode = '42501';
    end if;
    select status into v_order_status from public.orders where id = new.order_id for update;
    if v_order_status not in ('PENDING','OFFERED') or v_order_status is null then
      raise exception 'Pedido indisponível para oferta' using errcode = '42501';
    end if;
  else
    if new.order_id is distinct from old.order_id or
       new.courier_id is distinct from old.courier_id or
       (to_jsonb(new) - array['status','responded_at']) is distinct from
       (to_jsonb(old) - array['status','responded_at']) then
      raise exception 'Oferta: campos protegidos' using errcode = '42501';
    end if;
    if old.status <> 'PENDING' then
      raise exception 'Oferta já respondida' using errcode = '42501';
    end if;
    if app.is_staff() then
      if new.status not in ('CANCELLED','EXPIRED') then
        raise exception 'Resposta reservada ao entregador' using errcode = '42501';
      end if;
    elsif not app.is_courier_user() or old.courier_id is distinct from app.current_courier_id() or
          new.status not in ('ACCEPTED','DECLINED') or old.expires_at is null or
          old.expires_at <= now() then
      raise exception 'Oferta inválida ou expirada' using errcode = '42501';
    end if;
    new.responded_at := now();
  end if;
  return new;
end $$;
drop trigger if exists guard_offer_write on public.delivery_offers;
create trigger guard_offer_write before insert or update on public.delivery_offers
  for each row execute function app.guard_offer_write();

create or replace function app.trg_offer_response()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_rows integer;
begin
  if tg_op = 'UPDATE' and new.status = 'ACCEPTED' and old.status = 'PENDING' then
    -- A atualização bloqueia a linha do pedido. Duas aceitações concorrentes
    -- não podem se declarar vencedoras: só uma encontrará PENDING/OFFERED.
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

-- Sempre retirar execução direta das funções trigger do esquema app.
revoke execute on function app.guard_profile_update() from public, anon, authenticated;
revoke execute on function app.guard_courier_update() from public, anon, authenticated;
revoke execute on function app.guard_order_insert() from public, anon, authenticated;
revoke execute on function app.guard_order_update() from public, anon, authenticated;
revoke execute on function app.guard_offer_write() from public, anon, authenticated;
revoke execute on function app.trg_offer_response() from public, anon, authenticated;
revoke execute on function app.clear_password_change_requirement() from public, anon, authenticated;
revoke execute on function app.handle_new_user() from public, anon, authenticated;

-- Checkout demo Wompi Sandbox para Radar Pro.
-- Los secretos y la firma viven en el servidor; esta tabla no es legible desde
-- clientes anon/authenticated. El RPC serializa e idempotiza los webhooks.

create table if not exists public.radar_payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    check (reference ~ '^RADAR-[A-Z0-9]{24,64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'wompi' check (provider = 'wompi'),
  environment text not null default 'test' check (environment = 'test'),
  amount_in_cents integer not null check (amount_in_cents > 0),
  currency char(3) not null default 'COP' check (currency = 'COP'),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'VOIDED')),
  transaction_id text check (transaction_id is null or length(transaction_id) <= 200),
  payment_method_type text check (payment_method_type is null or length(payment_method_type) <= 80),
  event_timestamp bigint,
  last_event_checksum text
    check (last_event_checksum is null or last_event_checksum ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  valid_until timestamptz,
  check (valid_until is null or paid_at is null or valid_until >= paid_at)
);

create unique index if not exists radar_payments_transaction_unique
  on public.radar_payments (transaction_id)
  where transaction_id is not null;
create index if not exists radar_payments_user_created_idx
  on public.radar_payments (user_id, created_at desc);
create index if not exists radar_payments_status_updated_idx
  on public.radar_payments (status, updated_at desc);

alter table public.radar_payments enable row level security;
revoke all on table public.radar_payments from public, anon, authenticated;
grant all on table public.radar_payments to service_role;

create or replace function public.apply_wompi_payment_event(
  p_reference text,
  p_transaction_id text,
  p_status text,
  p_payment_method_type text,
  p_amount_in_cents integer,
  p_currency text,
  p_event_timestamp bigint,
  p_checksum text,
  p_access_days integer default 30
)
returns table (
  id uuid,
  reference text,
  user_id uuid,
  status text,
  amount_in_cents integer,
  currency char(3),
  transaction_id text,
  payment_method_type text,
  event_timestamp bigint,
  created_at timestamptz,
  updated_at timestamptz,
  paid_at timestamptz,
  valid_until timestamptz,
  applied boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.radar_payments%rowtype;
  v_next_status text;
  v_event_at timestamptz;
  v_applied boolean := false;
begin
  if p_status not in ('PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'VOIDED') then
    raise exception 'Estado Wompi inválido';
  end if;
  if p_access_days < 1 or p_access_days > 366 then
    raise exception 'Vigencia inválida';
  end if;
  if p_event_timestamp < 0 then
    raise exception 'Timestamp inválido';
  end if;

  select *
    into v_payment
    from public.radar_payments rp
   where rp.reference = p_reference
   for update;
  if not found then
    raise exception 'Referencia de pago desconocida';
  end if;
  if v_payment.amount_in_cents <> p_amount_in_cents or v_payment.currency <> p_currency then
    raise exception 'Monto o moneda no coinciden';
  end if;
  if exists (
    select 1 from public.radar_payments rp
     where rp.transaction_id = p_transaction_id
       and rp.id <> v_payment.id
  ) then
    raise exception 'Transacción ya asociada a otra referencia';
  end if;

  if v_payment.last_event_checksum = p_checksum then
    return query select
      v_payment.id, v_payment.reference, v_payment.user_id, v_payment.status,
      v_payment.amount_in_cents, v_payment.currency, v_payment.transaction_id,
      v_payment.payment_method_type, v_payment.event_timestamp, v_payment.created_at,
      v_payment.updated_at, v_payment.paid_at, v_payment.valid_until, false;
    return;
  end if;
  if v_payment.event_timestamp is not null and p_event_timestamp < v_payment.event_timestamp then
    return query select
      v_payment.id, v_payment.reference, v_payment.user_id, v_payment.status,
      v_payment.amount_in_cents, v_payment.currency, v_payment.transaction_id,
      v_payment.payment_method_type, v_payment.event_timestamp, v_payment.created_at,
      v_payment.updated_at, v_payment.paid_at, v_payment.valid_until, false;
    return;
  end if;

  v_event_at := to_timestamp(p_event_timestamp::numeric / 1000);
  v_next_status := case
    when v_payment.status = 'VOIDED' then 'VOIDED'
    when v_payment.status = 'APPROVED' and p_status <> 'VOIDED' then 'APPROVED'
    else p_status
  end;

  update public.radar_payments rp
     set status = v_next_status,
         transaction_id = coalesce(rp.transaction_id, p_transaction_id),
         payment_method_type = coalesce(p_payment_method_type, rp.payment_method_type),
         event_timestamp = greatest(coalesce(rp.event_timestamp, 0), p_event_timestamp),
         last_event_checksum = p_checksum,
         updated_at = now(),
         paid_at = case
           when v_next_status = 'APPROVED' then coalesce(rp.paid_at, v_event_at)
           else rp.paid_at
         end,
         valid_until = case
           when v_next_status = 'APPROVED'
             then coalesce(rp.valid_until, v_event_at + make_interval(days => p_access_days))
           else rp.valid_until
         end
   where rp.id = v_payment.id
   returning * into v_payment;
  v_applied := true;

  return query select
    v_payment.id, v_payment.reference, v_payment.user_id, v_payment.status,
    v_payment.amount_in_cents, v_payment.currency, v_payment.transaction_id,
    v_payment.payment_method_type, v_payment.event_timestamp, v_payment.created_at,
    v_payment.updated_at, v_payment.paid_at, v_payment.valid_until, v_applied;
end;
$$;

revoke all on function public.apply_wompi_payment_event(
  text, text, text, text, integer, text, bigint, text, integer
) from public, anon, authenticated;
grant execute on function public.apply_wompi_payment_event(
  text, text, text, text, integer, text, bigint, text, integer
) to service_role;

comment on table public.radar_payments is
  'Intentos y conciliación de pagos Radar Pro en Wompi Sandbox; acceso exclusivo del backend.';

-- Radar · esquema public restaurado desde el volcado del 17-10-2026
-- Generado a partir de db_cluster-17-10-2026@22-35-17.backup.gz
--
-- La extension vector se instalo en el esquema public (no en extensions), y
-- documents.embedding / memories.embedding son vector(1536). Un proyecto nuevo
-- de Supabase NO trae vector activado, asi que va primero o fallan las tablas.
create extension if not exists vector with schema public;

set statement_timeout = 0;
set lock_timeout = 0;
set client_min_messages = warning;


-- ═══════════ SEQUENCE ═══════════

-- document_rows_id_seq
CREATE SEQUENCE public.document_rows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.document_rows_id_seq OWNER TO postgres;

-- documents_id_seq
CREATE SEQUENCE public.documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.documents_id_seq OWNER TO postgres;

-- memories_id_seq
CREATE SEQUENCE public.memories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.memories_id_seq OWNER TO postgres;

-- n8n_chat_histories_id_seq
CREATE SEQUENCE public.n8n_chat_histories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.n8n_chat_histories_id_seq OWNER TO postgres;

-- scraping_logs_id_seq
CREATE SEQUENCE public.scraping_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.scraping_logs_id_seq OWNER TO postgres;


-- ═══════════ TABLE ═══════════

-- document_metadata
CREATE TABLE public.document_metadata (
    id text NOT NULL,
    title text,
    url text,
    created_at timestamp without time zone DEFAULT now(),
    schema text
);
ALTER TABLE public.document_metadata OWNER TO postgres;

-- document_rows
CREATE TABLE public.document_rows (
    id integer NOT NULL,
    dataset_id text,
    row_data jsonb
);
ALTER TABLE public.document_rows OWNER TO postgres;

-- documents
CREATE TABLE public.documents (
    id bigint NOT NULL,
    content text,
    metadata jsonb,
    embedding public.vector(1536)
);
ALTER TABLE public.documents OWNER TO postgres;

-- inmuebles
CREATE TABLE public.inmuebles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) NOT NULL,
    city text NOT NULL,
    zone text,
    address text,
    type text,
    price numeric,
    currency character(3) DEFAULT 'COP'::bpchar NOT NULL,
    area_m2 numeric,
    price_per_m2 numeric GENERATED ALWAYS AS (
CASE
    WHEN ((area_m2 IS NOT NULL) AND (area_m2 > (0)::numeric)) THEN (price / area_m2)
    ELSE NULL::numeric
END) STORED,
    features jsonb DEFAULT '{}'::jsonb,
    source text NOT NULL,
    source_id text NOT NULL,
    source_url text NOT NULL,
    image_url text,
    is_opportunity boolean DEFAULT false NOT NULL,
    discount_pct numeric,
    scraped_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    times_missed integer DEFAULT 0 NOT NULL,
    deactivated_at timestamp with time zone,
    is_high boolean DEFAULT false NOT NULL,
    crece_index numeric,
    crece_tier text,
    cascada_nivel text,
    fecha_publicacion_fuente timestamp with time zone,
    estado text DEFAULT 'activo'::text NOT NULL
);
ALTER TABLE public.inmuebles OWNER TO postgres;

-- memories
CREATE TABLE public.memories (
    id bigint NOT NULL,
    content text,
    metadata jsonb,
    embedding public.vector(1536)
);
ALTER TABLE public.memories OWNER TO postgres;

-- n8n_chat_histories
CREATE TABLE public.n8n_chat_histories (
    id integer NOT NULL,
    session_id character varying(255) NOT NULL,
    message jsonb NOT NULL
);
ALTER TABLE public.n8n_chat_histories OWNER TO postgres;

-- oportunidades_historial
CREATE TABLE public.oportunidades_historial (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) DEFAULT 'CO'::bpchar NOT NULL,
    entidad text NOT NULL,
    entidad_id uuid NOT NULL,
    source text,
    source_id text,
    evento text NOT NULL,
    precio_antes numeric,
    precio_despues numeric,
    detalle text,
    ocurrio_en timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.oportunidades_historial OWNER TO postgres;

-- precios_mercado
CREATE TABLE public.precios_mercado (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) NOT NULL,
    city text NOT NULL,
    zone text,
    type text,
    price numeric NOT NULL,
    currency character(3) DEFAULT 'COP'::bpchar NOT NULL,
    area_m2 numeric,
    price_per_m2 numeric GENERATED ALWAYS AS (
CASE
    WHEN ((area_m2 IS NOT NULL) AND (area_m2 > (0)::numeric)) THEN (price / area_m2)
    ELSE NULL::numeric
END) STORED,
    source text DEFAULT 'fincaraiz'::text NOT NULL,
    source_url text,
    scraped_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.precios_mercado OWNER TO postgres;

-- price_history
CREATE TABLE public.price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inmueble_id uuid NOT NULL,
    price numeric NOT NULL,
    currency character(3) DEFAULT 'COP'::bpchar NOT NULL,
    area_m2 numeric,
    price_per_m2 numeric GENERATED ALWAYS AS (
CASE
    WHEN ((area_m2 IS NOT NULL) AND (area_m2 > (0)::numeric)) THEN (price / area_m2)
    ELSE NULL::numeric
END) STORED,
    source text,
    change_kind text NOT NULL,
    prev_price numeric,
    delta_pct numeric,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT price_history_change_kind_check CHECK ((change_kind = ANY (ARRAY['initial'::text, 'increase'::text, 'decrease'::text])))
);
ALTER TABLE public.price_history OWNER TO postgres;

-- radar_cron_jobs
CREATE TABLE public.radar_cron_jobs (
    nombre text NOT NULL,
    cadencia_dias integer NOT NULL,
    habilitado boolean DEFAULT true NOT NULL,
    ultima_corrida timestamp with time zone,
    ultimo_estado text,
    ultimo_detalle text,
    corriendo_desde timestamp with time zone,
    duracion_seg integer,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.radar_cron_jobs OWNER TO postgres;

-- radar_parametros_gastos
CREATE TABLE public.radar_parametros_gastos (
    id text DEFAULT 'vigente'::text NOT NULL,
    notaria numeric(7,6) NOT NULL,
    impuesto_registro numeric(7,6) NOT NULL,
    derechos_registro numeric(7,6) NOT NULL,
    nota text,
    actualizado_por uuid,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT radar_parametros_gastos_derechos_registro_check CHECK (((derechos_registro >= (0)::numeric) AND (derechos_registro <= 0.05))),
    CONSTRAINT radar_parametros_gastos_id_check CHECK ((id = 'vigente'::text)),
    CONSTRAINT radar_parametros_gastos_impuesto_registro_check CHECK (((impuesto_registro >= (0)::numeric) AND (impuesto_registro <= 0.05))),
    CONSTRAINT radar_parametros_gastos_notaria_check CHECK (((notaria >= (0)::numeric) AND (notaria <= 0.05))),
    CONSTRAINT radar_parametros_gastos_total_razonable CHECK ((((notaria + impuesto_registro) + derechos_registro) <= 0.10))
);
ALTER TABLE public.radar_parametros_gastos OWNER TO postgres;

-- radar_payments
CREATE TABLE public.radar_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference text NOT NULL,
    user_id uuid NOT NULL,
    provider text DEFAULT 'wompi'::text NOT NULL,
    environment text DEFAULT 'test'::text NOT NULL,
    amount_in_cents integer NOT NULL,
    currency character(3) DEFAULT 'COP'::bpchar NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    transaction_id text,
    payment_method_type text,
    event_timestamp bigint,
    last_event_checksum text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    valid_until timestamp with time zone,
    CONSTRAINT radar_payments_amount_in_cents_check CHECK ((amount_in_cents > 0)),
    CONSTRAINT radar_payments_check CHECK (((valid_until IS NULL) OR (paid_at IS NULL) OR (valid_until >= paid_at))),
    CONSTRAINT radar_payments_currency_check CHECK ((currency = 'COP'::bpchar)),
    CONSTRAINT radar_payments_environment_check CHECK ((environment = 'test'::text)),
    CONSTRAINT radar_payments_last_event_checksum_check CHECK (((last_event_checksum IS NULL) OR (last_event_checksum ~ '^[a-f0-9]{64}$'::text))),
    CONSTRAINT radar_payments_payment_method_type_check CHECK (((payment_method_type IS NULL) OR (length(payment_method_type) <= 80))),
    CONSTRAINT radar_payments_provider_check CHECK ((provider = 'wompi'::text)),
    CONSTRAINT radar_payments_reference_check CHECK ((reference ~ '^RADAR-[A-Z0-9]{24,64}$'::text)),
    CONSTRAINT radar_payments_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'DECLINED'::text, 'ERROR'::text, 'VOIDED'::text]))),
    CONSTRAINT radar_payments_transaction_id_check CHECK (((transaction_id IS NULL) OR (length(transaction_id) <= 200)))
);
ALTER TABLE public.radar_payments OWNER TO postgres;

-- radar_sesiones_scraper
CREATE TABLE public.radar_sesiones_scraper (
    nombre text NOT NULL,
    storage_state jsonb NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    nota text
);
ALTER TABLE public.radar_sesiones_scraper OWNER TO postgres;

-- radar_zonas_monitoreadas
CREATE TABLE public.radar_zonas_monitoreadas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) DEFAULT 'CO'::bpchar NOT NULL,
    city text NOT NULL,
    portal text DEFAULT 'fincaraiz'::text NOT NULL,
    operation text DEFAULT 'venta'::text NOT NULL,
    property_type text DEFAULT 'apartamentos'::text NOT NULL,
    neighborhood_slug text,
    city_slug text NOT NULL,
    dept_slug text NOT NULL,
    location_id text,
    price_min numeric,
    price_max numeric,
    area_min numeric,
    area_max numeric,
    stratum_min integer,
    stratum_max integer,
    bedrooms_min integer,
    max_pages integer DEFAULT 25 NOT NULL,
    min_comparables integer DEFAULT 8 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nivel integer,
    fecha_ultima_revision date
);
ALTER TABLE public.radar_zonas_monitoreadas OWNER TO postgres;

-- remates
CREATE TABLE public.remates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) DEFAULT 'CO'::bpchar NOT NULL,
    source text DEFAULT 'rematandobienes'::text NOT NULL,
    source_id text NOT NULL,
    source_url text NOT NULL,
    department text,
    city text NOT NULL,
    address text,
    property_type text,
    property_type_raw text,
    matricula_inmobiliaria text,
    description text,
    court text,
    court_email text,
    court_address text,
    case_number text,
    plaintiff text,
    defendant text,
    trustee text,
    auction_date date,
    auction_date_raw text,
    auction_time text,
    auction_mode text,
    appraisal_value numeric,
    appraisal_value_raw text,
    minimum_bid numeric,
    minimum_bid_raw text,
    minimum_bid_pct numeric,
    deposit_pct numeric,
    currency character(3) DEFAULT 'COP'::bpchar NOT NULL,
    image_url text,
    features jsonb DEFAULT '{}'::jsonb NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    scraped_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    times_missed integer DEFAULT 0 NOT NULL,
    deactivated_at timestamp with time zone,
    crece_index numeric,
    crece_tier text,
    cascada_nivel text,
    origen_demandante text,
    tipo_proceso text,
    cuota_parte numeric DEFAULT 100 NOT NULL,
    estado text DEFAULT 'activo'::text NOT NULL
);
ALTER TABLE public.remates OWNER TO postgres;

-- rental_listings
CREATE TABLE public.rental_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) NOT NULL,
    city text NOT NULL,
    zone text,
    address text,
    type text,
    monthly_rent numeric NOT NULL,
    currency character(3) DEFAULT 'COP'::bpchar NOT NULL,
    area_m2 numeric,
    monthly_rent_per_m2 numeric GENERATED ALWAYS AS (
CASE
    WHEN ((area_m2 IS NOT NULL) AND (area_m2 > (0)::numeric)) THEN (monthly_rent / area_m2)
    ELSE NULL::numeric
END) STORED,
    features jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text NOT NULL,
    source_id text NOT NULL,
    source_url text NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    times_missed integer DEFAULT 0 NOT NULL,
    deactivated_at timestamp with time zone,
    scraped_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rental_listings_monthly_rent_check CHECK ((monthly_rent > (0)::numeric))
);
ALTER TABLE public.rental_listings OWNER TO postgres;

-- scraping_logs
CREATE TABLE public.scraping_logs (
    id bigint NOT NULL,
    country_code character(2) NOT NULL,
    source text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    duration_ms integer GENERATED ALWAYS AS (
CASE
    WHEN (finished_at IS NOT NULL) THEN (EXTRACT(epoch FROM (finished_at - started_at)) * (1000)::numeric)
    ELSE NULL::numeric
END) STORED,
    records_found integer DEFAULT 0,
    records_inserted integer DEFAULT 0,
    records_updated integer DEFAULT 0,
    errors jsonb DEFAULT '[]'::jsonb,
    meta jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT scraping_logs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'partial'::text, 'error'::text])))
);
ALTER TABLE public.scraping_logs OWNER TO postgres;


-- ═══════════ SEQUENCE OWNED BY ═══════════

-- document_rows_id_seq
ALTER SEQUENCE public.document_rows_id_seq OWNED BY public.document_rows.id;

-- documents_id_seq
ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;

-- memories_id_seq
ALTER SEQUENCE public.memories_id_seq OWNED BY public.memories.id;

-- n8n_chat_histories_id_seq
ALTER SEQUENCE public.n8n_chat_histories_id_seq OWNED BY public.n8n_chat_histories.id;

-- scraping_logs_id_seq
ALTER SEQUENCE public.scraping_logs_id_seq OWNED BY public.scraping_logs.id;


-- ═══════════ DEFAULT ═══════════

-- document_rows id
ALTER TABLE ONLY public.document_rows ALTER COLUMN id SET DEFAULT nextval('public.document_rows_id_seq'::regclass);

-- documents id
ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);

-- memories id
ALTER TABLE ONLY public.memories ALTER COLUMN id SET DEFAULT nextval('public.memories_id_seq'::regclass);

-- n8n_chat_histories id
ALTER TABLE ONLY public.n8n_chat_histories ALTER COLUMN id SET DEFAULT nextval('public.n8n_chat_histories_id_seq'::regclass);

-- scraping_logs id
ALTER TABLE ONLY public.scraping_logs ALTER COLUMN id SET DEFAULT nextval('public.scraping_logs_id_seq'::regclass);
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin


-- ═══════════ FUNCTION ═══════════

-- apply_wompi_payment_event(text, text, text, text, integer, text, bigint, text, integer)
CREATE FUNCTION public.apply_wompi_payment_event(p_reference text, p_transaction_id text, p_status text, p_payment_method_type text, p_amount_in_cents integer, p_currency text, p_event_timestamp bigint, p_checksum text, p_access_days integer DEFAULT 30) RETURNS TABLE(id uuid, reference text, user_id uuid, status text, amount_in_cents integer, currency character, transaction_id text, payment_method_type text, event_timestamp bigint, created_at timestamp with time zone, updated_at timestamp with time zone, paid_at timestamp with time zone, valid_until timestamp with time zone, applied boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
ALTER FUNCTION public.apply_wompi_payment_event(p_reference text, p_transaction_id text, p_status text, p_payment_method_type text, p_amount_in_cents integer, p_currency text, p_event_timestamp bigint, p_checksum text, p_access_days integer) OWNER TO postgres;

-- log_price_history()
CREATE FUNCTION public.log_price_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_kind  text;
  v_prev  numeric;
  v_delta numeric;
begin
  if (tg_op = 'INSERT') then
    if new.price is null then
      return new;                                           -- sin precio, nada que registrar
    end if;
    v_kind := 'initial';
    v_prev := null;
    v_delta := null;
  else
    -- UPDATE: solo si el precio cambió de verdad
    if new.price is not distinct from old.price then
      return new;
    end if;
    -- de null → valor lo tratamos como 'initial'
    if old.price is null then
      v_kind := 'initial';
      v_prev := null;
      v_delta := null;
    else
      v_kind := case when new.price < old.price then 'decrease' else 'increase' end;
      v_prev := old.price;
      v_delta := case when old.price <> 0
                      then round(((new.price - old.price) / old.price) * 100, 2)
                      else null end;
    end if;
  end if;
  insert into public.price_history
    (inmueble_id, price, currency, area_m2, source, change_kind, prev_price, delta_pct)
  values
    (new.id, new.price, new.currency, new.area_m2, new.source, v_kind, v_prev, v_delta);
  return new;
end;
$$;
ALTER FUNCTION public.log_price_history() OWNER TO postgres;

-- mark_stale_inmuebles(text, text, timestamp with time zone, integer)
CREATE FUNCTION public.mark_stale_inmuebles(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer DEFAULT 2) RETURNS TABLE(incremented integer, deactivated integer)
    LANGUAGE plpgsql
    AS $$
declare
  v_incremented integer := 0;
  v_deactivated integer := 0;
begin
  -- Incrementa times_missed para los que estaban activos pero no se vieron en este run
  with bumped as (
    update public.inmuebles
       set times_missed = times_missed + 1
     where source = p_source
       and country_code = p_country
       and is_active = true
       and last_seen_at < p_run_start
    returning id, times_missed
  )
  select count(*) into v_incremented from bumped;
  -- Desactiva los que pasaron el threshold
  with deact as (
    update public.inmuebles
       set is_active = false,
           deactivated_at = now()
     where source = p_source
       and country_code = p_country
       and is_active = true
       and times_missed >= p_threshold
    returning id
  )
  select count(*) into v_deactivated from deact;
  return query select v_incremented, v_deactivated;
end;
$$;
ALTER FUNCTION public.mark_stale_inmuebles(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) OWNER TO postgres;

-- mark_stale_remates(text, text, timestamp with time zone, integer)
CREATE FUNCTION public.mark_stale_remates(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer DEFAULT 2) RETURNS TABLE(incremented integer, deactivated integer)
    LANGUAGE plpgsql
    AS $$
declare
  v_incremented integer := 0;
  v_deactivated integer := 0;
begin
  with bumped as (
    update public.remates
       set times_missed = times_missed + 1
     where source = p_source
       and country_code = p_country
       and is_active = true
       and last_seen_at < p_run_start
    returning id, times_missed
  )
  select count(*) into v_incremented from bumped;
  with deact as (
    update public.remates
       set is_active = false,
           deactivated_at = now()
     where source = p_source
       and country_code = p_country
       and is_active = true
       and times_missed >= p_threshold
    returning id
  )
  select count(*) into v_deactivated from deact;
  return query select v_incremented, v_deactivated;
end;
$$;
ALTER FUNCTION public.mark_stale_remates(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) OWNER TO postgres;

-- mark_stale_rental_listings(text, text, timestamp with time zone, integer)
CREATE FUNCTION public.mark_stale_rental_listings(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer DEFAULT 2) RETURNS TABLE(incremented integer, deactivated integer)
    LANGUAGE plpgsql
    AS $$
declare
  v_incremented integer := 0;
  v_deactivated integer := 0;
begin
  with bumped as (
    update public.rental_listings
       set times_missed = times_missed + 1
     where source = p_source
       and country_code = p_country
       and is_active = true
       and last_seen_at < p_run_start
    returning id
  )
  select count(*) into v_incremented from bumped;
  with deact as (
    update public.rental_listings
       set is_active = false,
           deactivated_at = now()
     where source = p_source
       and country_code = p_country
       and is_active = true
       and times_missed >= p_threshold
    returning id
  )
  select count(*) into v_deactivated from deact;
  return query select v_incremented, v_deactivated;
end;
$$;
ALTER FUNCTION public.mark_stale_rental_listings(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) OWNER TO postgres;

-- match_documents(public.vector, integer, jsonb)
CREATE FUNCTION public.match_documents(query_embedding public.vector, match_count integer DEFAULT NULL::integer, filter jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
ALTER FUNCTION public.match_documents(query_embedding public.vector, match_count integer, filter jsonb) OWNER TO postgres;

-- match_memories(public.vector, integer, jsonb)
CREATE FUNCTION public.match_memories(query_embedding public.vector, match_count integer DEFAULT NULL::integer, filter jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (memories.embedding <=> query_embedding) as similarity
  from memories
  where metadata @> filter
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;
ALTER FUNCTION public.match_memories(query_embedding public.vector, match_count integer, filter jsonb) OWNER TO postgres;

-- set_inmuebles_updated_at()
CREATE FUNCTION public.set_inmuebles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION public.set_inmuebles_updated_at() OWNER TO postgres;

-- set_radar_zonas_updated_at()
CREATE FUNCTION public.set_radar_zonas_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION public.set_radar_zonas_updated_at() OWNER TO postgres;

-- set_rental_listings_updated_at()
CREATE FUNCTION public.set_rental_listings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION public.set_rental_listings_updated_at() OWNER TO postgres;

-- tg_remates_set_updated_at()
CREATE FUNCTION public.tg_remates_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION public.tg_remates_set_updated_at() OWNER TO postgres;


-- ═══════════ VIEW ═══════════

-- oportunidades_publicas
CREATE VIEW public.oportunidades_publicas AS
 SELECT id,
    country_code,
    city,
    zone,
    type,
    price,
    currency,
    area_m2,
    price_per_m2,
    features,
    source,
    image_url,
    is_opportunity,
    discount_pct,
    scraped_at
   FROM public.inmuebles
  WHERE (is_opportunity = true);
ALTER VIEW public.oportunidades_publicas OWNER TO postgres;

-- oportunidades_stats
CREATE VIEW public.oportunidades_stats AS
 SELECT country_code,
    city,
    count(*) FILTER (WHERE (is_opportunity = true)) AS total_oportunidades,
    count(*) AS total_inmuebles,
    round(avg(discount_pct) FILTER (WHERE (is_opportunity = true)), 1) AS descuento_promedio_pct,
    round(min(price_per_m2)) AS precio_m2_min,
    round(max(price_per_m2)) AS precio_m2_max
   FROM public.inmuebles
  WHERE ((price_per_m2 >= (500000)::numeric) AND (price_per_m2 <= (50000000)::numeric))
  GROUP BY country_code, city;
ALTER VIEW public.oportunidades_stats OWNER TO postgres;

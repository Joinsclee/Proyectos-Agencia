-- Indices, constraints, triggers, RLS y permisos.
-- Va DESPUES de cargar los datos.
set statement_timeout = 0;
set client_min_messages = warning;


-- ═══════════ CONSTRAINT ═══════════

-- document_metadata document_metadata_pkey
ALTER TABLE ONLY public.document_metadata
    ADD CONSTRAINT document_metadata_pkey PRIMARY KEY (id);

-- document_rows document_rows_pkey
ALTER TABLE ONLY public.document_rows
    ADD CONSTRAINT document_rows_pkey PRIMARY KEY (id);

-- documents documents_pkey
ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

-- inmuebles inmuebles_pkey
ALTER TABLE ONLY public.inmuebles
    ADD CONSTRAINT inmuebles_pkey PRIMARY KEY (id);

-- inmuebles inmuebles_source_unique
ALTER TABLE ONLY public.inmuebles
    ADD CONSTRAINT inmuebles_source_unique UNIQUE (country_code, source, source_id);

-- memories memories_pkey
ALTER TABLE ONLY public.memories
    ADD CONSTRAINT memories_pkey PRIMARY KEY (id);

-- n8n_chat_histories n8n_chat_histories_pkey
ALTER TABLE ONLY public.n8n_chat_histories
    ADD CONSTRAINT n8n_chat_histories_pkey PRIMARY KEY (id);

-- oportunidades_historial oportunidades_historial_pkey
ALTER TABLE ONLY public.oportunidades_historial
    ADD CONSTRAINT oportunidades_historial_pkey PRIMARY KEY (id);

-- precios_mercado precios_mercado_pkey
ALTER TABLE ONLY public.precios_mercado
    ADD CONSTRAINT precios_mercado_pkey PRIMARY KEY (id);

-- price_history price_history_pkey
ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_pkey PRIMARY KEY (id);

-- radar_cron_jobs radar_cron_jobs_pkey
ALTER TABLE ONLY public.radar_cron_jobs
    ADD CONSTRAINT radar_cron_jobs_pkey PRIMARY KEY (nombre);

-- radar_parametros_gastos radar_parametros_gastos_pkey
ALTER TABLE ONLY public.radar_parametros_gastos
    ADD CONSTRAINT radar_parametros_gastos_pkey PRIMARY KEY (id);

-- radar_payments radar_payments_pkey
ALTER TABLE ONLY public.radar_payments
    ADD CONSTRAINT radar_payments_pkey PRIMARY KEY (id);

-- radar_payments radar_payments_reference_key
ALTER TABLE ONLY public.radar_payments
    ADD CONSTRAINT radar_payments_reference_key UNIQUE (reference);

-- radar_sesiones_scraper radar_sesiones_scraper_pkey
ALTER TABLE ONLY public.radar_sesiones_scraper
    ADD CONSTRAINT radar_sesiones_scraper_pkey PRIMARY KEY (nombre);

-- radar_zonas_monitoreadas radar_zonas_monitoreadas_pkey
ALTER TABLE ONLY public.radar_zonas_monitoreadas
    ADD CONSTRAINT radar_zonas_monitoreadas_pkey PRIMARY KEY (id);

-- radar_zonas_monitoreadas radar_zonas_unique
ALTER TABLE ONLY public.radar_zonas_monitoreadas
    ADD CONSTRAINT radar_zonas_unique UNIQUE (country_code, portal, operation, property_type, neighborhood_slug, city_slug, dept_slug);

-- remates remates_pkey
ALTER TABLE ONLY public.remates
    ADD CONSTRAINT remates_pkey PRIMARY KEY (id);

-- remates remates_source_unique
ALTER TABLE ONLY public.remates
    ADD CONSTRAINT remates_source_unique UNIQUE (country_code, source, source_id);

-- rental_listings rental_listings_pkey
ALTER TABLE ONLY public.rental_listings
    ADD CONSTRAINT rental_listings_pkey PRIMARY KEY (id);

-- rental_listings rental_listings_source_unique
ALTER TABLE ONLY public.rental_listings
    ADD CONSTRAINT rental_listings_source_unique UNIQUE (country_code, source, source_id);

-- scraping_logs scraping_logs_pkey
ALTER TABLE ONLY public.scraping_logs
    ADD CONSTRAINT scraping_logs_pkey PRIMARY KEY (id);


-- ═══════════ FK CONSTRAINT ═══════════

-- document_rows document_rows_dataset_id_fkey
ALTER TABLE ONLY public.document_rows
    ADD CONSTRAINT document_rows_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.document_metadata(id);

-- price_history price_history_inmueble_id_fkey
ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_inmueble_id_fkey FOREIGN KEY (inmueble_id) REFERENCES public.inmuebles(id) ON DELETE CASCADE;

-- radar_payments radar_payments_user_id_fkey
ALTER TABLE ONLY public.radar_payments
    ADD CONSTRAINT radar_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ═══════════ INDEX ═══════════

-- idx_inmuebles_area
CREATE INDEX idx_inmuebles_area ON public.inmuebles USING btree (area_m2) WHERE is_active;

-- idx_inmuebles_bedrooms
CREATE INDEX idx_inmuebles_bedrooms ON public.inmuebles USING btree (((features ->> 'bedrooms'::text))) WHERE is_active;

-- idx_inmuebles_city
CREATE INDEX idx_inmuebles_city ON public.inmuebles USING btree (city);

-- idx_inmuebles_is_active
CREATE INDEX idx_inmuebles_is_active ON public.inmuebles USING btree (is_active) WHERE (is_active = true);

-- idx_inmuebles_last_seen
CREATE INDEX idx_inmuebles_last_seen ON public.inmuebles USING btree (last_seen_at);

-- idx_inmuebles_opportunity
CREATE INDEX idx_inmuebles_opportunity ON public.inmuebles USING btree (is_opportunity) WHERE is_active;

-- idx_inmuebles_portal_disc
CREATE INDEX idx_inmuebles_portal_disc ON public.inmuebles USING btree (discount_pct DESC NULLS LAST) WHERE (is_active AND (source = 'fincaraiz'::text) AND (((features ->> 'is_project'::text) IS NULL) OR ((features ->> 'is_project'::text) = 'false'::text)));

-- idx_inmuebles_portal_ppm2
CREATE INDEX idx_inmuebles_portal_ppm2 ON public.inmuebles USING btree (price_per_m2) WHERE (is_active AND (source = 'fincaraiz'::text) AND (((features ->> 'is_project'::text) IS NULL) OR ((features ->> 'is_project'::text) = 'false'::text)));

-- idx_inmuebles_portal_price
CREATE INDEX idx_inmuebles_portal_price ON public.inmuebles USING btree (price) WHERE (is_active AND (source = 'fincaraiz'::text) AND (((features ->> 'is_project'::text) IS NULL) OR ((features ->> 'is_project'::text) = 'false'::text)));

-- idx_inmuebles_src_active_discount
CREATE INDEX idx_inmuebles_src_active_discount ON public.inmuebles USING btree (source, is_active, discount_pct DESC);

-- idx_inmuebles_src_active_ppm2
CREATE INDEX idx_inmuebles_src_active_ppm2 ON public.inmuebles USING btree (source, is_active, price_per_m2);

-- idx_inmuebles_src_active_price
CREATE INDEX idx_inmuebles_src_active_price ON public.inmuebles USING btree (source, is_active, price);

-- idx_inmuebles_stratum
CREATE INDEX idx_inmuebles_stratum ON public.inmuebles USING btree (((features ->> 'stratum'::text))) WHERE is_active;

-- idx_inmuebles_times_missed
CREATE INDEX idx_inmuebles_times_missed ON public.inmuebles USING btree (times_missed) WHERE (times_missed > 0);

-- idx_remates_appraisal
CREATE INDEX idx_remates_appraisal ON public.remates USING btree (appraisal_value);

-- idx_remates_auction_date
CREATE INDEX idx_remates_auction_date ON public.remates USING btree (auction_date);

-- idx_remates_city
CREATE INDEX idx_remates_city ON public.remates USING btree (city);

-- idx_remates_department
CREATE INDEX idx_remates_department ON public.remates USING btree (department);

-- idx_remates_is_active
CREATE INDEX idx_remates_is_active ON public.remates USING btree (is_active) WHERE (is_active = true);

-- idx_remates_minbid
CREATE INDEX idx_remates_minbid ON public.remates USING btree (minimum_bid) WHERE is_active;

-- idx_remates_times_missed
CREATE INDEX idx_remates_times_missed ON public.remates USING btree (times_missed) WHERE (times_missed > 0);

-- idx_remates_type
CREATE INDEX idx_remates_type ON public.remates USING btree (property_type);

-- inmuebles_country_city_idx
CREATE INDEX inmuebles_country_city_idx ON public.inmuebles USING btree (country_code, city);

-- inmuebles_country_source_idx
CREATE INDEX inmuebles_country_source_idx ON public.inmuebles USING btree (country_code, source);

-- inmuebles_crece_tier_idx
CREATE INDEX inmuebles_crece_tier_idx ON public.inmuebles USING btree (crece_tier, crece_index) WHERE ((is_active = true) AND (crece_tier IS NOT NULL));

-- inmuebles_estado_idx
CREATE INDEX inmuebles_estado_idx ON public.inmuebles USING btree (estado, crece_tier) WHERE (is_active = true);

-- inmuebles_features_bedrooms_idx
CREATE INDEX inmuebles_features_bedrooms_idx ON public.inmuebles USING btree (((features -> 'bedrooms'::text))) WHERE (is_active = true);

-- inmuebles_features_stratum_idx
CREATE INDEX inmuebles_features_stratum_idx ON public.inmuebles USING btree (((features -> 'stratum'::text))) WHERE (is_active = true);

-- inmuebles_is_high_idx
CREATE INDEX inmuebles_is_high_idx ON public.inmuebles USING btree (is_high, discount_pct DESC) WHERE (is_high = true);

-- inmuebles_oportunidad_activa_idx
CREATE INDEX inmuebles_oportunidad_activa_idx ON public.inmuebles USING btree (source, is_opportunity) WHERE ((is_active = true) AND (is_opportunity = true));

-- inmuebles_opp_source_idx
CREATE INDEX inmuebles_opp_source_idx ON public.inmuebles USING btree (source, discount_pct) WHERE ((is_opportunity = true) AND (is_active = true));

-- inmuebles_opportunity_idx
CREATE INDEX inmuebles_opportunity_idx ON public.inmuebles USING btree (country_code, is_opportunity, discount_pct DESC) WHERE (is_opportunity = true);

-- inmuebles_price_per_m2_idx
CREATE INDEX inmuebles_price_per_m2_idx ON public.inmuebles USING btree (country_code, city, type, price_per_m2);

-- inmuebles_scraped_at_idx
CREATE INDEX inmuebles_scraped_at_idx ON public.inmuebles USING btree (scraped_at DESC);

-- oport_hist_entidad_idx
CREATE INDEX oport_hist_entidad_idx ON public.oportunidades_historial USING btree (entidad, entidad_id, ocurrio_en DESC);

-- oport_hist_evento_idx
CREATE INDEX oport_hist_evento_idx ON public.oportunidades_historial USING btree (evento, ocurrio_en DESC);

-- precios_mercado_lookup_idx
CREATE INDEX precios_mercado_lookup_idx ON public.precios_mercado USING btree (country_code, city, type, scraped_at DESC);

-- price_history_decrease_idx
CREATE INDEX price_history_decrease_idx ON public.price_history USING btree (change_kind, observed_at DESC) WHERE (change_kind = 'decrease'::text);

-- price_history_inmueble_idx
CREATE INDEX price_history_inmueble_idx ON public.price_history USING btree (inmueble_id, observed_at DESC);

-- radar_cron_pendientes_idx
CREATE INDEX radar_cron_pendientes_idx ON public.radar_cron_jobs USING btree (habilitado, ultima_corrida);

-- radar_payments_status_updated_idx
CREATE INDEX radar_payments_status_updated_idx ON public.radar_payments USING btree (status, updated_at DESC);

-- radar_payments_transaction_unique
CREATE UNIQUE INDEX radar_payments_transaction_unique ON public.radar_payments USING btree (transaction_id) WHERE (transaction_id IS NOT NULL);

-- radar_payments_user_created_idx
CREATE INDEX radar_payments_user_created_idx ON public.radar_payments USING btree (user_id, created_at DESC);

-- radar_zonas_active_idx
CREATE INDEX radar_zonas_active_idx ON public.radar_zonas_monitoreadas USING btree (country_code, is_active) WHERE (is_active = true);

-- radar_zonas_city_nivel_idx
CREATE INDEX radar_zonas_city_nivel_idx ON public.radar_zonas_monitoreadas USING btree (city, nivel);

-- remates_crece_idx
CREATE INDEX remates_crece_idx ON public.remates USING btree (crece_tier, crece_index) WHERE (is_active = true);

-- remates_cuota_parte_idx
CREATE INDEX remates_cuota_parte_idx ON public.remates USING btree (cuota_parte) WHERE (cuota_parte <> (100)::numeric);

-- rental_listings_last_seen_idx
CREATE INDEX rental_listings_last_seen_idx ON public.rental_listings USING btree (last_seen_at);

-- rental_listings_market_idx
CREATE INDEX rental_listings_market_idx ON public.rental_listings USING btree (country_code, city, type, monthly_rent_per_m2) WHERE (is_active = true);

-- rental_listings_zone_idx
CREATE INDEX rental_listings_zone_idx ON public.rental_listings USING btree (country_code, city, zone, type) WHERE (is_active = true);

-- scraping_logs_source_idx
CREATE INDEX scraping_logs_source_idx ON public.scraping_logs USING btree (country_code, source, started_at DESC);

-- scraping_logs_status_idx
CREATE INDEX scraping_logs_status_idx ON public.scraping_logs USING btree (status, started_at DESC);


-- ═══════════ TRIGGER ═══════════

-- inmuebles inmuebles_log_price_history
CREATE TRIGGER inmuebles_log_price_history AFTER INSERT OR UPDATE OF price ON public.inmuebles FOR EACH ROW EXECUTE FUNCTION public.log_price_history();

-- inmuebles inmuebles_set_updated_at
CREATE TRIGGER inmuebles_set_updated_at BEFORE UPDATE ON public.inmuebles FOR EACH ROW EXECUTE FUNCTION public.set_inmuebles_updated_at();

-- radar_zonas_monitoreadas radar_zonas_set_updated_at
CREATE TRIGGER radar_zonas_set_updated_at BEFORE UPDATE ON public.radar_zonas_monitoreadas FOR EACH ROW EXECUTE FUNCTION public.set_radar_zonas_updated_at();

-- rental_listings rental_listings_set_updated_at
CREATE TRIGGER rental_listings_set_updated_at BEFORE UPDATE ON public.rental_listings FOR EACH ROW EXECUTE FUNCTION public.set_rental_listings_updated_at();

-- remates trg_remates_updated_at
CREATE TRIGGER trg_remates_updated_at BEFORE UPDATE ON public.remates FOR EACH ROW EXECUTE FUNCTION public.tg_remates_set_updated_at();


-- ═══════════ SEQUENCE SET ═══════════

-- document_rows_id_seq
SELECT pg_catalog.setval('public.document_rows_id_seq', 1, false);

-- documents_id_seq
SELECT pg_catalog.setval('public.documents_id_seq', 637, true);

-- memories_id_seq
SELECT pg_catalog.setval('public.memories_id_seq', 1, false);

-- n8n_chat_histories_id_seq
SELECT pg_catalog.setval('public.n8n_chat_histories_id_seq', 12, true);

-- scraping_logs_id_seq
SELECT pg_catalog.setval('public.scraping_logs_id_seq', 193, true);


-- ═══════════ ROW SECURITY ═══════════

-- inmuebles
ALTER TABLE public.inmuebles ENABLE ROW LEVEL SECURITY;

-- oportunidades_historial
ALTER TABLE public.oportunidades_historial ENABLE ROW LEVEL SECURITY;

-- precios_mercado
ALTER TABLE public.precios_mercado ENABLE ROW LEVEL SECURITY;

-- price_history
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- radar_cron_jobs
ALTER TABLE public.radar_cron_jobs ENABLE ROW LEVEL SECURITY;

-- radar_parametros_gastos
ALTER TABLE public.radar_parametros_gastos ENABLE ROW LEVEL SECURITY;

-- radar_payments
ALTER TABLE public.radar_payments ENABLE ROW LEVEL SECURITY;

-- radar_sesiones_scraper
ALTER TABLE public.radar_sesiones_scraper ENABLE ROW LEVEL SECURITY;

-- radar_zonas_monitoreadas
ALTER TABLE public.radar_zonas_monitoreadas ENABLE ROW LEVEL SECURITY;

-- remates
ALTER TABLE public.remates ENABLE ROW LEVEL SECURITY;

-- rental_listings
ALTER TABLE public.rental_listings ENABLE ROW LEVEL SECURITY;

-- scraping_logs
ALTER TABLE public.scraping_logs ENABLE ROW LEVEL SECURITY;


-- ═══════════ ACL ═══════════

-- FUNCTION halfvec_in(cstring, oid, integer)
GRANT ALL ON FUNCTION public.halfvec_in(cstring, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_in(cstring, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.halfvec_in(cstring, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_in(cstring, oid, integer) TO service_role;

-- FUNCTION halfvec_out(public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_out(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_out(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_out(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_out(public.halfvec) TO service_role;

-- FUNCTION halfvec_recv(internal, oid, integer)
GRANT ALL ON FUNCTION public.halfvec_recv(internal, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_recv(internal, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.halfvec_recv(internal, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_recv(internal, oid, integer) TO service_role;

-- FUNCTION halfvec_send(public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_send(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_send(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_send(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_send(public.halfvec) TO service_role;

-- FUNCTION halfvec_typmod_in(cstring[])
GRANT ALL ON FUNCTION public.halfvec_typmod_in(cstring[]) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_typmod_in(cstring[]) TO anon;
GRANT ALL ON FUNCTION public.halfvec_typmod_in(cstring[]) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_typmod_in(cstring[]) TO service_role;

-- FUNCTION sparsevec_in(cstring, oid, integer)
GRANT ALL ON FUNCTION public.sparsevec_in(cstring, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_in(cstring, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_in(cstring, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_in(cstring, oid, integer) TO service_role;

-- FUNCTION sparsevec_out(public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_out(public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_out(public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_out(public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_out(public.sparsevec) TO service_role;

-- FUNCTION sparsevec_recv(internal, oid, integer)
GRANT ALL ON FUNCTION public.sparsevec_recv(internal, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_recv(internal, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_recv(internal, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_recv(internal, oid, integer) TO service_role;

-- FUNCTION sparsevec_send(public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_send(public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_send(public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_send(public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_send(public.sparsevec) TO service_role;

-- FUNCTION sparsevec_typmod_in(cstring[])
GRANT ALL ON FUNCTION public.sparsevec_typmod_in(cstring[]) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_typmod_in(cstring[]) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_typmod_in(cstring[]) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_typmod_in(cstring[]) TO service_role;

-- FUNCTION vector_in(cstring, oid, integer)
GRANT ALL ON FUNCTION public.vector_in(cstring, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.vector_in(cstring, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.vector_in(cstring, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.vector_in(cstring, oid, integer) TO service_role;

-- FUNCTION vector_out(public.vector)
GRANT ALL ON FUNCTION public.vector_out(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_out(public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_out(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_out(public.vector) TO service_role;

-- FUNCTION vector_recv(internal, oid, integer)
GRANT ALL ON FUNCTION public.vector_recv(internal, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.vector_recv(internal, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.vector_recv(internal, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.vector_recv(internal, oid, integer) TO service_role;

-- FUNCTION vector_send(public.vector)
GRANT ALL ON FUNCTION public.vector_send(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_send(public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_send(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_send(public.vector) TO service_role;

-- FUNCTION vector_typmod_in(cstring[])
GRANT ALL ON FUNCTION public.vector_typmod_in(cstring[]) TO postgres;
GRANT ALL ON FUNCTION public.vector_typmod_in(cstring[]) TO anon;
GRANT ALL ON FUNCTION public.vector_typmod_in(cstring[]) TO authenticated;
GRANT ALL ON FUNCTION public.vector_typmod_in(cstring[]) TO service_role;

-- FUNCTION array_to_halfvec(real[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_halfvec(real[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_halfvec(real[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_halfvec(real[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_halfvec(real[], integer, boolean) TO service_role;

-- FUNCTION array_to_sparsevec(real[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_sparsevec(real[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_sparsevec(real[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_sparsevec(real[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_sparsevec(real[], integer, boolean) TO service_role;

-- FUNCTION array_to_vector(real[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_vector(real[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_vector(real[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_vector(real[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_vector(real[], integer, boolean) TO service_role;

-- FUNCTION array_to_halfvec(double precision[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_halfvec(double precision[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_halfvec(double precision[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_halfvec(double precision[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_halfvec(double precision[], integer, boolean) TO service_role;

-- FUNCTION array_to_sparsevec(double precision[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_sparsevec(double precision[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_sparsevec(double precision[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_sparsevec(double precision[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_sparsevec(double precision[], integer, boolean) TO service_role;

-- FUNCTION array_to_vector(double precision[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_vector(double precision[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_vector(double precision[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_vector(double precision[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_vector(double precision[], integer, boolean) TO service_role;

-- FUNCTION array_to_halfvec(integer[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_halfvec(integer[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_halfvec(integer[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_halfvec(integer[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_halfvec(integer[], integer, boolean) TO service_role;

-- FUNCTION array_to_sparsevec(integer[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_sparsevec(integer[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_sparsevec(integer[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_sparsevec(integer[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_sparsevec(integer[], integer, boolean) TO service_role;

-- FUNCTION array_to_vector(integer[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_vector(integer[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_vector(integer[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_vector(integer[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_vector(integer[], integer, boolean) TO service_role;

-- FUNCTION array_to_halfvec(numeric[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_halfvec(numeric[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_halfvec(numeric[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_halfvec(numeric[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_halfvec(numeric[], integer, boolean) TO service_role;

-- FUNCTION array_to_sparsevec(numeric[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_sparsevec(numeric[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_sparsevec(numeric[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_sparsevec(numeric[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_sparsevec(numeric[], integer, boolean) TO service_role;

-- FUNCTION array_to_vector(numeric[], integer, boolean)
GRANT ALL ON FUNCTION public.array_to_vector(numeric[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_vector(numeric[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_vector(numeric[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_vector(numeric[], integer, boolean) TO service_role;

-- FUNCTION halfvec_to_float4(public.halfvec, integer, boolean)
GRANT ALL ON FUNCTION public.halfvec_to_float4(public.halfvec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_to_float4(public.halfvec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.halfvec_to_float4(public.halfvec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_to_float4(public.halfvec, integer, boolean) TO service_role;

-- FUNCTION halfvec(public.halfvec, integer, boolean)
GRANT ALL ON FUNCTION public.halfvec(public.halfvec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.halfvec(public.halfvec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.halfvec(public.halfvec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec(public.halfvec, integer, boolean) TO service_role;

-- FUNCTION halfvec_to_sparsevec(public.halfvec, integer, boolean)
GRANT ALL ON FUNCTION public.halfvec_to_sparsevec(public.halfvec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_to_sparsevec(public.halfvec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.halfvec_to_sparsevec(public.halfvec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_to_sparsevec(public.halfvec, integer, boolean) TO service_role;

-- FUNCTION halfvec_to_vector(public.halfvec, integer, boolean)
GRANT ALL ON FUNCTION public.halfvec_to_vector(public.halfvec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_to_vector(public.halfvec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.halfvec_to_vector(public.halfvec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_to_vector(public.halfvec, integer, boolean) TO service_role;

-- FUNCTION sparsevec_to_halfvec(public.sparsevec, integer, boolean)
GRANT ALL ON FUNCTION public.sparsevec_to_halfvec(public.sparsevec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_to_halfvec(public.sparsevec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_to_halfvec(public.sparsevec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_to_halfvec(public.sparsevec, integer, boolean) TO service_role;

-- FUNCTION sparsevec(public.sparsevec, integer, boolean)
GRANT ALL ON FUNCTION public.sparsevec(public.sparsevec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec(public.sparsevec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.sparsevec(public.sparsevec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec(public.sparsevec, integer, boolean) TO service_role;

-- FUNCTION sparsevec_to_vector(public.sparsevec, integer, boolean)
GRANT ALL ON FUNCTION public.sparsevec_to_vector(public.sparsevec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_to_vector(public.sparsevec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_to_vector(public.sparsevec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_to_vector(public.sparsevec, integer, boolean) TO service_role;

-- FUNCTION vector_to_float4(public.vector, integer, boolean)
GRANT ALL ON FUNCTION public.vector_to_float4(public.vector, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.vector_to_float4(public.vector, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.vector_to_float4(public.vector, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.vector_to_float4(public.vector, integer, boolean) TO service_role;

-- FUNCTION vector_to_halfvec(public.vector, integer, boolean)
GRANT ALL ON FUNCTION public.vector_to_halfvec(public.vector, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.vector_to_halfvec(public.vector, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.vector_to_halfvec(public.vector, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.vector_to_halfvec(public.vector, integer, boolean) TO service_role;

-- FUNCTION vector_to_sparsevec(public.vector, integer, boolean)
GRANT ALL ON FUNCTION public.vector_to_sparsevec(public.vector, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.vector_to_sparsevec(public.vector, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.vector_to_sparsevec(public.vector, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.vector_to_sparsevec(public.vector, integer, boolean) TO service_role;

-- FUNCTION vector(public.vector, integer, boolean)
GRANT ALL ON FUNCTION public.vector(public.vector, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.vector(public.vector, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.vector(public.vector, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.vector(public.vector, integer, boolean) TO service_role;

-- FUNCTION apply_wompi_payment_event(p_reference text, p_transaction_id text, p_status text, p_payment_method_type text, p_amount_in_cents integer, p_currency text, p_event_timestamp bigint, p_checksum text, p_access_days integer)
REVOKE ALL ON FUNCTION public.apply_wompi_payment_event(p_reference text, p_transaction_id text, p_status text, p_payment_method_type text, p_amount_in_cents integer, p_currency text, p_event_timestamp bigint, p_checksum text, p_access_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_wompi_payment_event(p_reference text, p_transaction_id text, p_status text, p_payment_method_type text, p_amount_in_cents integer, p_currency text, p_event_timestamp bigint, p_checksum text, p_access_days integer) TO service_role;

-- FUNCTION binary_quantize(public.halfvec)
GRANT ALL ON FUNCTION public.binary_quantize(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.binary_quantize(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.binary_quantize(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.binary_quantize(public.halfvec) TO service_role;

-- FUNCTION binary_quantize(public.vector)
GRANT ALL ON FUNCTION public.binary_quantize(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.binary_quantize(public.vector) TO anon;
GRANT ALL ON FUNCTION public.binary_quantize(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.binary_quantize(public.vector) TO service_role;

-- FUNCTION cosine_distance(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.cosine_distance(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.cosine_distance(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.cosine_distance(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.cosine_distance(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION cosine_distance(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.cosine_distance(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.cosine_distance(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.cosine_distance(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.cosine_distance(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION cosine_distance(public.vector, public.vector)
GRANT ALL ON FUNCTION public.cosine_distance(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.cosine_distance(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.cosine_distance(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.cosine_distance(public.vector, public.vector) TO service_role;

-- FUNCTION halfvec_accum(double precision[], public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_accum(double precision[], public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_accum(double precision[], public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_accum(double precision[], public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_accum(double precision[], public.halfvec) TO service_role;

-- FUNCTION halfvec_add(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_add(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_add(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_add(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_add(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_avg(double precision[])
GRANT ALL ON FUNCTION public.halfvec_avg(double precision[]) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_avg(double precision[]) TO anon;
GRANT ALL ON FUNCTION public.halfvec_avg(double precision[]) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_avg(double precision[]) TO service_role;

-- FUNCTION halfvec_cmp(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_cmp(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_cmp(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_cmp(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_cmp(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_combine(double precision[], double precision[])
GRANT ALL ON FUNCTION public.halfvec_combine(double precision[], double precision[]) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_combine(double precision[], double precision[]) TO anon;
GRANT ALL ON FUNCTION public.halfvec_combine(double precision[], double precision[]) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_combine(double precision[], double precision[]) TO service_role;

-- FUNCTION halfvec_concat(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_concat(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_concat(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_concat(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_concat(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_eq(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_eq(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_eq(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_eq(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_eq(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_ge(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_ge(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_ge(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_ge(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_ge(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_gt(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_gt(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_gt(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_gt(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_gt(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_l2_squared_distance(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_l2_squared_distance(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_l2_squared_distance(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_l2_squared_distance(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_l2_squared_distance(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_le(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_le(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_le(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_le(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_le(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_lt(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_lt(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_lt(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_lt(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_lt(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_mul(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_mul(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_mul(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_mul(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_mul(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_ne(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_ne(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_ne(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_ne(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_ne(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_negative_inner_product(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_negative_inner_product(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_negative_inner_product(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_negative_inner_product(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_negative_inner_product(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_spherical_distance(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_spherical_distance(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_spherical_distance(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_spherical_distance(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_spherical_distance(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION halfvec_sub(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.halfvec_sub(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_sub(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_sub(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_sub(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION hamming_distance(bit, bit)
GRANT ALL ON FUNCTION public.hamming_distance(bit, bit) TO postgres;
GRANT ALL ON FUNCTION public.hamming_distance(bit, bit) TO anon;
GRANT ALL ON FUNCTION public.hamming_distance(bit, bit) TO authenticated;
GRANT ALL ON FUNCTION public.hamming_distance(bit, bit) TO service_role;

-- FUNCTION hnsw_bit_support(internal)
GRANT ALL ON FUNCTION public.hnsw_bit_support(internal) TO postgres;
GRANT ALL ON FUNCTION public.hnsw_bit_support(internal) TO anon;
GRANT ALL ON FUNCTION public.hnsw_bit_support(internal) TO authenticated;
GRANT ALL ON FUNCTION public.hnsw_bit_support(internal) TO service_role;

-- FUNCTION hnsw_halfvec_support(internal)
GRANT ALL ON FUNCTION public.hnsw_halfvec_support(internal) TO postgres;
GRANT ALL ON FUNCTION public.hnsw_halfvec_support(internal) TO anon;
GRANT ALL ON FUNCTION public.hnsw_halfvec_support(internal) TO authenticated;
GRANT ALL ON FUNCTION public.hnsw_halfvec_support(internal) TO service_role;

-- FUNCTION hnsw_sparsevec_support(internal)
GRANT ALL ON FUNCTION public.hnsw_sparsevec_support(internal) TO postgres;
GRANT ALL ON FUNCTION public.hnsw_sparsevec_support(internal) TO anon;
GRANT ALL ON FUNCTION public.hnsw_sparsevec_support(internal) TO authenticated;
GRANT ALL ON FUNCTION public.hnsw_sparsevec_support(internal) TO service_role;

-- FUNCTION hnswhandler(internal)
GRANT ALL ON FUNCTION public.hnswhandler(internal) TO postgres;
GRANT ALL ON FUNCTION public.hnswhandler(internal) TO anon;
GRANT ALL ON FUNCTION public.hnswhandler(internal) TO authenticated;
GRANT ALL ON FUNCTION public.hnswhandler(internal) TO service_role;

-- FUNCTION inner_product(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.inner_product(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.inner_product(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.inner_product(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.inner_product(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION inner_product(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.inner_product(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.inner_product(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.inner_product(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.inner_product(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION inner_product(public.vector, public.vector)
GRANT ALL ON FUNCTION public.inner_product(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.inner_product(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.inner_product(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.inner_product(public.vector, public.vector) TO service_role;

-- FUNCTION ivfflat_bit_support(internal)
GRANT ALL ON FUNCTION public.ivfflat_bit_support(internal) TO postgres;
GRANT ALL ON FUNCTION public.ivfflat_bit_support(internal) TO anon;
GRANT ALL ON FUNCTION public.ivfflat_bit_support(internal) TO authenticated;
GRANT ALL ON FUNCTION public.ivfflat_bit_support(internal) TO service_role;

-- FUNCTION ivfflat_halfvec_support(internal)
GRANT ALL ON FUNCTION public.ivfflat_halfvec_support(internal) TO postgres;
GRANT ALL ON FUNCTION public.ivfflat_halfvec_support(internal) TO anon;
GRANT ALL ON FUNCTION public.ivfflat_halfvec_support(internal) TO authenticated;
GRANT ALL ON FUNCTION public.ivfflat_halfvec_support(internal) TO service_role;

-- FUNCTION ivfflathandler(internal)
GRANT ALL ON FUNCTION public.ivfflathandler(internal) TO postgres;
GRANT ALL ON FUNCTION public.ivfflathandler(internal) TO anon;
GRANT ALL ON FUNCTION public.ivfflathandler(internal) TO authenticated;
GRANT ALL ON FUNCTION public.ivfflathandler(internal) TO service_role;

-- FUNCTION jaccard_distance(bit, bit)
GRANT ALL ON FUNCTION public.jaccard_distance(bit, bit) TO postgres;
GRANT ALL ON FUNCTION public.jaccard_distance(bit, bit) TO anon;
GRANT ALL ON FUNCTION public.jaccard_distance(bit, bit) TO authenticated;
GRANT ALL ON FUNCTION public.jaccard_distance(bit, bit) TO service_role;

-- FUNCTION l1_distance(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.l1_distance(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.l1_distance(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.l1_distance(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.l1_distance(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION l1_distance(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.l1_distance(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.l1_distance(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.l1_distance(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.l1_distance(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION l1_distance(public.vector, public.vector)
GRANT ALL ON FUNCTION public.l1_distance(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.l1_distance(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.l1_distance(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.l1_distance(public.vector, public.vector) TO service_role;

-- FUNCTION l2_distance(public.halfvec, public.halfvec)
GRANT ALL ON FUNCTION public.l2_distance(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.l2_distance(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.l2_distance(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_distance(public.halfvec, public.halfvec) TO service_role;

-- FUNCTION l2_distance(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.l2_distance(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.l2_distance(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.l2_distance(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_distance(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION l2_distance(public.vector, public.vector)
GRANT ALL ON FUNCTION public.l2_distance(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.l2_distance(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.l2_distance(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.l2_distance(public.vector, public.vector) TO service_role;

-- FUNCTION l2_norm(public.halfvec)
GRANT ALL ON FUNCTION public.l2_norm(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.l2_norm(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.l2_norm(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_norm(public.halfvec) TO service_role;

-- FUNCTION l2_norm(public.sparsevec)
GRANT ALL ON FUNCTION public.l2_norm(public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.l2_norm(public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.l2_norm(public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_norm(public.sparsevec) TO service_role;

-- FUNCTION l2_normalize(public.halfvec)
GRANT ALL ON FUNCTION public.l2_normalize(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.l2_normalize(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.l2_normalize(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_normalize(public.halfvec) TO service_role;

-- FUNCTION l2_normalize(public.sparsevec)
GRANT ALL ON FUNCTION public.l2_normalize(public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.l2_normalize(public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.l2_normalize(public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_normalize(public.sparsevec) TO service_role;

-- FUNCTION l2_normalize(public.vector)
GRANT ALL ON FUNCTION public.l2_normalize(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.l2_normalize(public.vector) TO anon;
GRANT ALL ON FUNCTION public.l2_normalize(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.l2_normalize(public.vector) TO service_role;

-- FUNCTION log_price_history()
GRANT ALL ON FUNCTION public.log_price_history() TO anon;
GRANT ALL ON FUNCTION public.log_price_history() TO authenticated;
GRANT ALL ON FUNCTION public.log_price_history() TO service_role;

-- FUNCTION mark_stale_inmuebles(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer)
GRANT ALL ON FUNCTION public.mark_stale_inmuebles(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) TO anon;
GRANT ALL ON FUNCTION public.mark_stale_inmuebles(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) TO authenticated;
GRANT ALL ON FUNCTION public.mark_stale_inmuebles(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) TO service_role;

-- FUNCTION mark_stale_remates(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer)
GRANT ALL ON FUNCTION public.mark_stale_remates(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) TO anon;
GRANT ALL ON FUNCTION public.mark_stale_remates(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) TO authenticated;
GRANT ALL ON FUNCTION public.mark_stale_remates(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) TO service_role;

-- FUNCTION mark_stale_rental_listings(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer)
GRANT ALL ON FUNCTION public.mark_stale_rental_listings(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) TO anon;
GRANT ALL ON FUNCTION public.mark_stale_rental_listings(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) TO authenticated;
GRANT ALL ON FUNCTION public.mark_stale_rental_listings(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) TO service_role;

-- FUNCTION match_documents(query_embedding public.vector, match_count integer, filter jsonb)
GRANT ALL ON FUNCTION public.match_documents(query_embedding public.vector, match_count integer, filter jsonb) TO anon;
GRANT ALL ON FUNCTION public.match_documents(query_embedding public.vector, match_count integer, filter jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.match_documents(query_embedding public.vector, match_count integer, filter jsonb) TO service_role;

-- FUNCTION match_memories(query_embedding public.vector, match_count integer, filter jsonb)
GRANT ALL ON FUNCTION public.match_memories(query_embedding public.vector, match_count integer, filter jsonb) TO anon;
GRANT ALL ON FUNCTION public.match_memories(query_embedding public.vector, match_count integer, filter jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.match_memories(query_embedding public.vector, match_count integer, filter jsonb) TO service_role;

-- FUNCTION set_inmuebles_updated_at()
GRANT ALL ON FUNCTION public.set_inmuebles_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_inmuebles_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_inmuebles_updated_at() TO service_role;

-- FUNCTION set_radar_zonas_updated_at()
GRANT ALL ON FUNCTION public.set_radar_zonas_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_radar_zonas_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_radar_zonas_updated_at() TO service_role;

-- FUNCTION set_rental_listings_updated_at()
GRANT ALL ON FUNCTION public.set_rental_listings_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_rental_listings_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_rental_listings_updated_at() TO service_role;

-- FUNCTION sparsevec_cmp(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_cmp(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_cmp(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_cmp(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_cmp(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION sparsevec_eq(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_eq(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_eq(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_eq(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_eq(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION sparsevec_ge(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_ge(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_ge(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_ge(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_ge(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION sparsevec_gt(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_gt(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_gt(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_gt(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_gt(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION sparsevec_l2_squared_distance(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_l2_squared_distance(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_l2_squared_distance(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_l2_squared_distance(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_l2_squared_distance(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION sparsevec_le(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_le(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_le(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_le(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_le(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION sparsevec_lt(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_lt(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_lt(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_lt(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_lt(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION sparsevec_ne(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_ne(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_ne(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_ne(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_ne(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION sparsevec_negative_inner_product(public.sparsevec, public.sparsevec)
GRANT ALL ON FUNCTION public.sparsevec_negative_inner_product(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_negative_inner_product(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_negative_inner_product(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_negative_inner_product(public.sparsevec, public.sparsevec) TO service_role;

-- FUNCTION subvector(public.halfvec, integer, integer)
GRANT ALL ON FUNCTION public.subvector(public.halfvec, integer, integer) TO postgres;
GRANT ALL ON FUNCTION public.subvector(public.halfvec, integer, integer) TO anon;
GRANT ALL ON FUNCTION public.subvector(public.halfvec, integer, integer) TO authenticated;
GRANT ALL ON FUNCTION public.subvector(public.halfvec, integer, integer) TO service_role;

-- FUNCTION subvector(public.vector, integer, integer)
GRANT ALL ON FUNCTION public.subvector(public.vector, integer, integer) TO postgres;
GRANT ALL ON FUNCTION public.subvector(public.vector, integer, integer) TO anon;
GRANT ALL ON FUNCTION public.subvector(public.vector, integer, integer) TO authenticated;
GRANT ALL ON FUNCTION public.subvector(public.vector, integer, integer) TO service_role;

-- FUNCTION tg_remates_set_updated_at()
GRANT ALL ON FUNCTION public.tg_remates_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.tg_remates_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.tg_remates_set_updated_at() TO service_role;

-- FUNCTION vector_accum(double precision[], public.vector)
GRANT ALL ON FUNCTION public.vector_accum(double precision[], public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_accum(double precision[], public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_accum(double precision[], public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_accum(double precision[], public.vector) TO service_role;

-- FUNCTION vector_add(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_add(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_add(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_add(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_add(public.vector, public.vector) TO service_role;

-- FUNCTION vector_avg(double precision[])
GRANT ALL ON FUNCTION public.vector_avg(double precision[]) TO postgres;
GRANT ALL ON FUNCTION public.vector_avg(double precision[]) TO anon;
GRANT ALL ON FUNCTION public.vector_avg(double precision[]) TO authenticated;
GRANT ALL ON FUNCTION public.vector_avg(double precision[]) TO service_role;

-- FUNCTION vector_cmp(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_cmp(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_cmp(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_cmp(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_cmp(public.vector, public.vector) TO service_role;

-- FUNCTION vector_combine(double precision[], double precision[])
GRANT ALL ON FUNCTION public.vector_combine(double precision[], double precision[]) TO postgres;
GRANT ALL ON FUNCTION public.vector_combine(double precision[], double precision[]) TO anon;
GRANT ALL ON FUNCTION public.vector_combine(double precision[], double precision[]) TO authenticated;
GRANT ALL ON FUNCTION public.vector_combine(double precision[], double precision[]) TO service_role;

-- FUNCTION vector_concat(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_concat(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_concat(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_concat(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_concat(public.vector, public.vector) TO service_role;

-- FUNCTION vector_dims(public.halfvec)
GRANT ALL ON FUNCTION public.vector_dims(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.vector_dims(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.vector_dims(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.vector_dims(public.halfvec) TO service_role;

-- FUNCTION vector_dims(public.vector)
GRANT ALL ON FUNCTION public.vector_dims(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_dims(public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_dims(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_dims(public.vector) TO service_role;

-- FUNCTION vector_eq(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_eq(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_eq(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_eq(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_eq(public.vector, public.vector) TO service_role;

-- FUNCTION vector_ge(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_ge(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_ge(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_ge(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_ge(public.vector, public.vector) TO service_role;

-- FUNCTION vector_gt(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_gt(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_gt(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_gt(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_gt(public.vector, public.vector) TO service_role;

-- FUNCTION vector_l2_squared_distance(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_l2_squared_distance(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_l2_squared_distance(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_l2_squared_distance(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_l2_squared_distance(public.vector, public.vector) TO service_role;

-- FUNCTION vector_le(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_le(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_le(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_le(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_le(public.vector, public.vector) TO service_role;

-- FUNCTION vector_lt(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_lt(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_lt(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_lt(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_lt(public.vector, public.vector) TO service_role;

-- FUNCTION vector_mul(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_mul(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_mul(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_mul(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_mul(public.vector, public.vector) TO service_role;

-- FUNCTION vector_ne(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_ne(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_ne(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_ne(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_ne(public.vector, public.vector) TO service_role;

-- FUNCTION vector_negative_inner_product(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_negative_inner_product(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_negative_inner_product(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_negative_inner_product(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_negative_inner_product(public.vector, public.vector) TO service_role;

-- FUNCTION vector_norm(public.vector)
GRANT ALL ON FUNCTION public.vector_norm(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_norm(public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_norm(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_norm(public.vector) TO service_role;

-- FUNCTION vector_spherical_distance(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_spherical_distance(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_spherical_distance(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_spherical_distance(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_spherical_distance(public.vector, public.vector) TO service_role;

-- FUNCTION vector_sub(public.vector, public.vector)
GRANT ALL ON FUNCTION public.vector_sub(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_sub(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_sub(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_sub(public.vector, public.vector) TO service_role;

-- FUNCTION avg(public.halfvec)
GRANT ALL ON FUNCTION public.avg(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.avg(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.avg(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.avg(public.halfvec) TO service_role;

-- FUNCTION avg(public.vector)
GRANT ALL ON FUNCTION public.avg(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.avg(public.vector) TO anon;
GRANT ALL ON FUNCTION public.avg(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.avg(public.vector) TO service_role;

-- FUNCTION sum(public.halfvec)
GRANT ALL ON FUNCTION public.sum(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.sum(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.sum(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.sum(public.halfvec) TO service_role;

-- FUNCTION sum(public.vector)
GRANT ALL ON FUNCTION public.sum(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.sum(public.vector) TO anon;
GRANT ALL ON FUNCTION public.sum(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.sum(public.vector) TO service_role;

-- TABLE document_metadata
GRANT ALL ON TABLE public.document_metadata TO anon;
GRANT ALL ON TABLE public.document_metadata TO authenticated;
GRANT ALL ON TABLE public.document_metadata TO service_role;

-- TABLE document_rows
GRANT ALL ON TABLE public.document_rows TO anon;
GRANT ALL ON TABLE public.document_rows TO authenticated;
GRANT ALL ON TABLE public.document_rows TO service_role;

-- SEQUENCE document_rows_id_seq
GRANT ALL ON SEQUENCE public.document_rows_id_seq TO anon;
GRANT ALL ON SEQUENCE public.document_rows_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.document_rows_id_seq TO service_role;

-- TABLE documents
GRANT ALL ON TABLE public.documents TO anon;
GRANT ALL ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;

-- SEQUENCE documents_id_seq
GRANT ALL ON SEQUENCE public.documents_id_seq TO anon;
GRANT ALL ON SEQUENCE public.documents_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.documents_id_seq TO service_role;

-- TABLE inmuebles
GRANT ALL ON TABLE public.inmuebles TO anon;
GRANT ALL ON TABLE public.inmuebles TO authenticated;
GRANT ALL ON TABLE public.inmuebles TO service_role;

-- TABLE memories
GRANT ALL ON TABLE public.memories TO anon;
GRANT ALL ON TABLE public.memories TO authenticated;
GRANT ALL ON TABLE public.memories TO service_role;

-- SEQUENCE memories_id_seq
GRANT ALL ON SEQUENCE public.memories_id_seq TO anon;
GRANT ALL ON SEQUENCE public.memories_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.memories_id_seq TO service_role;

-- TABLE n8n_chat_histories
GRANT ALL ON TABLE public.n8n_chat_histories TO anon;
GRANT ALL ON TABLE public.n8n_chat_histories TO authenticated;
GRANT ALL ON TABLE public.n8n_chat_histories TO service_role;

-- SEQUENCE n8n_chat_histories_id_seq
GRANT ALL ON SEQUENCE public.n8n_chat_histories_id_seq TO anon;
GRANT ALL ON SEQUENCE public.n8n_chat_histories_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.n8n_chat_histories_id_seq TO service_role;

-- TABLE oportunidades_historial
GRANT ALL ON TABLE public.oportunidades_historial TO anon;
GRANT ALL ON TABLE public.oportunidades_historial TO authenticated;
GRANT ALL ON TABLE public.oportunidades_historial TO service_role;

-- TABLE oportunidades_publicas
GRANT ALL ON TABLE public.oportunidades_publicas TO anon;
GRANT ALL ON TABLE public.oportunidades_publicas TO authenticated;
GRANT ALL ON TABLE public.oportunidades_publicas TO service_role;

-- TABLE oportunidades_stats
GRANT ALL ON TABLE public.oportunidades_stats TO anon;
GRANT ALL ON TABLE public.oportunidades_stats TO authenticated;
GRANT ALL ON TABLE public.oportunidades_stats TO service_role;

-- TABLE precios_mercado
GRANT ALL ON TABLE public.precios_mercado TO anon;
GRANT ALL ON TABLE public.precios_mercado TO authenticated;
GRANT ALL ON TABLE public.precios_mercado TO service_role;

-- TABLE price_history
GRANT ALL ON TABLE public.price_history TO anon;
GRANT ALL ON TABLE public.price_history TO authenticated;
GRANT ALL ON TABLE public.price_history TO service_role;

-- TABLE radar_cron_jobs
GRANT ALL ON TABLE public.radar_cron_jobs TO anon;
GRANT ALL ON TABLE public.radar_cron_jobs TO authenticated;
GRANT ALL ON TABLE public.radar_cron_jobs TO service_role;

-- TABLE radar_parametros_gastos
GRANT ALL ON TABLE public.radar_parametros_gastos TO anon;
GRANT ALL ON TABLE public.radar_parametros_gastos TO authenticated;
GRANT ALL ON TABLE public.radar_parametros_gastos TO service_role;

-- TABLE radar_payments
GRANT ALL ON TABLE public.radar_payments TO service_role;

-- TABLE radar_sesiones_scraper
GRANT ALL ON TABLE public.radar_sesiones_scraper TO anon;
GRANT ALL ON TABLE public.radar_sesiones_scraper TO authenticated;
GRANT ALL ON TABLE public.radar_sesiones_scraper TO service_role;

-- TABLE radar_zonas_monitoreadas
GRANT ALL ON TABLE public.radar_zonas_monitoreadas TO anon;
GRANT ALL ON TABLE public.radar_zonas_monitoreadas TO authenticated;
GRANT ALL ON TABLE public.radar_zonas_monitoreadas TO service_role;

-- TABLE remates
GRANT ALL ON TABLE public.remates TO anon;
GRANT ALL ON TABLE public.remates TO authenticated;
GRANT ALL ON TABLE public.remates TO service_role;

-- TABLE rental_listings
GRANT ALL ON TABLE public.rental_listings TO anon;
GRANT ALL ON TABLE public.rental_listings TO authenticated;
GRANT ALL ON TABLE public.rental_listings TO service_role;

-- TABLE scraping_logs
GRANT ALL ON TABLE public.scraping_logs TO anon;
GRANT ALL ON TABLE public.scraping_logs TO authenticated;
GRANT ALL ON TABLE public.scraping_logs TO service_role;

-- SEQUENCE scraping_logs_id_seq
GRANT ALL ON SEQUENCE public.scraping_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.scraping_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.scraping_logs_id_seq TO service_role;


-- ═══════════ DEFAULT ACL ═══════════

-- DEFAULT PRIVILEGES FOR SEQUENCES
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- DEFAULT PRIVILEGES FOR SEQUENCES
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- DEFAULT PRIVILEGES FOR FUNCTIONS
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- DEFAULT PRIVILEGES FOR FUNCTIONS
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- DEFAULT PRIVILEGES FOR TABLES
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- DEFAULT PRIVILEGES FOR TABLES
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


-- ═══════════ COMMENT ═══════════

-- FUNCTION mark_stale_inmuebles(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer)
COMMENT ON FUNCTION public.mark_stale_inmuebles(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) IS 'Sube times_missed e inactiva inmuebles no vistos en el run actual (soft-delete con grace period)';

-- FUNCTION mark_stale_remates(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer)
COMMENT ON FUNCTION public.mark_stale_remates(p_source text, p_country text, p_run_start timestamp with time zone, p_threshold integer) IS 'Sube times_missed e inactiva remates no vistos en el run actual (soft-delete con grace period)';

-- COLUMN inmuebles.is_high
COMMENT ON COLUMN public.inmuebles.is_high IS 'Oportunidad de señal fuerte: decil más barato por m², descuento grande y comparables homogéneos. Lo escribe engine/run.ts.';

-- COLUMN inmuebles.crece_index
COMMENT ON COLUMN public.inmuebles.crece_index IS 'Índice CRECE = precio/m² ÷ mediana(precio/m² del grupo comparable FincaRaíz). 0,70 = 30% bajo la mediana de su zona.';

-- COLUMN inmuebles.crece_tier
COMMENT ON COLUMN public.inmuebles.crece_tier IS 'Categoría de la tabla maestra: oportunidad_fuerte | oportunidad | interesante | abajo_mercado | mercado_borde_bajo | mercado | limite_superior | arriba_mercado | sobreprecio | sobrevalorado | fuera_mercado.';

-- COLUMN inmuebles.cascada_nivel
COMMENT ON COLUMN public.inmuebles.cascada_nivel IS 'Nivel de la cascada con el que se consiguió la muestra: barrio | zona_ampliada | ciudad. Sirve para auditar qué tan confiable es cada clasificación.';

-- COLUMN inmuebles.fecha_publicacion_fuente
COMMENT ON COLUMN public.inmuebles.fecha_publicacion_fuente IS 'Fecha de actualización que reporta el portal. Informativa: el anunciante puede resetearla renovando el aviso.';

-- COLUMN inmuebles.estado
COMMENT ON COLUMN public.inmuebles.estado IS 'activo | expirado_30d | retirado | descartado_90d. Solo "activo" se muestra en oportunidades.';

-- TABLE oportunidades_historial
COMMENT ON TABLE public.oportunidades_historial IS 'Eventos del ciclo de vida de cada oportunidad. La regla de 30 días NO aplica a activos bancarios: su rotación real es de meses y despublicarlos por antigüedad borraría inventario válido.';

-- TABLE price_history
COMMENT ON TABLE public.price_history IS 'Historial de precios por inmueble. Poblada solo por trigger inmuebles_log_price_history. Señal de oportunidad: change_kind=decrease.';

-- TABLE radar_cron_jobs
COMMENT ON TABLE public.radar_cron_jobs IS 'Calendario de scraping. Cadencia en días: 7 para portal y remates, 15 para activos bancarios (los bancos rotan mucho más lento).';

-- TABLE radar_parametros_gastos
COMMENT ON TABLE public.radar_parametros_gastos IS 'Porcentajes de gastos de escrituración de la calculadora. Una sola fila (id = ''vigente''). Si la tabla no existe o falla la lectura, el servidor sigue con los valores por defecto compilados.';

-- COLUMN radar_parametros_gastos.notaria
COMMENT ON COLUMN public.radar_parametros_gastos.notaria IS 'Fracción del valor que paga el COMPRADOR en notaría. La tarifa notarial completa (~0,54 %) se reparte 50/50 entre las partes: por eso el valor por defecto es 0,0027 y no 0,0054.';

-- COLUMN radar_parametros_gastos.impuesto_registro
COMMENT ON COLUMN public.radar_parametros_gastos.impuesto_registro IS 'Impuesto de registro departamental (beneficencia). Lo fija cada departamento; por eso esta tabla existe.';

-- COLUMN radar_parametros_gastos.derechos_registro
COMMENT ON COLUMN public.radar_parametros_gastos.derechos_registro IS 'Derechos de registro de la Oficina de Registro de Instrumentos Públicos.';

-- TABLE radar_payments
COMMENT ON TABLE public.radar_payments IS 'Intentos y conciliación de pagos Radar Pro en Wompi Sandbox; acceso exclusivo del backend.';

-- TABLE radar_sesiones_scraper
COMMENT ON TABLE public.radar_sesiones_scraper IS 'Sesiones autenticadas de scrapers. El login es manual (captcha); esto solo la transporta al contenedor.';

-- COLUMN radar_sesiones_scraper.actualizado_en
COMMENT ON COLUMN public.radar_sesiones_scraper.actualizado_en IS 'Cuándo se hizo el login. Sirve para saber si conviene renovarla antes de que expire sola.';

-- TABLE radar_zonas_monitoreadas
COMMENT ON TABLE public.radar_zonas_monitoreadas IS 'Catálogo de zonas + criterios de elegibilidad (no scheduler). Define URLs del portal abierto y rangos precio/área/estrato para clasificar oportunidades.';

-- COLUMN radar_zonas_monitoreadas.nivel
COMMENT ON COLUMN public.radar_zonas_monitoreadas.nivel IS 'Nivel de ciudad del Radar CRECE: 1 = gran capital (tope $500M), 2 = intermedia (tope $400M).';

-- TABLE remates
COMMENT ON TABLE public.remates IS 'Avisos de remates judiciales scrapeados periódicamente. Un aviso = una fila. first_seen_at/last_seen_at/is_active permiten reportar nuevos vs salidos vs activos.';

-- COLUMN remates.origen_demandante
COMMENT ON COLUMN public.remates.origen_demandante IS 'bancario | particular_otro. Si el aviso no permite determinarlo queda null y se trata como particular_otro (perfil conservador).';

-- COLUMN remates.tipo_proceso
COMMENT ON COLUMN public.remates.tipo_proceso IS 'ejecutivo_hipotecario | otro. Informativo: se muestra en la ficha pero NO determina si el remate es gratis o de pago.';

-- COLUMN remates.cuota_parte
COMMENT ON COLUMN public.remates.cuota_parte IS 'Porcentaje del bien que se remata. 100 = dominio pleno. Cualquier valor distinto dispara la alerta jurídica amarilla.';

-- TABLE rental_listings
COMMENT ON TABLE public.rental_listings IS 'Ofertas mensuales de arriendo usadas como comparables internos; no se mezclan con inventario de venta.';

-- INDEX inmuebles_features_bedrooms_idx
COMMENT ON INDEX public.inmuebles_features_bedrooms_idx IS 'Filtro de habitaciones del listado. La expresión usa -> (jsonb), no ->>: en texto ''11'' < ''2''.';

-- INDEX inmuebles_features_stratum_idx
COMMENT ON INDEX public.inmuebles_features_stratum_idx IS 'Filtro de estrato del listado. Misma razón que el de habitaciones.';

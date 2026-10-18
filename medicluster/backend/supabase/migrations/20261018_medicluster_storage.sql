-- Private MediCluster application storage. Dispatch infrastructure is untouched.
BEGIN;

CREATE TABLE IF NOT EXISTS public.medicluster_records (
  collection text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (collection, id),
  CONSTRAINT medicluster_document_identity CHECK (
    jsonb_typeof(data) = 'object' AND data ? '_id' AND jsonb_typeof(data -> '_id') = 'string' AND data ->> '_id' = id
  )
);
ALTER TABLE public.medicluster_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.medicluster_records FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS medicluster_records_data ON public.medicluster_records USING gin(data jsonb_path_ops);
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_users_email ON public.medicluster_records (lower(btrim(data ->> 'email'))) WHERE collection = 'users';
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_profiles_patient ON public.medicluster_records ((data -> 'patientId')) WHERE collection = 'patientprofiles';
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_profiles_email ON public.medicluster_records (lower(btrim(data ->> 'email'))) WHERE collection = 'patientprofiles' AND data ? 'email';
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_profiles_email_null ON public.medicluster_records ((data -> 'email')) WHERE collection = 'patientprofiles' AND data -> 'email' = 'null'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_profiles_mobile ON public.medicluster_records ((data -> 'mobile')) WHERE collection = 'patientprofiles' AND data ? 'mobile';
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_profiles_google ON public.medicluster_records ((data -> 'googleSubject')) WHERE collection = 'patientprofiles' AND data ? 'googleSubject';
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_ambulance_identity ON public.medicluster_records ((data -> 'ambulanceId')) WHERE collection = 'ambulances';
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_hospital_identity ON public.medicluster_records ((data -> 'hospitalId')) WHERE collection = 'hospitals';
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_dispatch_identity ON public.medicluster_records ((data -> 'dispatch_id')) WHERE collection = 'dispatches';
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_incident_patient_tag ON public.medicluster_records ((data -> 'patient_tag')) WHERE collection = 'incidentpatients';
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_config_key ON public.medicluster_records ((data -> 'key')) WHERE collection = 'systemconfigs';
CREATE UNIQUE INDEX IF NOT EXISTS medicluster_alert_ack ON public.medicluster_records ((data -> 'userId'), (data -> 'alertId')) WHERE collection = 'alertacks';
CREATE INDEX IF NOT EXISTS medicluster_records_created ON public.medicluster_records (collection, (data ->> 'createdAt'));
CREATE INDEX IF NOT EXISTS medicluster_records_patient ON public.medicluster_records (collection, (data ->> 'patientId'));
CREATE INDEX IF NOT EXISTS medicluster_records_expiry ON public.medicluster_records (collection, (data ->> 'expiresAt'));
CREATE INDEX IF NOT EXISTS medicluster_sms_claim ON public.medicluster_records ((data ->> 'status'), (data ->> 'createdAt')) WHERE collection = 'smsjobs';

-- Filter grammar is deliberately finite. User input is never interpreted as SQL.
CREATE OR REPLACE FUNCTION public.mc_validate_filter(p_filter jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE field record; operation record; clause jsonb;
BEGIN
  IF jsonb_typeof(p_filter) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Filter must be an object'; END IF;
  FOR field IN SELECT * FROM jsonb_each(p_filter) LOOP
    IF field.key IN ('$and', '$or', '$nor') THEN
      IF jsonb_typeof(field.value) <> 'array' THEN RAISE EXCEPTION 'Logical filter must be an array'; END IF;
      FOR clause IN SELECT * FROM jsonb_array_elements(field.value) LOOP PERFORM public.mc_validate_filter(clause); END LOOP;
    ELSIF left(field.key, 1) = '$' THEN RAISE EXCEPTION 'Unsupported filter operator: %', field.key;
    ELSIF jsonb_typeof(field.value) = 'object' AND EXISTS (SELECT 1 FROM jsonb_object_keys(field.value) k WHERE left(k, 1) = '$') THEN
      FOR operation IN SELECT * FROM jsonb_each(field.value) LOOP
        IF operation.key NOT IN ('$eq', '$ne', '$exists', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$not', '$elemMatch') THEN RAISE EXCEPTION 'Unsupported filter operator: %', operation.key; END IF;
        IF operation.key = '$not' THEN PERFORM public.mc_validate_filter(jsonb_build_object('value', operation.value)); END IF;
        IF operation.key = '$elemMatch' THEN PERFORM public.mc_validate_filter(operation.value); END IF;
        IF operation.key IN ('$in', '$nin') AND jsonb_typeof(operation.value) <> 'array' THEN RAISE EXCEPTION '$in/$nin requires array'; END IF;
        IF operation.key = '$exists' AND jsonb_typeof(operation.value) <> 'boolean' THEN RAISE EXCEPTION '$exists requires boolean'; END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.mc_matches(p_data jsonb, p_filter jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE item record; clause jsonb; actual jsonb; op record; candidate jsonb; matched boolean;
BEGIN
  IF jsonb_typeof(p_filter) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Filter must be an object'; END IF;
  FOR item IN SELECT * FROM jsonb_each(p_filter) LOOP
    IF item.key IN ('$and', '$or', '$nor') THEN
      IF jsonb_typeof(item.value) <> 'array' THEN RAISE EXCEPTION 'Logical filter must be an array'; END IF;
      matched := item.key <> '$or';
      FOR clause IN SELECT * FROM jsonb_array_elements(item.value) LOOP
        IF item.key = '$and' THEN matched := public.mc_matches(p_data, clause) AND matched;
        ELSIF item.key = '$or' THEN matched := public.mc_matches(p_data, clause) OR matched;
        ELSE matched := NOT public.mc_matches(p_data, clause) AND matched;
        END IF;
      END LOOP;
      IF NOT matched THEN RETURN false; END IF;
    ELSIF left(item.key, 1) = '$' THEN
      RAISE EXCEPTION 'Unsupported filter operator: %', item.key;
    ELSE
      actual := p_data #> string_to_array(item.key, '.');
      IF jsonb_typeof(item.value) = 'object' AND EXISTS (SELECT 1 FROM jsonb_object_keys(item.value) k WHERE left(k, 1) = '$') THEN
        FOR op IN SELECT * FROM jsonb_each(item.value) LOOP
          CASE op.key
            WHEN '$eq' THEN matched := coalesce(actual = op.value, op.value = 'null'::jsonb) OR coalesce(jsonb_typeof(actual) = 'array' AND actual @> jsonb_build_array(op.value), false);
            WHEN '$ne' THEN matched := NOT (coalesce(actual = op.value, op.value = 'null'::jsonb) OR coalesce(jsonb_typeof(actual) = 'array' AND actual @> jsonb_build_array(op.value), false));
            WHEN '$exists' THEN
              IF jsonb_typeof(op.value) <> 'boolean' THEN RAISE EXCEPTION '$exists requires boolean'; END IF;
              matched := (actual IS NOT NULL) = (op.value = 'true'::jsonb);
            WHEN '$gt' THEN matched := actual IS NOT NULL AND jsonb_typeof(actual) = jsonb_typeof(op.value) AND actual > op.value;
            WHEN '$gte' THEN matched := actual IS NOT NULL AND jsonb_typeof(actual) = jsonb_typeof(op.value) AND actual >= op.value;
            WHEN '$lt' THEN matched := actual IS NOT NULL AND jsonb_typeof(actual) = jsonb_typeof(op.value) AND actual < op.value;
            WHEN '$lte' THEN matched := actual IS NOT NULL AND jsonb_typeof(actual) = jsonb_typeof(op.value) AND actual <= op.value;
            WHEN '$in', '$nin' THEN
              IF jsonb_typeof(op.value) <> 'array' THEN RAISE EXCEPTION '$in/$nin requires array'; END IF;
              matched := false;
              FOR candidate IN SELECT * FROM jsonb_array_elements(op.value) LOOP
                IF coalesce(actual = candidate, candidate = 'null'::jsonb) OR
                   (jsonb_typeof(actual) = 'array' AND actual @> jsonb_build_array(candidate)) THEN matched := true; END IF;
              END LOOP;
              IF op.key = '$nin' THEN matched := NOT matched; END IF;
            WHEN '$not' THEN matched := NOT public.mc_matches(CASE WHEN actual IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('value', actual) END, jsonb_build_object('value', op.value));
            WHEN '$elemMatch' THEN
              matched := false;
              IF jsonb_typeof(actual) = 'array' THEN
                FOR candidate IN SELECT * FROM jsonb_array_elements(actual) LOOP
                  IF public.mc_matches(candidate, op.value) THEN matched := true; END IF;
                END LOOP;
              END IF;
            ELSE RAISE EXCEPTION 'Unsupported filter operator: %', op.key;
          END CASE;
          IF NOT coalesce(matched, false) THEN RETURN false; END IF;
        END LOOP;
      ELSE
        IF NOT (coalesce(actual = item.value, item.value = 'null'::jsonb) OR
          coalesce(jsonb_typeof(actual) = 'array' AND actual @> jsonb_build_array(item.value), false)) THEN RETURN false; END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.mc_set_path(p_data jsonb, p_path text[], p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE part jsonb;
BEGIN
  IF cardinality(p_path) = 0 OR p_path[1] = '' THEN RAISE EXCEPTION 'Invalid update path'; END IF;
  IF cardinality(p_path) = 1 THEN RETURN jsonb_set(p_data, p_path, p_value, true); END IF;
  part := p_data -> p_path[1];
  IF part IS NULL OR part = 'null'::jsonb THEN part := '{}'::jsonb; END IF;
  IF jsonb_typeof(part) <> 'object' THEN RAISE EXCEPTION 'Nested update requires an object'; END IF;
  RETURN jsonb_set(p_data, ARRAY[p_path[1]], public.mc_set_path(part, p_path[2:], p_value), true);
END $$;

CREATE OR REPLACE FUNCTION public.mc_apply_update(p_data jsonb, p_update jsonb, p_insert boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE operation record; field record; old_value jsonb; values_to_add jsonb; element jsonb; result jsonb := p_data; update_doc jsonb := p_update;
BEGIN
  IF jsonb_typeof(update_doc) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Update must be an object'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(update_doc) k WHERE left(k, 1) = '$') THEN update_doc := jsonb_build_object('$set', update_doc); END IF;
  FOR operation IN SELECT * FROM jsonb_each(update_doc) LOOP
    IF operation.key NOT IN ('$set', '$unset', '$inc', '$push', '$addToSet', '$setOnInsert') THEN RAISE EXCEPTION 'Unsupported update operator: %', operation.key; END IF;
    IF jsonb_typeof(operation.value) <> 'object' THEN RAISE EXCEPTION 'Update operator requires object'; END IF;
    IF operation.key = '$setOnInsert' AND NOT p_insert THEN CONTINUE; END IF;
    FOR field IN SELECT * FROM jsonb_each(operation.value) LOOP
      IF field.key = '_id' OR field.key LIKE '_id.%' THEN
        IF p_insert AND operation.key IN ('$set', '$setOnInsert') AND result -> '_id' IS NULL THEN result := result || jsonb_build_object('_id', field.value); CONTINUE; END IF;
        IF result -> '_id' = field.value AND operation.key IN ('$set', '$setOnInsert') THEN CONTINUE; END IF;
        RAISE EXCEPTION '_id is immutable';
      END IF;
      IF field.key = '' OR left(field.key, 1) = '$' OR field.key LIKE '%.%.%' AND position('..' IN field.key) > 0 THEN RAISE EXCEPTION 'Invalid update path'; END IF;
      old_value := result #> string_to_array(field.key, '.');
      CASE operation.key
        WHEN '$set', '$setOnInsert' THEN result := public.mc_set_path(result, string_to_array(field.key, '.'), field.value);
        WHEN '$unset' THEN result := result #- string_to_array(field.key, '.');
        WHEN '$inc' THEN
          IF jsonb_typeof(field.value) <> 'number' OR (old_value IS NOT NULL AND jsonb_typeof(old_value) <> 'number') THEN RAISE EXCEPTION '$inc requires numeric fields'; END IF;
          result := public.mc_set_path(result, string_to_array(field.key, '.'), to_jsonb(coalesce((old_value #>> '{}')::numeric, 0) + (field.value #>> '{}')::numeric));
        WHEN '$push', '$addToSet' THEN
          IF old_value IS NULL THEN old_value := '[]'::jsonb; END IF;
          IF jsonb_typeof(old_value) <> 'array' THEN RAISE EXCEPTION 'Array update requires an array'; END IF;
          IF jsonb_typeof(field.value) = 'object' AND field.value ? '$each' THEN
            IF jsonb_typeof(field.value -> '$each') <> 'array' OR (SELECT count(*) FROM jsonb_object_keys(field.value)) <> 1 THEN RAISE EXCEPTION 'Unsupported array update modifier'; END IF;
            values_to_add := field.value -> '$each';
          ELSE values_to_add := jsonb_build_array(field.value);
          END IF;
          FOR element IN SELECT * FROM jsonb_array_elements(values_to_add) LOOP
            IF operation.key = '$push' OR NOT old_value @> jsonb_build_array(element) THEN old_value := old_value || jsonb_build_array(element); END IF;
          END LOOP;
          result := public.mc_set_path(result, string_to_array(field.key, '.'), old_value);
      END CASE;
    END LOOP;
  END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.mc_order_sql(p_sort jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE pair jsonb; ordered_sort jsonb := p_sort; result text := '';
BEGIN
  -- JSONB objects discard insertion order. Compound sorts must use ordered
  -- [field,direction] pairs so clinical priority remains ahead of tie breakers.
  IF jsonb_typeof(p_sort) = 'object' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(p_sort)) > 1 THEN RAISE EXCEPTION 'Compound sort requires ordered field/direction pairs'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_array(key, value)), '[]'::jsonb) INTO ordered_sort FROM jsonb_each(p_sort);
  ELSIF jsonb_typeof(p_sort) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Sort must be an ordered array'; END IF;
  FOR pair IN SELECT value FROM jsonb_array_elements(ordered_sort) WITH ORDINALITY AS entries(value, position) ORDER BY position LOOP
    IF jsonb_typeof(pair) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Sort entry must be a field/direction pair'; END IF;
    IF jsonb_array_length(pair) <> 2 OR jsonb_typeof(pair -> 0) <> 'string' OR pair ->> 0 = '' THEN RAISE EXCEPTION 'Sort entry must be a field/direction pair'; END IF;
    IF pair -> 1 NOT IN ('1'::jsonb, '-1'::jsonb) THEN RAISE EXCEPTION 'Sort direction must be 1 or -1'; END IF;
    result := result || format('data #> %L::text[] %s, ', string_to_array(pair ->> 0, '.')::text,
      CASE WHEN pair -> 1 = '1'::jsonb THEN 'ASC NULLS FIRST' ELSE 'DESC NULLS LAST' END);
  END LOOP;
  RETURN result || 'id ASC';
END $$;

CREATE OR REPLACE FUNCTION public.mc_find(p_collection text, p_filter jsonb DEFAULT '{}'::jsonb, p_sort jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT NULL, p_skip integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result jsonb;
BEGIN
  IF p_limit < 0 OR p_skip < 0 THEN RAISE EXCEPTION 'Pagination must be nonnegative'; END IF;
  PERFORM public.mc_validate_filter(p_filter);
  EXECUTE 'SELECT coalesce(jsonb_agg(data), ''[]''::jsonb) FROM (SELECT data FROM public.medicluster_records WHERE collection=$1 AND public.mc_matches(data, $2) ORDER BY '
    || public.mc_order_sql(p_sort) || ' LIMIT $3 OFFSET $4) documents'
    INTO result USING p_collection, p_filter, p_limit, p_skip;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.mc_count(p_collection text, p_filter jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.mc_validate_filter(p_filter);
  RETURN (SELECT count(*) FROM public.medicluster_records WHERE collection=p_collection AND public.mc_matches(data, p_filter));
END $$;

CREATE OR REPLACE FUNCTION public.mc_write(p_collection text, p_action text, p_filter jsonb DEFAULT '{}'::jsonb, p_update jsonb DEFAULT '{}'::jsonb, p_document jsonb DEFAULT '{}'::jsonb, p_upsert boolean DEFAULT false, p_return_new boolean DEFAULT true, p_sort jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE target record; result jsonb; new_data jsonb; seed jsonb; field record; matched integer := 0; modified integer := 0;
BEGIN
  IF p_collection IS NULL OR p_collection = '' THEN RAISE EXCEPTION 'Collection required'; END IF;
  IF p_action NOT IN ('insert', 'update', 'update_many', 'delete', 'delete_many') THEN RAISE EXCEPTION 'Unsupported write action'; END IF;
  -- Every conditional mutation and upsert rechecks its predicate under the same
  -- transaction lock. Concurrent OTP, OAuth and SMS requests cannot both win.
  PERFORM pg_advisory_xact_lock(hashtextextended('medicluster:' || p_collection, 0));
  IF p_action = 'insert' THEN
    IF jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR coalesce(p_document ->> '_id', '') = '' THEN RAISE EXCEPTION 'Document _id required'; END IF;
    INSERT INTO public.medicluster_records(collection, id, data) VALUES(p_collection, p_document ->> '_id', p_document);
    RETURN p_document;
  END IF;
  PERFORM public.mc_validate_filter(p_filter);
  IF p_action IN ('update', 'update_many') THEN PERFORM public.mc_apply_update('{}'::jsonb, p_update, false); END IF;
  FOR target IN EXECUTE 'SELECT id, data FROM public.medicluster_records WHERE collection=$1 AND public.mc_matches(data, $2) ORDER BY '
    || public.mc_order_sql(p_sort) || CASE WHEN p_action IN ('update', 'delete') THEN ' LIMIT 1' ELSE '' END || ' FOR UPDATE'
    USING p_collection, p_filter LOOP
    matched := matched + 1;
    IF p_action IN ('delete', 'delete_many') THEN
      DELETE FROM public.medicluster_records WHERE collection=p_collection AND id=target.id;
      result := target.data;
    ELSE
      new_data := public.mc_apply_update(target.data, p_update, false);
      IF new_data IS DISTINCT FROM target.data THEN
        UPDATE public.medicluster_records SET data=new_data WHERE collection=p_collection AND id=target.id;
        modified := modified + 1;
      END IF;
      result := CASE WHEN p_return_new THEN new_data ELSE target.data END;
    END IF;
  END LOOP;
  IF matched = 0 AND p_upsert AND p_action IN ('update', 'update_many') THEN
    seed := '{}'::jsonb;
    FOR field IN SELECT * FROM jsonb_each(p_filter) LOOP
      IF left(field.key, 1) <> '$' AND NOT (jsonb_typeof(field.value) = 'object' AND EXISTS (SELECT 1 FROM jsonb_object_keys(field.value) k WHERE left(k, 1) = '$')) THEN
        seed := public.mc_set_path(seed, string_to_array(field.key, '.'), field.value);
      END IF;
    END LOOP;
    seed := seed || p_document;
    new_data := public.mc_apply_update(seed, p_update, true);
    IF NOT new_data ? '_id' THEN new_data := new_data || jsonb_build_object('_id', substr(md5(random()::text || clock_timestamp()::text), 1, 24)); END IF;
    INSERT INTO public.medicluster_records(collection, id, data) VALUES(p_collection, new_data ->> '_id', new_data);
    result := CASE WHEN p_return_new THEN new_data ELSE NULL END;
  END IF;
  IF p_action = 'update_many' THEN RETURN jsonb_build_object('matchedCount', matched, 'modifiedCount', modified); END IF;
  IF p_action = 'delete_many' THEN RETURN jsonb_build_object('deletedCount', matched); END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.mc_reserve_email(p_hash text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE previous jsonb; requests jsonb; latest timestamptz; accepted boolean; current_time_utc timestamptz; limit_id text := 'email:' || p_hash;
BEGIN
  IF p_hash IS NULL OR p_hash = '' THEN RAISE EXCEPTION 'Recipient hash required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('medicluster:patientauthlimits', 0));
  current_time_utc := clock_timestamp();
  SELECT data INTO previous FROM public.medicluster_records WHERE collection='patientauthlimits' AND id=limit_id FOR UPDATE;
  SELECT coalesce(jsonb_agg(value ORDER BY (value #>> '{}')::timestamptz), '[]'::jsonb), max((value #>> '{}')::timestamptz)
    INTO requests, latest FROM jsonb_array_elements(coalesce(previous -> 'requests', '[]'::jsonb))
    WHERE (value #>> '{}')::timestamptz > current_time_utc - interval '1 hour';
  accepted := jsonb_array_length(requests) < 5 AND (latest IS NULL OR latest <= current_time_utc - interval '30 seconds');
  IF accepted THEN requests := requests || jsonb_build_array(current_time_utc); END IF;
  INSERT INTO public.medicluster_records(collection, id, data)
    VALUES('patientauthlimits', limit_id, jsonb_build_object('_id', limit_id, 'requests', requests, 'accepted', accepted, 'expiresAt', current_time_utc + interval '1 hour'))
    ON CONFLICT (collection, id) DO UPDATE SET data=EXCLUDED.data;
  RETURN accepted;
END $$;

-- Invoke periodically from a backend scheduler. This replaces the former TTL
-- indexes without depending on pg_cron or touching clinical/dispatch records.
CREATE OR REPLACE FUNCTION public.mc_cleanup_expired(p_limit integer DEFAULT 1000)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE removed bigint;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN RAISE EXCEPTION 'Cleanup limit must be between 1 and 10000'; END IF;
  WITH expired AS (
    SELECT collection, id FROM public.medicluster_records
    WHERE collection IN ('patientotps', 'patientemailotps', 'patientgoogleflows', 'patientloginexchanges', 'patientauthlimits', 'smsjobs')
      AND (data ->> 'expiresAt')::timestamptz <= clock_timestamp()
    ORDER BY collection, id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.medicluster_records r USING expired e WHERE r.collection=e.collection AND r.id=e.id RETURNING r.id
  ) SELECT count(*) INTO removed FROM deleted;
  RETURN removed;
END $$;

-- PostgreSQL grants new functions to PUBLIC by default: explicitly revoke every
-- helper and RPC, then grant only the backend role. No existing roles are changed.
REVOKE ALL ON FUNCTION public.mc_matches(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_validate_filter(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_set_path(jsonb, text[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_apply_update(jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_order_sql(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_find(text, jsonb, jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_count(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_write(text, text, jsonb, jsonb, jsonb, boolean, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_reserve_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_cleanup_expired(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mc_validate_filter(jsonb), public.mc_matches(jsonb, jsonb), public.mc_set_path(jsonb, text[], jsonb), public.mc_apply_update(jsonb, jsonb, boolean), public.mc_order_sql(jsonb),
  public.mc_find(text, jsonb, jsonb, integer, integer), public.mc_count(text, jsonb),
  public.mc_write(text, text, jsonb, jsonb, jsonb, boolean, boolean, jsonb), public.mc_reserve_email(text), public.mc_cleanup_expired(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Requires the existing CAD schema. Reuses shared incidents/fleet/timeline tables.
-- Caller privileges and RLS remain active; no service-role access is needed.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.hospitals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.incidents, public.ambulances TO authenticated;
GRANT SELECT, INSERT ON public.incident_timeline_events TO authenticated;

-- The existing trigger casts lifecycle values to public.ambulance_status.
-- Pin its lookup path so it also works under the RPC's empty search_path.
ALTER FUNCTION public.sync_incident_ambulance_assignment()
  SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.dispatch_assign(
  p_incident_id text,
  p_ambulance_id text,
  p_hospital_id text,
  p_notes text DEFAULT ''
) RETURNS public.incidents
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
  incident public.incidents;
  ambulance public.ambulances;
  hospital public.hospitals;
BEGIN
  SELECT role::text INTO actor_role FROM public.profiles WHERE id = actor;
  IF actor IS NULL OR actor_role IS NULL OR actor_role NOT IN ('DISPATCHER', 'ADMIN') THEN
    RAISE EXCEPTION 'Only a dispatcher or admin can assign an ambulance' USING ERRCODE = '42501';
  END IF;
  IF length(coalesce(p_notes, '')) > 4000 THEN
    RAISE EXCEPTION 'Assignment notes must not exceed 4000 characters' USING ERRCODE = '22023';
  END IF;

  -- Every allocation locks incident first, then vehicle. Competing calls see
  -- the committed allocation before testing vehicle availability.
  SELECT * INTO incident FROM public.incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002';
  END IF;
  IF incident.status = 'ASSIGNED'
      AND incident.assigned_ambulance_id = p_ambulance_id
      AND incident.assigned_hospital_id = p_hospital_id THEN
    RETURN incident;
  END IF;
  IF incident.status <> 'PENDING' OR incident.assigned_ambulance_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an unassigned pending incident can be assigned' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO ambulance FROM public.ambulances WHERE id = p_ambulance_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ambulance not found' USING ERRCODE = 'P0002';
  END IF;
  IF ambulance.status <> 'AVAILABLE' OR ambulance.assigned_incident_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ambulance is no longer available' USING ERRCODE = '23505';
  END IF;
  SELECT * INTO hospital FROM public.hospitals WHERE id = p_hospital_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hospital not found' USING ERRCODE = 'P0002';
  END IF;
  IF hospital.available_beds <= 0 THEN
    RAISE EXCEPTION 'Hospital has no available beds' USING ERRCODE = '23505';
  END IF;

  UPDATE public.incidents SET
    assigned_ambulance_id = p_ambulance_id,
    assigned_hospital_id = p_hospital_id,
    status = 'ASSIGNED',
    dispatched_at = now(),
    updated_at = now()
  WHERE id = p_incident_id
  RETURNING * INTO incident;
  -- Existing CAD trigger updates the shared ambulance telemetry row.
  INSERT INTO public.incident_timeline_events (incident_id, ambulance_id, actor_id, stage, notes)
    VALUES (p_incident_id, p_ambulance_id, actor, 'ASSIGNED', coalesce(p_notes, ''));
  RETURN incident;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_assign(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_assign(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_set_status(
  p_incident_id text,
  p_status text,
  p_notes text DEFAULT ''
) RETURNS public.incidents
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
  incident public.incidents;
  ambulance public.ambulances;
  allowed text[];
BEGIN
  SELECT role::text INTO actor_role FROM public.profiles WHERE id = actor;
  IF actor IS NULL OR actor_role IS NULL OR actor_role NOT IN ('DISPATCHER', 'ADMIN', 'DRIVER') THEN
    RAISE EXCEPTION 'An authorized dispatch profile is required' USING ERRCODE = '42501';
  END IF;
  IF length(coalesce(p_notes, '')) > 4000 THEN
    RAISE EXCEPTION 'Lifecycle notes must not exceed 4000 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO incident FROM public.incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found or inaccessible' USING ERRCODE = 'P0002';
  END IF;
  IF incident.assigned_ambulance_id IS NOT NULL THEN
    SELECT * INTO ambulance FROM public.ambulances
      WHERE id = incident.assigned_ambulance_id FOR UPDATE;
    IF NOT FOUND OR (actor_role = 'DRIVER' AND ambulance.assigned_driver_id IS DISTINCT FROM actor) THEN
      RAISE EXCEPTION 'Only the assigned driver can change this incident' USING ERRCODE = '42501';
    END IF;
  ELSIF actor_role = 'DRIVER' THEN
    RAISE EXCEPTION 'Only the assigned driver can change this incident' USING ERRCODE = '42501';
  END IF;
  -- Retrying the same transition does not duplicate timeline events.
  IF incident.status::text = p_status THEN RETURN incident; END IF;
  allowed := CASE incident.status
    WHEN 'PENDING' THEN ARRAY['CANCELLED']
    WHEN 'ASSIGNED' THEN ARRAY['EN_ROUTE_TO_SCENE', 'CANCELLED']
    WHEN 'EN_ROUTE_TO_SCENE' THEN ARRAY['ON_SCENE', 'CANCELLED']
    WHEN 'ON_SCENE' THEN ARRAY['TRANSPORTING_TO_HOSPITAL', 'RESOLVED', 'CANCELLED']
    WHEN 'TRANSPORTING_TO_HOSPITAL' THEN ARRAY['ARRIVED_AT_HOSPITAL']
    WHEN 'ARRIVED_AT_HOSPITAL' THEN ARRAY['RESOLVED']
    ELSE ARRAY[]::text[] END;
  IF p_status IS NULL OR NOT (p_status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid lifecycle transition; use an assignment for initial dispatch' USING ERRCODE = '22023';
  END IF;
  IF incident.assigned_ambulance_id IS NOT NULL
      AND ambulance.assigned_incident_id IS DISTINCT FROM incident.id THEN
    RAISE EXCEPTION 'Ambulance assignment has changed' USING ERRCODE = '23505';
  END IF;
  UPDATE public.incidents SET
    status = p_status::public.incident_lifecycle_status,
    arrived_scene_at = CASE WHEN p_status = 'ON_SCENE' THEN now() ELSE arrived_scene_at END,
    transport_started_at = CASE WHEN p_status = 'TRANSPORTING_TO_HOSPITAL' THEN now() ELSE transport_started_at END,
    arrived_hospital_at = CASE WHEN p_status = 'ARRIVED_AT_HOSPITAL' THEN now() ELSE arrived_hospital_at END,
    resolved_at = CASE WHEN p_status = 'RESOLVED' THEN now() ELSE resolved_at END,
    updated_at = now()
  WHERE id = p_incident_id RETURNING * INTO incident;
  INSERT INTO public.incident_timeline_events (incident_id, ambulance_id, actor_id, stage, notes)
    VALUES (incident.id, incident.assigned_ambulance_id, actor,
      p_status::public.incident_lifecycle_status, coalesce(p_notes, ''));
  RETURN incident;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_set_status(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_set_status(text,text,text) TO authenticated;

-- Non-sensitive health check: no rows, identities, keys, or counts are returned.
CREATE OR REPLACE FUNCTION public.dispatch_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT pg_catalog.to_regclass('public.profiles') IS NOT NULL
    AND pg_catalog.to_regclass('public.incidents') IS NOT NULL
    AND pg_catalog.to_regclass('public.ambulances') IS NOT NULL
    AND pg_catalog.to_regclass('public.hospitals') IS NOT NULL
    AND pg_catalog.to_regclass('public.incident_timeline_events') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.dispatch_assign(text,text,text,text)') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.dispatch_set_status(text,text,text)') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.dispatch_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_ready() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

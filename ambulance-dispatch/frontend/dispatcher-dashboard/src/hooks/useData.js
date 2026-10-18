import { useState, useEffect, useCallback } from 'react';
import supabase from '../services/supabase';
import { analyticsApi } from '../services/api';
import { dispatchBroadcast, DISPATCH_EVENTS } from '../services/dispatchBroadcast';

/* ── Hooks Backed by Supabase with Realtime CDC & Parallel Broadcast ── */

export function useIncidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: sbErr } = await supabase
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false });

      if (sbErr) throw sbErr;
      if (Array.isArray(data)) {
        setIncidents(data);
      }
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();

    // 1. Supabase Postgres CDC Subscription
    const channel = supabase
      .channel('cad_incidents_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidents' }, (payload) => {
        console.log('[Realtime CDC] Incident Inserted:', payload.new);
        setIncidents(prev => [payload.new, ...prev.filter(i => i.id !== payload.new.id)]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'incidents' }, (payload) => {
        console.log('[Realtime CDC] Incident Updated:', payload.new);
        setIncidents(prev => prev.map(i => i.id === payload.new.id ? payload.new : i));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'incidents' }, (payload) => {
        setIncidents(prev => prev.filter(i => i.id !== payload.old.id));
      })
      .subscribe();

    // 2. Parallel BroadcastChannel / Socket fallback listeners
    const handleBroadcastSOS = (inc) => {
      setIncidents(prev => [inc, ...prev.filter(i => i.id !== inc.id)]);
    };

    dispatchBroadcast.on(DISPATCH_EVENTS.SOS_CREATED, handleBroadcastSOS);

    return () => {
      supabase.removeChannel(channel);
      dispatchBroadcast.off(DISPATCH_EVENTS.SOS_CREATED, handleBroadcastSOS);
    };
  }, [fetchIncidents]);

  return { incidents, setIncidents, loading, error, refetch: fetchIncidents };
}

export function useAmbulances() {
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAmbulances = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: sbErr } = await supabase
        .from('ambulances')
        .select('*')
        .order('call_sign', { ascending: true });

      if (sbErr) throw sbErr;
      if (Array.isArray(data)) {
        setAmbulances(data);
      }
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAmbulances();

    // 1. Supabase Postgres CDC Subscription
    const channel = supabase
      .channel('cad_ambulances_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ambulances' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          setAmbulances(prev => prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a));
        }
      })
      // Supabase Ephemeral Broadcast for High-Frequency GPS
      .on('broadcast', { event: 'ambulance_location' }, (payload) => {
        const data = payload.payload;
        if (!data) return;
        setAmbulances(prev => prev.map(a =>
          a.id === data.ambulance_id
            ? { ...a, latitude: data.latitude, longitude: data.longitude, speed: data.speed, heading: data.heading }
            : a
        ));
      })
      .subscribe();

    // 2. Parallel BroadcastChannel / Socket listeners
    const handleBroadcastLocation = (data) => {
      if (!data) return;
      const targetId = data.ambulance_id || data.id;
      setAmbulances(prev => prev.map(a =>
        a.id === targetId || a.call_sign === 'Alpha-1' || a.id === 'AMB-001'
          ? { ...a, latitude: data.latitude, longitude: data.longitude, speed: data.speed || a.speed }
          : a
      ));
    };

    const handleIncidentAssigned = (data) => {
      if (!data || !data.ambulance) return;
      setAmbulances(prev => prev.map(a =>
        a.id === data.ambulance.id
          ? {
              ...a,
              status: 'EN_ROUTE_TO_SCENE',
              assigned_incident_id: data.incident?.id || data.id,
              destination: data.location_address || data.incident?.location_address || 'Emergency Scene',
            }
          : a
      ));
    };

    dispatchBroadcast.on(DISPATCH_EVENTS.AMBULANCE_LOCATION, handleBroadcastLocation);
    dispatchBroadcast.on(DISPATCH_EVENTS.INCIDENT_ASSIGNED, handleIncidentAssigned);

    return () => {
      supabase.removeChannel(channel);
      dispatchBroadcast.off(DISPATCH_EVENTS.AMBULANCE_LOCATION, handleBroadcastLocation);
      dispatchBroadcast.off(DISPATCH_EVENTS.INCIDENT_ASSIGNED, handleIncidentAssigned);
    };
  }, [fetchAmbulances]);

  return { ambulances, loading, error, refetch: fetchAmbulances };
}

export function useHospitals() {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHospitals = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: sbErr } = await supabase
        .from('hospitals')
        .select('*')
        .order('name', { ascending: true });

      if (sbErr) throw sbErr;
      if (Array.isArray(data)) {
        setHospitals(data);
      }
      setError(null);
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHospitals();

    const channel = supabase
      .channel('cad_hospitals_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitals' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setHospitals(prev => prev.map(h => h.id === payload.new.id ? payload.new : h));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchHospitals]);

  return { hospitals, loading, error, refetch: fetchHospitals };
}

export function useAnalytics() {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await analyticsApi.getDashboardStats();
      setStats(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { refetch(); }, [refetch]);
  return { stats, loading, error, refetch };
}

export function useDashboardStats() {
  return useAnalytics();
}

export function useTimeline() {
  const [events, setEvents] = useState([]);
  return { events, setEvents, loading: false };
}


require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { randomUUID } = require('node:crypto');

const lifecycle = ['PENDING','ASSIGNED','EN_ROUTE_TO_SCENE','ON_SCENE','TRANSPORTING_TO_HOSPITAL','ARRIVED_AT_HOSPITAL','RESOLVED','CANCELLED'];
const incidentFields = ['incident_type','severity','location_address','location_lat','location_lng','caller_name','caller_phone','patients_count','description','is_sos'];
const pick = (body, fields) => Object.fromEntries(fields.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
const fail = (status, message) => Object.assign(new Error(message), { status });
function createApp(options = {}) {
  const app = express();
  const url = (options.url || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = options.key || process.env.SUPABASE_ANON_KEY;
  let validUrl=false;
  try { const parsed=new URL(url); validUrl=!parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname==='/' && (parsed.protocol==='https:' || (parsed.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))); } catch {}
  app.use(helmet());
  app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(x => x.trim()) }));
  app.use(express.json({ limit: '100kb' }));
  const route = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
  async function upstream(path, token, method = 'GET', body) {
    if (!validUrl || !key) throw fail(503, 'Supabase is not configured with a valid project URL');
    let response;
    try { response = await fetch(`${url}${path}`, { method, headers: { apikey:key, ...(token ? {Authorization:`Bearer ${token}`} : {}), 'Content-Type':'application/json', Prefer:'return=representation' }, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(10000), redirect:'error' }); }
    catch { throw fail(503, 'Supabase is unreachable'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const status = response.status === 401 ? 401 : response.status === 403 || data?.code === '42501' ? 403 : response.status >= 500 ? 503 : response.status === 409 || data?.code === 'P0001' ? 409 : 400;
      throw fail(status, response.status >= 500 ? 'Supabase service is unavailable' : data?.message || data?.msg || 'Supabase request failed');
    }
    return data;
  }
  const db = (req,table,query='',method='GET',body) => upstream(`/rest/v1/${table}${query ? '?' + query : ''}`, req.token, method, body);
  const eq = id => `id=eq.${encodeURIComponent(id)}&select=*`;
  const one = async (req,table,id) => { const rows = await db(req,table,eq(id)); if (!rows?.length) throw fail(404, 'Record not found or inaccessible'); return rows[0]; };
  const write = async (req,table,id,body) => { if (!Object.keys(body).length) throw fail(400,'No supported fields supplied'); const rows=await db(req,table,eq(id),'PATCH',body); if (!rows?.length) throw fail(404,'Record not found or inaccessible'); return rows[0]; };
  const dispatcher = req => { if (!['DISPATCHER','ADMIN'].includes(req.profile.role)) throw fail(403,'Dispatcher or admin role required'); };
  app.get('/', (_req,res) => res.json({service:'Ambulance Dispatch API', storage:'Supabase'}));
  app.get('/health', route(async (_req,res) => { const ready=await upstream('/rest/v1/rpc/dispatch_ready',null,'POST',{}); if (ready !== true) throw fail(503,'Supabase CAD schema is not ready'); res.json({status:'healthy',supabase:'ready'}); }));
  app.post(['/api/auth/login','/api/auth/register','/api/auth/signup'], (_req,res) => res.status(410).json({error:'Sign in using Supabase Auth in the application; send its access token.'}));
  app.use('/api', (req,res,next) => (async () => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    if (!match) throw fail(401,'Supabase access token required');
    req.token=match[1];
    const user = await upstream('/auth/v1/user',req.token);
    const profiles = await db(req,'profiles',eq(user.id));
    if (!profiles?.length || !['DISPATCHER','ADMIN','DRIVER'].includes(profiles[0].role)) throw fail(403,'An authorized Supabase profile is required');
    req.profile=profiles[0]; req.user=user;
    next();
  })().catch(next));
  app.get('/api/auth/me', (req,res) => res.json({...req.profile,user:req.profile}));
  app.post('/api/auth/logout',route(async(req,res) => { await upstream('/auth/v1/logout',req.token,'POST'); res.status(204).end(); }));
  app.get('/api/incidents',route(async(req,res) => res.json(await db(req,'incidents',`select=*&order=created_at.desc${req.query.status ? '&status=eq.'+encodeURIComponent(req.query.status):''}`))));
  app.post('/api/incidents',route(async(req,res) => { dispatcher(req); const body={...pick(req.body,incidentFields),id:randomUUID(),status:'PENDING'}; res.status(201).json((await db(req,'incidents','','POST',body))[0]); }));
  app.get('/api/incidents/:id/timeline',route(async(req,res) => { await one(req,'incidents',req.params.id); res.json(await db(req,'incident_timeline_events',`incident_id=eq.${encodeURIComponent(req.params.id)}&order=created_at.asc`)); }));
  app.post('/api/incidents/:id/acknowledge',route(async(req,res) => {
    const incident=await one(req,'incidents',req.params.id);
    const rows=await db(req,'incident_timeline_events','','POST',{incident_id:incident.id,ambulance_id:incident.assigned_ambulance_id,actor_id:req.user.id,stage:incident.status,notes:'Incident acknowledged'});
    res.json(rows[0]);
  }));
  const statusUpdate = route(async(req,res) => {
    if (!lifecycle.includes(req.body.status)) throw fail(400,'Invalid incident lifecycle status');
    const result=await db(req,'rpc/dispatch_set_status','','POST',{p_incident_id:req.params.id,p_status:req.body.status,p_notes:req.body.notes || ''});
    res.json(Array.isArray(result) ? result[0] : result);
  });
  app.patch('/api/incidents/:id/status',statusUpdate); app.put('/api/incidents/:id/status',statusUpdate);
  app.get('/api/incidents/:id',route(async(req,res) => res.json(await one(req,'incidents',req.params.id))));
  app.put('/api/incidents/:id',route(async(req,res) => { dispatcher(req); if (req.body.assigned_ambulance_id !== undefined || req.body.assigned_hospital_id !== undefined) throw fail(400,'Use assignments endpoint to assign resources'); res.json(await write(req,'incidents',req.params.id,pick(req.body,incidentFields))); }));
  app.delete('/api/incidents/:id',(_req,res) => res.status(405).json({error:'Cancel incidents using the lifecycle status endpoint to preserve the audit history'}));
  const nearby = (rows,lat,lng,radius) => {
    if (lat === undefined && lng === undefined) return rows;
    lat=Number(lat); lng=Number(lng); radius=radius === undefined ? Infinity : Number(radius);
    if (!Number.isFinite(lat) || Math.abs(lat)>90 || !Number.isFinite(lng) || Math.abs(lng)>180 || !(radius>0)) throw fail(400,'Invalid coordinates or radius');
    const rad=n=>n*Math.PI/180;
    return rows.map(row => { const a=Math.sin(rad(row.latitude-lat)/2)**2+Math.cos(rad(lat))*Math.cos(rad(row.latitude))*Math.sin(rad(row.longitude-lng)/2)**2; return {...row,distance:6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}; }).filter(row=>row.distance<=radius).sort((a,b)=>a.distance-b.distance);
  };
  app.get('/api/ambulances/available',route(async(req,res) => res.json({ambulances:nearby(await db(req,'ambulances','status=eq.AVAILABLE&select=*'),req.query.lat,req.query.lng,req.query.radius)})));
  app.get('/api/ambulances',route(async(req,res) => res.json(await db(req,'ambulances','select=*'))));
  app.get('/api/ambulances/:id',route(async(req,res) => res.json(await one(req,'ambulances',req.params.id))));
  app.patch('/api/ambulances/:id/location',route(async(req,res) => {
    const {latitude,longitude}=req.body;
    if (!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180) throw fail(400,'Valid latitude and longitude required');
    res.json(await write(req,'ambulances',req.params.id,{latitude,longitude,last_ping:new Date().toISOString()}));
  }));
  app.patch('/api/ambulances/:id/status',route(async(req,res) => {
    if (![...lifecycle.filter(x=>!['PENDING','RESOLVED','CANCELLED'].includes(x)),'AVAILABLE','RETURNING_TO_BASE','MAINTENANCE','OFFLINE'].includes(req.body.status)) throw fail(400,'Invalid ambulance status');
    res.json(await write(req,'ambulances',req.params.id,{status:req.body.status}));
  }));
  app.get('/api/hospitals/nearby',route(async(req,res) => res.json({hospitals:nearby(await db(req,'hospitals','select=*'),req.query.lat,req.query.lng,req.query.radius)})));
  const scored = async req => { const i=await one(req,'incidents',req.params.incidentId); return nearby(await db(req,'hospitals','available_beds=gt.0&select=*'),i.location_lat,i.location_lng).map(h=>({...h,score:Math.round(100/(1+h.distance)+Math.min(h.available_beds,20)),scoring_method:'distance_km_and_available_beds'})).sort((a,b)=>b.score-a.score); };
  app.get('/api/hospitals/scored/:incidentId',route(async(req,res)=>res.json({hospitals:await scored(req)})));
  app.get('/api/hospitals',route(async(req,res)=>res.json(await db(req,'hospitals','select=*'))));
  app.get('/api/hospitals/:id',route(async(req,res)=>res.json(await one(req,'hospitals',req.params.id))));
  app.patch('/api/hospitals/:id/capacity',route(async(req,res)=>{ dispatcher(req); const body=pick(req.body,['available_beds','icu_beds_available','total_beds','icu_beds_total']); if(Object.values(body).some(x=>!Number.isInteger(x)||x<0)) throw fail(400,'Capacity must contain nonnegative integers'); res.json(await write(req,'hospitals',req.params.id,body)); }));
  app.post('/api/assignments',route(async(req,res)=>{
    dispatcher(req); const b=req.body;
    const incidentId=b.incident_id || b.incidentId, ambulanceId=b.ambulance_id || b.ambulanceId, hospitalId=b.hospital_id || b.hospitalId;
    if (!incidentId || !ambulanceId || !hospitalId) throw fail(400,'Incident, ambulance and hospital IDs required');
    const result=await db(req,'rpc/dispatch_assign','','POST',{p_incident_id:incidentId,p_ambulance_id:ambulanceId,p_hospital_id:hospitalId,p_notes:b.notes || ''});
    const incident=Array.isArray(result)?result[0]:result;
    res.status(201).json({...incident,incident_id:incidentId,assignment_id:incidentId});
  }));
  app.get('/api/assignments/recommendations/:incidentId',route(async(req,res)=>{ dispatcher(req); const i=await one(req,'incidents',req.params.incidentId); res.json({ambulances:nearby(await db(req,'ambulances','status=eq.AVAILABLE&select=*'),i.location_lat,i.location_lng),hospitals:await scored(req)}); }));
  app.post('/api/assignments/:id/:action',(_req,res)=>res.status(405).json({error:'Update the assigned incident lifecycle through /incidents/:id/status'}));
  app.get('/api/analytics/dashboard',route(async(req,res)=>{ dispatcher(req); const [incidents,ambulances,hospitals]=await Promise.all(['incidents','ambulances','hospitals'].map(t=>db(req,t,'select=*'))); res.json({totalIncidents:incidents.length,activeIncidents:incidents.filter(i=>!['RESOLVED','CANCELLED'].includes(i.status)).length,pendingIncidents:incidents.filter(i=>i.status==='PENDING').length,totalAmbulances:ambulances.length,availableAmbulances:ambulances.filter(a=>a.status==='AVAILABLE').length,totalHospitals:hospitals.length}); }));
  app.get('/api/analytics/hotspots',route(async(req,res)=>{ dispatcher(req); res.json((await db(req,'incidents','select=id,location_lat,location_lng,severity')).map(i=>({...i,latitude:i.location_lat,longitude:i.location_lng}))); }));
  app.get('/api/analytics/response-times',route(async(req,res)=>{ dispatcher(req); const rows=await db(req,'incidents','select=id,dispatched_at,arrived_scene_at&arrived_scene_at=not.is.null&dispatched_at=not.is.null'); res.json(rows.map(i=>({incident_id:i.id,response_time_minutes:(Date.parse(i.arrived_scene_at)-Date.parse(i.dispatched_at))/60000}))); }));
  app.use((_req,res)=>res.status(404).json({error:'Endpoint not found'}));
  app.use((error,_req,res,_next)=>res.status(error.status || 500).json({error:error.status ? error.message : 'Internal server error'}));
  return app;
}
const app=createApp();
if (require.main === module) {
  const server=app.listen(Number(process.env.PORT)||3000,()=>console.log('Dispatch API listening'));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
module.exports=app;
module.exports.createApp=createApp;

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createApp}=require('../server');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
test('Supabase HTTP transport, caller authorization and schema contracts',async(t)=>{
  const calls=[];
  const fixture=http.createServer(async(req,res)=>{
    let raw=''; for await (const chunk of req) raw+=chunk;
    calls.push({path:req.url,method:req.method,authorization:req.headers.authorization,key:req.headers.apikey,body:raw?JSON.parse(raw):undefined});
    res.setHeader('Content-Type','application/json');
    if(req.headers.authorization==='Bearer expired'){res.statusCode=401;return res.end(JSON.stringify({message:'expired token'}));}
    if(req.url==='/rest/v1/rpc/dispatch_ready') return res.end('true');
    if(req.url==='/auth/v1/user') return res.end(JSON.stringify({id:'user-1',user_metadata:{role:'ADMIN'}}));
    if(req.url.startsWith('/rest/v1/profiles')) return res.end(JSON.stringify([{id:'user-1',role:req.headers.authorization==='Bearer driver'?'DRIVER':'DISPATCHER'}]));
    if(req.url.startsWith('/rest/v1/rpc/dispatch_set_status')) return res.end(JSON.stringify({id:'I-1',status:JSON.parse(raw).p_status}));
    if(req.url.startsWith('/rest/v1/rpc/dispatch_assign')) return res.end(JSON.stringify({id:'I-1',status:'ASSIGNED'}));
    if(req.url.startsWith('/rest/v1/incidents') && req.method==='PATCH') return res.end(JSON.stringify([{id:'I-1',...JSON.parse(raw)}]));
    if(req.url.startsWith('/rest/v1/incidents')) return res.end(JSON.stringify([{id:'I-1',status:'PENDING',location_lat:12,location_lng:77}]));
    if(req.url.startsWith('/rest/v1/ambulances')) return res.end(JSON.stringify([{id:'A-1',latitude:12,longitude:77,status:'AVAILABLE'}]));
    if(req.url.startsWith('/rest/v1/hospitals')) return res.end(JSON.stringify([{id:'H-1',latitude:12,longitude:77,available_beds:2}]));
    res.statusCode=400;res.end(JSON.stringify({message:'unknown table'}));
  });
  const fixtureUrl=await listen(fixture);
  const server=http.createServer(createApp({url:fixtureUrl,key:'public-key'}));
  const api=await listen(server);
  t.after(()=>Promise.all([new Promise(r=>server.close(r)),new Promise(r=>fixture.close(r))]));
  const request=async(path,method='GET',body,token='dispatcher')=>{
    const response=await fetch(api+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  assert.equal((await request('/health')).status,200);
  assert.equal((await request('/api/incidents','GET',undefined,null)).status,401);
  assert.equal((await request('/api/incidents','GET',undefined,'expired')).status,401);
  assert.equal((await request('/api/incidents','POST',{incident_type:'TRAUMA'},'driver')).status,403);
  assert.equal((await request('/api/auth/login','POST',{role:'ADMIN'})).status,410);
  const incidents=await request('/api/incidents');assert.equal(incidents.status,200);assert.equal(incidents.body[0].id,'I-1');
  const statusResult=await request('/api/incidents/I-1/status','PUT',{status:'ON_SCENE',notes:'Arrived'});
  assert.equal(statusResult.body.status,'ON_SCENE');
  assert.deepEqual(calls.find(c=>c.path==='/rest/v1/rpc/dispatch_set_status').body,{p_incident_id:'I-1',p_status:'ON_SCENE',p_notes:'Arrived'});
  assert.equal((await request('/api/incidents/I-1/status','PATCH',{status:'RESOLVED'})).status,200);
  assert.equal((await request('/api/incidents/I-1/status','PATCH',{status:'FAKE'})).status,400);
  const result=await request('/api/assignments','POST',{incidentId:'I-1',ambulanceId:'A-1',hospitalId:'H-1',notes:'Urgent'});assert.equal(result.status,201);
  assert.deepEqual(calls.find(c=>c.path==='/rest/v1/rpc/dispatch_assign').body,{p_incident_id:'I-1',p_ambulance_id:'A-1',p_hospital_id:'H-1',p_notes:'Urgent'});
  assert.equal((await request('/api/ambulances/available?lat=12&lng=77')).body.ambulances[0].distance,0);
  assert.equal((await request('/api/hospitals/scored/I-1')).body.hospitals[0].id,'H-1');
  assert.equal((await request('/api/hospitals/H-1/capacity','PATCH',{available_beds:3},'driver')).status,403);
  assert.ok(calls.filter(c=>c.path.startsWith('/rest/') && !c.path.endsWith('/dispatch_ready')).every(c=>['Bearer dispatcher','Bearer driver'].includes(c.authorization)&&c.key==='public-key'));
});
test('health reports missing configuration honestly',async(t)=>{
 const server=http.createServer(createApp({url:'http://127.0.0.1:1',key:'public'}));const base=await listen(server);t.after(()=>new Promise(r=>server.close(r)));assert.equal((await fetch(base+'/health')).status,503);
});
test('health uses public key without bearer and rejects provider failures and redirects',async(t)=>{
 let mode='ready';
 const fixture=http.createServer((req,res)=>{
   assert.equal(req.headers.authorization,undefined);
   assert.equal(req.headers.apikey,'sb_publishable_example');
   if(mode==='redirect'){res.writeHead(302,{Location:'http://127.0.0.1:1/leak'});return res.end();}
   res.setHeader('Content-Type','application/json');
   if(mode==='error'){res.statusCode=500;return res.end(JSON.stringify({message:'private internal provider details'}));}
   res.end(mode==='ready'?'true':'false');
 });
 const url=await listen(fixture);const server=http.createServer(createApp({url,key:'sb_publishable_example'}));const api=await listen(server);
 t.after(()=>Promise.all([new Promise(r=>server.close(r)),new Promise(r=>fixture.close(r))]));
 assert.equal((await fetch(api+'/health')).status,200);
 mode='error';let response=await fetch(api+'/health');assert.equal(response.status,503);assert.equal((await response.json()).error,'Supabase service is unavailable');
 mode='redirect';assert.equal((await fetch(api+'/health')).status,503);
 mode='not-ready';assert.equal((await fetch(api+'/health')).status,503);
});
test('rejects unsafe Supabase URLs before forwarding credentials',async(t)=>{
 for(const url of ['http://example.com','https://user:password@example.com','https://example.com/path','https://example.com?apikey=secret','https://example.com/#fragment']){
   const server=http.createServer(createApp({url,key:'public'}));const api=await listen(server);
   try {assert.equal((await fetch(api+'/health')).status,503);} finally {await new Promise(r=>server.close(r));}
 }
 assert.ok(!Object.keys(require.cache).some(path=>path.includes('/mongoose/')||path.endsWith('/config/database.js')));
});

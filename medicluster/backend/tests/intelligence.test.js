const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
async function listen(t, app) {
 const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.closeAllConnections();server.close();});
 return `http://127.0.0.1:${server.address().port}`;
}
test('gateway authenticates, injects identity, restricts paths and preserves binary', async t=>{
 const before={...process.env};
 process.env.JWT_SECRET='gateway-test-only-secret-longer-than-32-characters';
 process.env.INTELLIGENCE_TOKEN='internal-test-secret';
 t.after(()=>{for(const key of ['JWT_SECRET','INTELLIGENCE_TOKEN','INTELLIGENCE_URL']) {if(before[key]===undefined) delete process.env[key];else process.env[key]=before[key];}});
 const seen=[];const provider=express();provider.use(express.json());
 provider.use((req,res)=>{seen.push({path:req.url,actor:req.get('X-Actor-Id'),key:req.get('X-Intelligence-Key')}); if(req.path.endsWith('/slice')) return res.type('png').send(Buffer.from([137,80,78,71]));res.json({ok:true});});
 process.env.INTELLIGENCE_URL=await listen(t,provider);
 const app=express();app.use(express.json());app.use('/api/intelligence',require('../routes/intelligenceRoutes'));
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
 const origin=await listen(t,app);const {signToken,signPatientToken}=require('../middleware/auth');
 const headers={Authorization:`Bearer ${signToken({_id:'alice'})}`,'X-Actor-Id':'victim','X-Intelligence-Key':'attacker','Content-Type':'application/json'};
 assert.equal((await fetch(origin+'/api/intelligence/health')).status,401);
 assert.equal((await fetch(origin+'/api/intelligence/health',{headers:{Authorization:`Bearer ${signPatientToken('p')}`}})).status,403);
 assert.equal((await fetch(origin+'/api/intelligence/health',{headers})).status,200);
 assert.equal(seen[0].actor,'alice');assert.equal(seen[0].key,'internal-test-secret');
 assert.equal((await fetch(origin+'/api/intelligence/private/file',{headers})).status,404);assert.equal(seen.length,1);
 const response=await fetch(origin+'/api/intelligence/brain/studies/'+'a'.repeat(32)+'/slice?axis=axial&index=2',{headers});
 assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from([137,80,78,71]));assert.match(seen[1].path,/index=2/);
 const invalid=await fetch(origin+'/api/intelligence/brain/studies/'+'a'.repeat(32)+'/classify',{method:'POST',headers,body:JSON.stringify({axis:'axial',index:-1})});
 assert.equal(invalid.status,400);assert.equal(seen.length,2);
});

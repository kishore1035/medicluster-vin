const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
test('chest model discovery uses dedicated imaging origin',async t=>{
 const before={...process.env};process.env.ML_ENGINE_URL='http://127.0.0.1:1';
 const worker=express();worker.get('/models',(req,res)=>res.json({models:[{id:'dedicated-chest-test',label:'Dedicated model'}],default:'dedicated-chest-test'}));
 const server=worker.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));process.env.CHEST_IMAGING_URL=`http://127.0.0.1:${server.address().port}`;
 const app=express();app.use('/media',require('../routes/mediaRoutes'));const gateway=app.listen(0,'127.0.0.1');await new Promise(r=>gateway.once('listening',r));
 t.after(()=>{server.closeAllConnections();server.close();gateway.closeAllConnections();gateway.close();for(const key of ['ML_ENGINE_URL','CHEST_IMAGING_URL']){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}});
 const response=await fetch(`http://127.0.0.1:${gateway.address().port}/media/models`);const data=await response.json();assert.equal(data.default,'dedicated-chest-test');assert.equal(data.models[0].id,'dedicated-chest-test');
});

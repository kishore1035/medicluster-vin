const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {createTestDatabase}=require('./helpers/supabaseTestDb');
async function listen(t,app){const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>{s.closeAllConnections();s.close();});return `http://127.0.0.1:${s.address().port}`;}
test('detector regions persist, preview proxies pixels, and invalid results cannot replace saved analysis',async t=>{
 await createTestDatabase(t);let mode='valid';
 const localization={model:'vindr-cxr-yolov8s',width:200,height:100,threshold:.25,boxes:[{id:'detection-0',label:'Pleural effusion',confidence:.8,x1:5,y1:10,x2:80,y2:90}],source:'Pretrained test boundary',reviewOnly:true};
 const worker=express();worker.use(express.json());
 worker.post('/analyze-image',(req,res)=>{assert.equal(req.body.model_name,'vindr-cxr-yolov8s');res.json({model:'vindr-cxr-yolov8s',model_label:'YOLOv8s',findings:mode==='empty'?[]:[{label:'Pleural effusion',confidence:.8}],localization:{...localization,boxes:mode==='empty'?[]:mode==='invalid'?[{...localization.boxes[0],x2:-1}]:localization.boxes}});});
 worker.post('/preview-image',(req,res)=>{assert.equal(req.body.filename,'scan.dcm');res.type('png').send(Buffer.from([137,80,78,71]));});
 const previous=process.env.CHEST_IMAGING_URL;process.env.CHEST_IMAGING_URL=await listen(t,worker);t.after(()=>{if(previous===undefined)delete process.env.CHEST_IMAGING_URL;else process.env.CHEST_IMAGING_URL=previous;});
 const app=express();app.use(express.json());app.use('/media',require('../routes/mediaRoutes'));app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));const origin=await listen(t,app);
 const realFetch=global.fetch;global.fetch=(url,options)=>new URL(url).pathname.startsWith('/storage/v1/')?Promise.resolve(options.method==='GET'?new Response(Buffer.from('source pixels')):Response.json({message:'success'})):realFetch(url,options);t.after(()=>global.fetch=realFetch);
 const form=new FormData();form.set('patient_id','localization-qa');form.set('file',new Blob(['source pixels'],{type:'application/dicom'}),'scan.dcm');const uploaded=await realFetch(origin+'/media/upload',{method:'POST',body:form});assert.equal(uploaded.status,201);const image=await uploaded.json();
 const analyze=()=>realFetch(origin+'/media/analyze/'+image.gridfs_id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model_name:'vindr-cxr-yolov8s'})});
 const response=await analyze();assert.equal(response.status,200);assert.deepEqual((await response.json()).localization,localization);
 let saved=await (await realFetch(origin+'/media/localization-qa')).json();assert.deepEqual(saved[0].analysis.localization,localization);
 const preview=await realFetch(origin+'/media/preview/'+image.gridfs_id);assert.equal(preview.status,200);assert.match(preview.headers.get('content-type'),/image\/png/);assert.deepEqual(Buffer.from(await preview.arrayBuffer()),Buffer.from([137,80,78,71]));
 mode='invalid';assert.equal((await analyze()).status,502);saved=await (await realFetch(origin+'/media/localization-qa')).json();assert.deepEqual(saved[0].analysis.localization,localization);
 mode='empty';assert.equal((await analyze()).status,200);saved=await (await realFetch(origin+'/media/localization-qa')).json();assert.deepEqual(saved[0].analysis.localization.boxes,[]);assert.deepEqual(saved[0].analysis.findings,[]);assert.equal(saved[0].analysis.model,'vindr-cxr-yolov8s');
});

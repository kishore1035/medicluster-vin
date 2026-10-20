import test from 'node:test';
import assert from 'node:assert/strict';
import { axialPoint, comparableStudies, replayPrefix, forecastRows, sliceAspectRatio, sliceInteractionPosition } from '../src/utils/intelligenceGeometry.js';
test('axial display reverses y and clamps clicks to image edges', () => {
 assert.deepEqual(axialPoint(0,0,[100,80,60],12,1),{x:0,y:79,z:12,label:1});
 assert.deepEqual(axialPoint(1,1,[100,80,60],12,0),{x:99,y:0,z:12,label:0});
 assert.deepEqual(axialPoint(2,-1,[100,80,60],80,1),{x:99,y:79,z:59,label:1});
});
test('comparisons require same patient, valid distinct dates and predicted masks',()=>{
 const a={id:'a',patientId:'p',studyDate:'2026-01-01',segmentation:{volumeMl:1}};
 const b={...a,id:'b',studyDate:'2026-02-01'};
 assert.equal(comparableStudies(a,b),true);
 for (const patch of [{patientId:'q'},{studyDate:'garbage'},{studyDate:'2026-02-30'},{studyDate:a.studyDate},{segmentation:null},{patientId:''}]) assert.equal(comparableStudies(a,{...b,...patch}),false);
});
test('replay strictly hides future observations and handles bounds',()=>{
 const rows=[1,2,3,4]; assert.deepEqual(replayPrefix(rows,2),[1,2]); assert.deepEqual(replayPrefix(rows,-8),[]); assert.deepEqual(replayPrefix(rows,99),rows);
});
test('forecast plots only prefix and aligns forecast after cursor',()=>{
 const state={readings:[{heart_rate:70},{heart_rate:80},{heart_rate:999}],cursor:2,forecast:{series:{heart_rate:{median:[81,82],lower:[78,79],upper:[84,85]}}}};
 const rows=forecastRows(state,'heart_rate'); assert.equal(rows.length,4); assert.equal(rows.some(r=>r.observed===999),false); assert.deepEqual(rows[2].band,[78,84]); assert.equal(rows[2].median,81);
});
test('manual datetime defaults describe the local wall time without shifting the instant',async()=>{
 const {localObservationTime}=await import('../src/utils/intelligenceGeometry.js');
 const original=process.env.TZ;
 try{process.env.TZ='Asia/Kolkata';assert.equal(localObservationTime(new Date('2026-10-20T12:00:00Z')),'2026-10-20T17:30');}
 finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});

test('reserved research-demo identifier never establishes patient identity',()=>{
 const a={id:'a',patientId:'research-demo',studyDate:'2026-01-01',segmentation:{volumeMl:1}};
 assert.equal(comparableStudies(a,{...a,id:'b',studyDate:'2026-02-01'}),false);
});
test('orthogonal slices preserve physical proportions for anisotropic voxels',()=>{
 const shape=[100,80,60],spacing=[2,3,5];
 assert.equal(sliceAspectRatio('axial',shape,spacing),200/240);
 assert.equal(sliceAspectRatio('coronal',shape,spacing),200/300);
 assert.equal(sliceAspectRatio('sagittal',shape,spacing),240/300);
});
test('keyboard axial activation places a centered prompt while pointer activation follows the image',()=>{
 const rect={left:50,top:100,width:200,height:300};
 const keyboard=sliceInteractionPosition({detail:0,clientX:0,clientY:0},rect);
 assert.deepEqual(keyboard,{u:.5,v:.5});
 assert.deepEqual(axialPoint(keyboard.u,keyboard.v,[101,81,61],12,1),{x:50,y:40,z:12,label:1});
 assert.deepEqual(sliceInteractionPosition({detail:1,clientX:250,clientY:100},rect),{u:1,v:0});
});

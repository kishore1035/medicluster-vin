import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnalysisCoordinator} from '../src/utils/imagingAnalysis.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('automatic analysis deduplicates and failure does not auto retry',async()=>{
 let calls=0;const failures=[];const coordinator=createAnalysisCoordinator({execute:async()=>{calls++;throw new Error('offline');},onError:(...args)=>failures.push(args)});
 await coordinator.request('file','model');await coordinator.request('file','model');assert.equal(calls,1);assert.equal(failures.length,1);
 await coordinator.request('file','model',{force:true});assert.equal(calls,2);
});
test('model changes queue latest inference and discard stale model results',async()=>{
 const first=deferred(),calls=[],accepted=[];
 const coordinator=createAnalysisCoordinator({execute:async(id,model)=>{calls.push(model);return model==='old'?first.promise:{model};},onSuccess:(id,model,result)=>accepted.push(result.model)});
 const running=coordinator.request('file','old');coordinator.request('file','old');coordinator.request('file','middle');coordinator.request('file','new');
 assert.deepEqual(calls,['old']);first.resolve({model:'old'});await running;
 assert.deepEqual(calls,['old','new']);assert.deepEqual(accepted,['new']);
});
test('independent scan requests cannot replace one another',async()=>{
 const accepted=[];const coordinator=createAnalysisCoordinator({execute:async(id,model)=>({id,model}),onSuccess:(id,model)=>accepted.push([id,model])});
 await Promise.all([coordinator.request('a','chest'),coordinator.request('b','brain')]);assert.deepEqual(accepted,[['a','chest'],['b','brain']]);
});
test('returning to the active model reuses inference instead of analyzing twice',async()=>{
 const first=deferred(),calls=[],accepted=[];
 const coordinator=createAnalysisCoordinator({execute:async(id,model)=>{calls.push(model);return first.promise;},onSuccess:(id,model)=>accepted.push(model)});
 const running=coordinator.request('a','old');coordinator.request('a','new',{force:true});coordinator.request('a','old',{force:true});first.resolve({});await running;
 assert.deepEqual(calls,['old']);assert.deepEqual(accepted,['old']);
});

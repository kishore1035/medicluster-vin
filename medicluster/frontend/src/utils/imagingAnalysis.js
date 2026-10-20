/** Serializes each file's model changes while independent scans can progress separately. */
export function createAnalysisCoordinator({execute,onPending=()=>{},onSuccess=()=>{},onError=()=>{},onFinish=()=>{}}) {
 const files=new Map(),attempted=new Set();
 return {
  request(id,model,{force=false}={}) {
   const key=JSON.stringify([id,model]);let state=files.get(id);
   if(state?.desired?.model===model)return state.promise;
   if(!force&&attempted.has(key))return state?.promise||Promise.resolve();
   attempted.add(key);
   if(!state){state={desired:null,promise:null};files.set(id,state);}
   state.desired=state.active?.model===model ? state.active : {model};onPending(id,model);
   if(state.promise)return state.promise;
   state.promise=(async()=>{
    while(state.desired){
     const job=state.desired;state.active=job;
     try{const result=await execute(id,job.model);if(state.desired===job)onSuccess(id,job.model,result);}
     catch(error){if(state.desired===job)onError(id,job.model,error);}
     if(state.desired===job)state.desired=null;
    }
    state.active=null;state.promise=null;onFinish(id);
   })();
   return state.promise;
  },
 };
}

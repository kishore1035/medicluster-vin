import { getToken } from './apiClient';
const BASE='/api/intelligence';
export async function intelligenceRequest(path,{method='GET',body,signal,binary=false}={}) {
 const headers={}; const token=getToken(); if(token) headers.Authorization=`Bearer ${token}`;
 if(body && !(body instanceof FormData)) { headers['Content-Type']='application/json'; body=JSON.stringify(body); }
 const response=await fetch(`${BASE}${path}`,{method,headers,body,signal});
 if(!response.ok) { let detail; try { detail=(await response.json()).error; } catch { /* proxy may return text */ } throw new Error(detail || `Intelligence service returned ${response.status}. Please retry.`); }
 return binary?response.blob():response.json();
}
export const getIntelligence=(path,signal)=>intelligenceRequest(path,{signal});
export const postIntelligence=(path,body)=>intelligenceRequest(path,{method:'POST',body});
export async function downloadIntelligence(path,filename) {
 const blob=await intelligenceRequest(path,{binary:true}); const url=URL.createObjectURL(blob);
 const link=document.createElement('a'); link.href=url; link.download=filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

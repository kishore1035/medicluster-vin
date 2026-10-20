import { useEffect, useState } from 'react';
import { getIntelligence } from '../../api/intelligenceClient';
import './intelligence.css';
export function ErrorNotice({error,retry}) { return error?<div role="alert" className="intel-error"><strong>Unable to complete request.</strong> {error} {retry&&<button type="button" onClick={retry}>Retry</button>}</div>:null; }
export function ResearchNotice({children}) { return <div className="intel-notice"><span className="intel-badge">Research preview</span><p>{children}</p></div>; }
export function ServiceStatus() {
 const [health,setHealth]=useState(null),[error,setError]=useState('');
 const load=()=>getIntelligence('/health').then(v=>{setHealth(v);setError('');}).catch(e=>setError(e.message));
 useEffect(()=>{load();},[]);
 return <div className="intel-service"><span className="font-mono text-xs">LOCAL MODEL SERVICE · {health?'Connected':'Checking availability'}</span><ErrorNotice error={error} retry={load}/>{health&&<details><summary>Model availability and provenance</summary><pre>{JSON.stringify(health,null,2)}</pre></details>}</div>;
}

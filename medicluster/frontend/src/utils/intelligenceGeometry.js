const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function axialPoint(u,v,shape,index,label) {
 return {x:clamp(u,0,1)*(shape[0]-1),y:(1-clamp(v,0,1))*(shape[1]-1),z:clamp(Math.round(index),0,shape[2]-1),label};
}
const validStudyDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export function comparableStudies(a,b) {
 return Boolean(a && b && a.id!==b.id && a.patientId && a.patientId!=='research-demo' && a.patientId===b.patientId && a.segmentation && b.segmentation && validStudyDate(a.studyDate) && validStudyDate(b.studyDate) && Date.parse(a.studyDate)!==Date.parse(b.studyDate));
}
export function replayPrefix(readings,cursor) { return readings.slice(0,clamp(Math.floor(cursor??readings.length),0,readings.length)); }
export function forecastRows(state,key) {
 const prefix=replayPrefix(state.readings,state.cursor);
 const rows=prefix.map((r,i)=>({index:i+1,observed:r[key],timestamp:r.timestamp}));
 const f=state.forecast?.series?.[key];
 if(f) f.median.forEach((median,i)=>rows.push({index:prefix.length+i+1,median,band:[f.lower[i],f.upper[i]]}));
 return rows;
}
export const VITALS=[['heart_rate','Heart rate','bpm'],['spo2','Oxygen saturation','%'],['systolic_bp','Systolic BP','mmHg'],['diastolic_bp','Diastolic BP','mmHg'],['respiratory_rate','Respiratory rate','/min'],['temperature','Temperature','°C']];
export function localObservationTime(date=new Date()) {
 const pad=v=>String(v).padStart(2,'0');
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function sliceAspectRatio(axis,shape,spacingMm) {
 const [width,height]={axial:[0,1],coronal:[0,2],sagittal:[1,2]}[axis];
 return (shape[width]*spacingMm[width])/(shape[height]*spacingMm[height]);
}
export function sliceInteractionPosition(event,rect) {
 if(event.detail===0)return {u:.5,v:.5};
 return {u:clamp((event.clientX-rect.left)/rect.width,0,1),v:clamp((event.clientY-rect.top)/rect.height,0,1)};
}

const DETECTOR_ID='vindr-cxr-yolov8s';
const invalid=()=>Object.assign(new Error('Chest detector returned invalid localization data'),{status:502});
function validateLocalization(data,findings){
 if(!data||data.model!==DETECTOR_ID||!Number.isInteger(data.width)||!Number.isInteger(data.height)||data.width<1||data.height<1||data.width*data.height>40_000_000||typeof data.threshold!=='number'||!Number.isFinite(data.threshold)||data.threshold<0||data.threshold>1||!Array.isArray(data.boxes)||data.boxes.length>50||!Array.isArray(findings))throw invalid();
 const ids=new Set();const maxima=new Map();
 const boxes=data.boxes.map(box=>{
  if(!box||typeof box.id!=='string'||!box.id||box.id.length>80||ids.has(box.id)||typeof box.label!=='string'||!box.label.trim()||box.label.length>100||!['x1','y1','x2','y2','confidence'].every(key=>typeof box[key]==='number'&&Number.isFinite(box[key]))||box.x1<0||box.y1<0||box.x2>data.width||box.y2>data.height||box.x2<=box.x1||box.y2<=box.y1||box.confidence<data.threshold||box.confidence>1)throw invalid();
  ids.add(box.id);maxima.set(box.label,Math.max(maxima.get(box.label)||0,box.confidence));
  return Object.fromEntries(['id','label','confidence','x1','y1','x2','y2'].map(key=>[key,box[key]]));
 });
 if(findings.length!==maxima.size||new Set(findings.map(f=>f.label)).size!==findings.length||findings.some(f=>!Number.isFinite(f.confidence)||!maxima.has(f.label)||Math.abs(maxima.get(f.label)-f.confidence)>1e-5))throw invalid();
 return {model:DETECTOR_ID,width:data.width,height:data.height,threshold:data.threshold,boxes,source:typeof data.source==='string'?data.source.slice(0,500):'Pretrained chest finding detector',reviewOnly:true};
}
module.exports={DETECTOR_ID,validateLocalization};

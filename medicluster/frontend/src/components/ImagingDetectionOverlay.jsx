import { detectionBoxes } from '../utils/imagingModels';
/** SVG and the image both use xMidYMid meet / object-contain in the same viewport. */
export default function ImagingDetectionOverlay({localization,highlight,onHighlight}) {
 const boxes=detectionBoxes(localization);
 if(!boxes.length)return null;
 const fontSize=Math.max(12,Math.min(localization.width,localization.height)*.021);
 return <svg className="absolute inset-0 w-full h-full" style={{pointerEvents:'none'}} viewBox={`0 0 ${localization.width} ${localization.height}`} preserveAspectRatio="xMidYMid meet" aria-label="Automatically detected finding regions">
  {boxes.map((box,index)=>{const active=highlight===box.label||highlight===box.id;const text=`${box.label} · ${Math.round(box.confidence*100)}%`;const textWidth=Math.min(localization.width,text.length*fontSize*.6+12);const labelX=Math.min(box.x1,Math.max(0,localization.width-textWidth));const labelY=Math.max(fontSize*1.4,box.y1);
   return <g key={box.id??index} role="button" tabIndex={0} aria-label={`Highlight ${box.label}, ${Math.round(box.confidence*100)} percent model score`} onClick={()=>onHighlight(box.id??box.label)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onHighlight(box.id??box.label);}}} style={{pointerEvents:'auto',cursor:'pointer'}}>
    <rect x={box.x1} y={box.y1} width={box.x2-box.x1} height={box.y2-box.y1} fill={active?'rgba(235,141,76,.15)':'transparent'} stroke={active?'#ffbd87':'#e89657'} strokeWidth={active?3:1.5} vectorEffect="non-scaling-stroke"/>
    <rect x={labelX} y={labelY-fontSize*1.4} width={textWidth} height={fontSize*1.4} fill={active?'#ffbd87':'#e89657'}/>
    <text x={labelX+6} y={labelY-fontSize*.35} fill="#171717" fontSize={fontSize} fontFamily="IBM Plex Mono, monospace">{text}</text>
   </g>;
  })}
 </svg>;
}

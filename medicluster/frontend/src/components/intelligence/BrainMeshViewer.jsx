import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getIntelligence } from '../../api/intelligenceClient';
import { ErrorNotice } from './IntelligenceUI';
export default function BrainMeshViewer({study,revision}) {
 const host=useRef(null), materials=useRef({}); const [opacity,setOpacity]=useState(.22),[showLesion,setShowLesion]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{if(materials.current.brain)materials.current.brain.opacity=opacity;},[opacity]);
 useEffect(()=>{if(materials.current.lesion)materials.current.lesion.visible=showLesion;},[showLesion]);
 useEffect(()=>{
  const el=host.current; if(!el||!study)return; let renderer,controls,frame,disposed=false; const scene=new THREE.Scene();const abort=new AbortController();setLoading(true);setError('');materials.current={};
  const camera=new THREE.PerspectiveCamera(40,1,.1,10000);scene.background=new THREE.Color('#171c20');scene.add(new THREE.HemisphereLight(0xddebf0,0x344047,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,4,5);scene.add(light);
  try { renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));el.appendChild(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true; } catch(e){setError(`3D rendering unavailable: ${e.message}`);setLoading(false);return;}
  const resize=()=>{renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};animate();
  const layers=['brain',...(study.segmentation?['lesion']:[])];
  Promise.allSettled(layers.map(async layer=>{const data=await getIntelligence(`/brain/studies/${study.id}/mesh?layer=${layer}`,abort.signal);if(disposed)return;
   if(!data.positions?.length)return;
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setIndex(data.indices);geometry.computeVertexNormals();const material=new THREE.MeshStandardMaterial({color:layer==='brain'?0xa0b6bd:0xf09263,transparent:true,opacity:layer==='brain'?opacity:.95,side:THREE.DoubleSide,depthWrite:layer!=='brain'});material.visible=layer==='brain'||showLesion;materials.current[layer]=material;scene.add(new THREE.Mesh(geometry,material));
  })).then(results=>{if(disposed)return;const failures=results.filter(r=>r.status==='rejected'&&r.reason.name!=='AbortError');if(failures.length)setError(failures.map(r=>r.reason.message).join(' '));const box=new THREE.Box3().setFromObject(scene);if(!box.isEmpty()){const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length();controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(size*.7,-size*1.2,size*.65));camera.up.set(0,0,1);camera.lookAt(center);controls.update();}setLoading(false);});
  return()=>{disposed=true;abort.abort();cancelAnimationFrame(frame);observer.disconnect();controls.dispose();scene.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});renderer.dispose();renderer.domElement.remove();};
 },[study?.id,revision,retry]);
 return <div><div className="intel-mesh"><div ref={host} style={{height:'100%'}}/><div className="intel-mesh-caption">RAS · WORLD mm<br/>{loading?'Loading physical surfaces…':'Drag to rotate · scroll to zoom'}</div></div><ErrorNotice error={error} retry={()=>setRetry(v=>v+1)}/><div className="intel-row mt-3"><label>Anatomical context opacity<input type="range" min="0" max="1" step=".01" value={opacity} onChange={e=>setOpacity(+e.target.value)}/></label><label><span><input type="checkbox" checked={showLesion} onChange={e=>setShowLesion(e.target.checked)}/> Candidate lesion</span></label></div><p className="intel-muted">Cool surface: intensity-derived anatomical envelope. Orange surface: model candidate mask. Surfaces use physical MRI coordinates.</p></div>;
}

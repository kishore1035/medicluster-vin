"""Pretrained VinDr-CXR finding detection; boxes are not derived from Grad-CAM."""
import os
from pathlib import Path
import numpy as np
from imaging.analyzer import _load_pixels

DETECTOR_ID='vindr-cxr-yolov8s'
DETECTOR_LABEL='YOLOv8s · Chest finding detection'
THRESHOLD=.25
BASE=Path(__file__).resolve().parent.parent
MODEL_PATH=Path(os.environ.get('CHEST_DETECTOR_MODEL',BASE/'.models/vindr-cxr-yolov8s/best.pt'))
_model=None


def status():return dict(model=DETECTOR_ID,installed=MODEL_PATH.is_file(),loaded=_model is not None,reviewOnly=True)


def load_model():
    global _model
    if _model is None:
        if not MODEL_PATH.is_file():raise RuntimeError('Install the VinDr-CXR detector checkpoint first')
        configuration=BASE/'.runtime/ultralytics';configuration.mkdir(parents=True,exist_ok=True,mode=0o700)
        os.environ.setdefault('YOLO_CONFIG_DIR',str(configuration))
        os.environ.setdefault('YOLO_AUTOINSTALL','false')
        from ultralytics import YOLO,settings
        settings.update({'sync':False})
        _model=YOLO(str(MODEL_PATH),task='detect')
    return _model


def detections_from_result(result,width,height,threshold=THRESHOLD):
    boxes=[]
    if result.boxes is not None:
        positions=result.boxes.xyxy.detach().cpu().numpy()
        scores=result.boxes.conf.detach().cpu().numpy()
        classes=result.boxes.cls.detach().cpu().numpy()
        if positions.shape!=(len(scores),4) or len(scores)!=len(classes) or not all(np.isfinite(v).all() for v in (positions,scores,classes)):
            raise RuntimeError('Detector returned invalid coordinates or confidence')
        for xyxy,score,category in zip(positions,scores,classes):
            if score<threshold:continue
            if not 0<=score<=1 or int(category)!=category:raise RuntimeError('Detector returned invalid confidence or class')
            x1,y1,x2,y2=map(float,xyxy)
            if x2<=x1 or y2<=y1:raise RuntimeError('Detector returned inverted box coordinates')
            x1,x2=np.clip([x1,x2],0,width);y1,y2=np.clip([y1,y2],0,height)
            if x2<=x1 or y2<=y1:continue
            label=result.names[int(category)]
            boxes.append(dict(id=f'detection-{len(boxes)}',label=label,confidence=round(float(score),5),x1=float(x1),y1=float(y1),x2=float(x2),y2=float(y2)))
    boxes.sort(key=lambda item:item['confidence'],reverse=True)
    maxima={}
    for box in boxes:maxima[box['label']]=max(maxima.get(box['label'],0),box['confidence'])
    findings=[dict(label=label,confidence=value) for label,value in sorted(maxima.items(),key=lambda item:item[1],reverse=True)]
    return dict(model=DETECTOR_ID,model_label=DETECTOR_LABEL,modality='chest-xray',findings=findings,
        localization=dict(model=DETECTOR_ID,width=width,height=height,threshold=threshold,boxes=boxes,
            source='Pretrained YOLOv8s on VinDr-CXR; original-image pixel coordinates',reviewOnly=True))


def detect_image(image_bytes,model_name=DETECTOR_ID,filename=''):
    if model_name!=DETECTOR_ID:raise ValueError('Unknown chest finding detector')
    image,_=_load_pixels(image_bytes,filename)
    height,width=image.shape
    rgb=np.repeat(np.clip(image,0,255).astype(np.uint8)[:,:,None],3,axis=2)
    results=load_model().predict(source=rgb,imgsz=1024,conf=THRESHOLD,iou=.5,max_det=50,device='cpu',verbose=False,save=False)
    if len(results)!=1:raise RuntimeError('Detector did not return one image result')
    return detections_from_result(results[0],width,height)

"""Loopback chest imaging worker, independent of the tabular/NLP runtime."""
import base64
import binascii
import logging
import os
import threading
from flask import Flask, jsonify, request, send_file
from io import BytesIO
from PIL import Image
import numpy as np
from PIL import UnidentifiedImageError
from werkzeug.exceptions import HTTPException
import torch
from imaging.analyzer import analyze_image, list_models, XRV_MODELS, _cache, _load_pixels
from imaging.localization import detect_image, DETECTOR_ID, DETECTOR_LABEL, status as detector_status
from imaging.gradcam import generate_gradcam

app=Flask(__name__)
app.config['MAX_CONTENT_LENGTH']=70*1024*1024
MODEL_LOCK=threading.RLock()
DEFAULT_MODEL=DETECTOR_ID
torch.set_num_threads(max(1,min(4,os.cpu_count() or 1)))

@app.after_request
def private(response):
    response.headers['Cache-Control']='no-store'
    return response

@app.errorhandler(HTTPException)
def http_error(error): return jsonify(error=error.description),error.code

@app.get('/health')
def health(): return jsonify(service='medicluster-chest-imaging',status='ok',loadedModels=list(_cache),localization=detector_status())

@app.get('/models')
def models(): return jsonify(models=[dict(id=DETECTOR_ID,label=DETECTOR_LABEL,kind='detector',size=1024),*list_models()],default=DEFAULT_MODEL)

def image_request():
    body=request.get_json(silent=True)
    if not isinstance(body,dict): return None,('Expected a JSON object',400)
    model=body.get('model_name',DEFAULT_MODEL)
    if not isinstance(model,str) or model not in (*XRV_MODELS,DETECTOR_ID): return None,('Unknown chest model',400)
    encoded=body.get('image_b64')
    if not isinstance(encoded,str) or not encoded: return None,('image_b64 is required',400)
    try: image=base64.b64decode(encoded,validate=True)
    except (binascii.Error,ValueError): return None,('image_b64 must contain valid base64',400)
    if not image or len(image)>50*1024*1024: return None,('Image must contain 1 byte to 50 MiB',413)
    filename=body.get('filename','')
    if not isinstance(filename,str) or len(filename)>255: return None,('Invalid image filename',400)
    return dict(image_bytes=image,model_name=model,filename=filename),None

@app.post('/analyze-image')
def analyze():
    arguments,error=image_request()
    if error: return jsonify(error=error[0]),error[1]
    try:
        with MODEL_LOCK: result=detect_image(**arguments) if arguments['model_name']==DETECTOR_ID else analyze_image(**arguments)
        return jsonify(result)
    except (ValueError,OSError,UnidentifiedImageError): return jsonify(error='Invalid or unsupported chest X-ray image'),422
    except Exception:
        app.logger.exception('Chest model inference failed')
        return jsonify(error='Chest model inference unavailable; check worker logs and model installation'),503

@app.post('/preview-image')
def preview():
    arguments,error=image_request()
    if error: return jsonify(error=error[0]),error[1]
    try:
        pixels,_=_load_pixels(arguments['image_bytes'],arguments['filename'],radiograph_only=False)
        stream=BytesIO();Image.fromarray(np.clip(pixels,0,255).astype(np.uint8)).save(stream,format='PNG');stream.seek(0)
        return send_file(stream,mimetype='image/png',max_age=0)
    except Exception:
        return jsonify(error='Invalid or unsupported image preview'),422

@app.post('/gradcam')
def gradcam():
    arguments,error=image_request()
    if error: return jsonify(error=error[0]),error[1]
    target=(request.get_json() or {}).get('target_label')
    if not isinstance(target,str) or not target or len(target)>100: return jsonify(error='target_label is required'),400
    with MODEL_LOCK: result=generate_gradcam(**arguments,target_label=target)
    if not result.get('gradcam_available'): return jsonify(error='Grad-CAM unavailable for the selected model and target'),503
    return jsonify(result)

if __name__=='__main__': app.run(host='127.0.0.1',port=8091,threaded=True,debug=False)

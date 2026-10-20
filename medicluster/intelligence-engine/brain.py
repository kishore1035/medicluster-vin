"""Owned MRI studies and research candidate segmentation endpoints."""
from datetime import date, datetime, timezone
from io import BytesIO
import json
from pathlib import Path
import tempfile
import shutil
import numpy as np
import nibabel as nib
from flask import Blueprint, request, jsonify, send_file
from PIL import Image
from scipy.ndimage import binary_fill_holes, binary_closing
from runtime import ApiError, actor, create_record, owned_record, save_record, root_for, MODEL_LOCK
from brain_geometry import load_volume, validate_points, build_mesh, GeometryError
import brain_model

bp = Blueprint('brain', __name__, url_prefix='/brain')
DATASET = Path('/home/vinay/datasets_extra/ucsf_pdgm/raw')
DEMO_IDS = ('0350','0172','0153','0005','0465')
PUBLIC_KEYS = ('id','patientId','name','studyDate','shape','spacingMm','voxelVolumeMm3','createdAt','source','segmentation','suggestedPoint','suggestedPointSource')


def status(): return brain_model.status()


def public(record):
    return {**{key:record[key] for key in PUBLIC_KEYS if key in record}, 'modelStatus':status()}


def body():
    data = request.get_json(silent=True)
    if not isinstance(data,dict): raise ApiError(400, 'Expected a JSON object')
    return data


def text_value(value, field, default='', required=False):
    if value is None: value = default
    if not isinstance(value,str) or len(value)>160 or (required and not value.strip()):
        raise ApiError(400, f'{field} must be a nonempty string of at most 160 characters')
    return value.strip()


def study_fields(values):
    patient = text_value(values.get('patientId'), 'patientId', 'research-demo', True)
    study_date = text_value(values.get('studyDate'), 'studyDate')
    if study_date:
        try:
            if date.fromisoformat(study_date).isoformat()!=study_date: raise ValueError()
        except ValueError: raise ApiError(400, 'studyDate must be YYYY-MM-DD')
    return {'patientId':patient, 'studyDate':study_date, 'name':text_value(values.get('name'),'name','MRI study')}


def persist_image(image, values, source, seed=None):
    fields = study_fields(values)
    affine = image.affine
    fields.update(shape=list(image.shape), spacingMm=nib.affines.voxel_sizes(affine).tolist(),
        voxelVolumeMm3=float(abs(np.linalg.det(affine[:3,:3]))), source=source, segmentation=None)
    if seed is not None:
        fields.update(suggestedPoint=seed, suggestedPointSource='Reference annotation derived demo seed; annotation is never supplied to the segmentation model')
    directory, record = create_record('brain', fields)
    try:
        nib.save(image, directory / 'volume.nii.gz')
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    return public(record)


def volume(directory): return nib.load(directory / 'volume.nii.gz')


def demo_pair(case_id):
    if case_id not in DEMO_IDS: raise ApiError(404, 'Demo case not found')
    prefix = f'UCSF-PDGM-{case_id}'
    folder = DATASET / f'{prefix}_nifti'
    image = folder / f'{prefix}_T1c.nii.gz'
    reference = folder / f'{prefix}_tumor_segmentation.nii.gz'
    if not image.is_file(): raise ApiError(404, 'Demo case unavailable on this worker')
    return image, reference


@bp.get('/demo')
def demo_cases():
    cases = []
    for case_id in DEMO_IDS:
        try: demo_pair(case_id)
        except ApiError: continue
        cases.append({'id':case_id,'title':f'UCSF-PDGM {case_id} · T1 contrast MRI', 'source':'UCSF-PDGM research dataset'})
    return jsonify(cases=cases)


@bp.post('/demo')
def create_demo():
    data = body()
    image_path, reference_path = demo_pair(data.get('caseId'))
    try:
        image = load_volume(image_path)
        seed = None
        if reference_path.is_file():
            reference = load_volume(reference_path)
            # Explicitly disclosed annotation-derived point; only a point is exposed.
            indices = np.argwhere(np.asarray(reference.dataobj)>0)
            if len(indices):
                center = indices.mean(axis=0)
                index = indices[np.argmin(np.sum((indices-center)**2,axis=1))]
                point = nib.affines.apply_affine(np.linalg.inv(image.affine) @ reference.affine, index)
                if np.all(point >= 0) and np.all(point < np.array(image.shape)):
                    seed = dict(zip(('x','y','z'),point.tolist()), label=1)
        return jsonify(persist_image(image, data, 'UCSF-PDGM local research demo MRI', seed)), 201
    except GeometryError as exc: raise ApiError(400,str(exc))
    except (ValueError, OSError, nib.filebasedimages.ImageFileError): raise ApiError(400,'Demo MRI could not be read')


@bp.post('/studies')
def upload_study():
    uploaded = request.files.get('file')
    if uploaded is None or not uploaded.filename or not uploaded.filename.lower().endswith(('.nii','.nii.gz')):
        raise ApiError(400, 'Upload a .nii or .nii.gz file')
    study_fields(request.form) # validate before storing
    suffix = '.nii.gz' if uploaded.filename.lower().endswith('.nii.gz') else '.nii'
    try:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / ('upload'+suffix)
            uploaded.save(path)
            image = load_volume(path)
            return jsonify(persist_image(image,request.form,'Uploaded MRI')),201
    except GeometryError as exc: raise ApiError(400,str(exc))
    except (ValueError, OSError, nib.filebasedimages.ImageFileError):
        raise ApiError(400, 'Invalid or unreadable NIfTI volume')


@bp.get('/studies')
def list_studies():
    patient_id = request.args.get('patientId')
    records = []
    for path in root_for('brain').glob('*/metadata.json'):
        try:
            if not (path.parent/'volume.nii.gz').is_file(): continue
            record = json.loads(path.read_text())
            if record.get('owner') == actor() and (patient_id is None or record.get('patientId') == patient_id):
                records.append(public(record))
        except (OSError, ValueError): continue
    return jsonify(studies=sorted(records,key=lambda r:r['createdAt'],reverse=True))


@bp.get('/studies/<study_id>')
def get_study(study_id):
    _, record = owned_record('brain',study_id)
    return jsonify(public(record))


def slice_array(array, axis, index):
    if axis == 'axial': return array[:,:,index].T[::-1]
    if axis == 'coronal': return array[:,index,:].T[::-1]
    return array[index,:,:].T[::-1]


@bp.get('/studies/<study_id>/slice')
def get_slice(study_id):
    directory, record = owned_record('brain',study_id)
    image = volume(directory)
    axis = request.args.get('axis','axial')
    if axis not in ('axial','coronal','sagittal'): raise ApiError(400,'Unknown slice axis')
    dimension = {'axial':2,'coronal':1,'sagittal':0}[axis]
    try: index = int(request.args.get('index',image.shape[dimension]//2))
    except ValueError: raise ApiError(400,'Slice index must be an integer')
    if not 0<=index<image.shape[dimension]: raise ApiError(400,'Slice outside volume')
    data = image.get_fdata(dtype=np.float32)
    sample = slice_array(data,axis,index)
    nonzero = data[data>0]
    low, high = np.percentile(nonzero if nonzero.size else data, [1,99])
    gray = np.clip((sample-low)/max(float(high-low),1e-6)*255,0,255).astype(np.uint8)
    rgb = np.repeat(gray[:,:,None],3,axis=2)
    if request.args.get('mask','0') == '1' and record.get('segmentation'):
        mask = slice_array(np.asarray(nib.load(directory/'mask.nii.gz').dataobj),axis,index)>0
        rgb[mask] = (.5*rgb[mask]+.5*np.array([250,80,50])).astype(np.uint8)
    stream = BytesIO(); Image.fromarray(rgb).save(stream,format='PNG'); stream.seek(0)
    return send_file(stream,mimetype='image/png',max_age=0)


@bp.get('/studies/<study_id>/mesh')
def get_mesh(study_id):
    directory, record = owned_record('brain',study_id)
    layer = request.args.get('layer','brain')
    if layer not in ('brain','lesion'): raise ApiError(400,'Unknown mesh layer')
    image = volume(directory)
    if layer == 'lesion':
        if not record.get('segmentation'): raise ApiError(409,'Segment the study first')
        mask = np.asarray(nib.load(directory/'mask.nii.gz').dataobj)>0
    else:
        data = image.get_fdata(dtype=np.float32)
        positive = data[data>0]
        if not positive.size: mask = np.zeros(image.shape,dtype=bool)
        else: mask = binary_fill_holes(binary_closing(data>np.percentile(positive,25),iterations=2))
    result = build_mesh(mask,image.affine)
    result.update(layer=layer)
    if layer == 'brain': result['description']='Intensity-derived anatomical context envelope; not model-segmented anatomy'
    return jsonify(result)


@bp.post('/studies/<study_id>/segment')
def segment_study(study_id):
    data = body()
    # Serialize study writes and model inference; prevent inconsistent metadata/mask pairs.
    with MODEL_LOCK:
        directory, record = owned_record('brain',study_id)
        image = volume(directory)
        try:
            points = validate_points(data.get('points'),image.shape)
            mask = brain_model.segment(image.get_fdata(dtype=np.float32),image.affine,points)
        except ValueError as exc: raise ApiError(400,str(exc))
        if mask.shape != image.shape or not np.isfinite(mask).all(): raise ApiError(503,'Model returned an invalid mask')
        mask = (mask>0).astype(np.uint8)
        output = nib.Nifti1Image(mask,image.affine); output.header.set_xyzt_units('mm')
        target = directory/'mask.pending.nii.gz'; nib.save(output,target); target.replace(directory/'mask.nii.gz')
        count = int(np.count_nonzero(mask))
        record['segmentation'] = {'model':brain_model.MODEL_NAME,'volumeMl':count*record['voxelVolumeMm3']/1000,
            'voxelCount':count,'points':points,'createdAt':datetime.now(timezone.utc).isoformat(), 'prompted':True,
            'researchOnly':True, 'fieldOfViewMm':[192,192,192], 'description':'User-prompted candidate lesion mask within a 192 mm prompt-centered field of view; no histological classification'}
        save_record(directory,record)
        return jsonify(public(record))


@bp.get('/studies/<study_id>/mask')
def download_mask(study_id):
    directory, record = owned_record('brain',study_id)
    if not record.get('segmentation'): raise ApiError(409,'Segment the study first')
    return send_file(directory/'mask.nii.gz',mimetype='application/gzip',as_attachment=True,download_name=f'candidate-{study_id}.nii.gz')


@bp.get('/studies/<study_id>/compare/<other_id>')
def compare_studies(study_id,other_id):
    _,first = owned_record('brain',study_id)
    _,second = owned_record('brain',other_id)
    if not first.get('patientId') or first['patientId'] == 'research-demo' or not second.get('patientId') or second['patientId'] == 'research-demo':
        raise ApiError(400,'Comparison requires an explicit patient identifier for both studies')
    if first.get('patientId') != second.get('patientId'): raise ApiError(400,'Comparison requires the same patient')
    if not first.get('segmentation') or not second.get('segmentation'): raise ApiError(409,'Both studies must be segmented')
    try:
        first_date = date.fromisoformat(first['studyDate']); second_date = date.fromisoformat(second['studyDate'])
        if first_date==second_date: raise ValueError()
    except (ValueError,KeyError): raise ApiError(400,'Comparison requires distinct valid study dates')
    earlier,later = (first,second) if first_date<second_date else (second,first)
    before = earlier['segmentation']['volumeMl']; after = later['segmentation']['volumeMl']
    return jsonify(patientId=first['patientId'], earlierStudyId=earlier['id'], laterStudyId=later['id'],
        earlierVolumeMl=before,laterVolumeMl=after,deltaMl=after-before,
        deltaPercent=(after-before)/before*100 if before else None,
        description='Candidate mask volume comparison only; no spatial registration or treatment-response assessment')

"""HTTP contracts with temporary on-disk MRI studies and the real ownership runtime."""
from io import BytesIO
import json
import numpy as np
import nibabel as nib
import pytest
from flask import Flask, g
import brain
import runtime


@pytest.fixture
def client(tmp_path, monkeypatch):
    # All records stay in this fixture; no patient or repository runtime is touched.
    monkeypatch.setenv('INTELLIGENCE_DATA_DIR', str(tmp_path/'runtime'))
    app = Flask(__name__)
    app.config['TESTING'] = True
    @app.before_request
    def identity():
        from flask import request
        g.actor = request.headers.get('X-Actor-Id','alice')
    @app.errorhandler(runtime.ApiError)
    def api_error(error):
        return {'error':str(error)}, error.status
    app.register_blueprint(brain.bp)
    return app.test_client()


def upload(client, tmp_path, patient='p', study_date='2026-01-01'):
    image = nib.Nifti1Image(np.arange(8*9*10,dtype=np.float32).reshape(8,9,10),np.diag([2,3,4,1]))
    image.header.set_xyzt_units('mm')
    path = tmp_path/'input.nii.gz'; nib.save(image,path)
    return client.post('/brain/studies',data={'file':(BytesIO(path.read_bytes()),'scan.nii.gz'),'patientId':patient,'studyDate':study_date}, content_type='multipart/form-data')


def test_upload_slices_mask_and_ownership(client,tmp_path,monkeypatch):
    response = upload(client,tmp_path)
    assert response.status_code == 201
    study = response.json
    assert study['voxelVolumeMm3'] == pytest.approx(24)
    assert 'owner' not in study
    assert 'path' not in json.dumps(study).lower()
    url = '/brain/studies/'+study['id']
    assert client.get(url,headers={'X-Actor-Id':'bob'}).status_code == 404
    assert client.get('/brain/studies').json['studies'][0]['id'] == study['id']
    assert client.get(url+'/slice?axis=axial&index=2').mimetype == 'image/png'
    assert client.get(url+'/slice?index=1000').status_code == 400
    assert client.get(url+'/mask').status_code == 409
    seen = {}
    def predict(data,affine,points):
        seen['points'] = points
        mask = np.zeros(data.shape,dtype=np.uint8); mask[2:4,3:5,4:6] = 1
        return mask
    monkeypatch.setattr(brain.brain_model,'segment',predict)
    result = client.post(url+'/segment',json={'points':[{'x':3,'y':4,'z':5,'label':1},{'x':1,'y':1,'z':1,'label':0}]})
    assert result.status_code == 200
    assert result.json['segmentation']['volumeMl'] == pytest.approx(.192)
    assert seen['points'][1]['label'] == 0
    exported = client.get(url+'/mask')
    path = tmp_path/'export.nii.gz'; path.write_bytes(exported.data)
    exported_image = nib.load(path)
    assert np.allclose(exported_image.affine,np.diag([2,3,4,1]))
    assert int(np.asarray(exported_image.dataobj).sum()) == 8
    monkeypatch.setattr(brain.brain_model,'segment',lambda data,a,p: np.zeros(data.shape,dtype=np.uint8))
    assert client.post(url+'/segment',json={'points':[{'x':3,'y':4,'z':5,'label':1}]}).json['segmentation']['volumeMl'] == 0
    assert client.get(url+'/mesh?layer=lesion').json['positions'] == []


def test_compare_eligibility_and_owner(client,tmp_path,monkeypatch):
    monkeypatch.setattr(brain.brain_model,'segment',lambda data,a,p: np.ones(data.shape,dtype=np.uint8))
    studies = [upload(client,tmp_path,patient,day).json for patient,day in [('p','2026-01-01'),('p','2026-02-01'),('q','2026-03-01'),('p','2026-01-01'),('p','')]]
    for item in studies:
        assert client.post('/brain/studies/'+item['id']+'/segment',json={'points':[{'x':3,'y':4,'z':5,'label':1}]}).status_code == 200
    url = '/brain/studies/'+studies[0]['id']+'/compare/'
    assert client.get(url+studies[1]['id']).json['deltaMl'] == pytest.approx(0)
    for item in studies[2:]: assert client.get(url+item['id']).status_code == 400
    assert client.get(url+studies[1]['id'],headers={'X-Actor-Id':'bob'}).status_code == 404


def test_axial_display_matches_click_coordinate_contract():
    data = np.arange(4*5*6).reshape(4,5,6)
    displayed = brain.slice_array(data,'axial',2)
    assert displayed.shape == (5,4)
    assert displayed[0,0] == data[0,4,2]
    assert displayed[-1,-1] == data[3,0,2]


def test_corrupt_upload_error_exposes_no_local_path(client):
    result = client.post('/brain/studies',data={'file':(BytesIO(b'not nifti'),'corrupt.nii.gz'),'patientId':'p','studyDate':'2026-01-01'},content_type='multipart/form-data')
    assert result.status_code == 400
    assert '/tmp/' not in result.json['error']
    assert '/home/' not in result.json['error']


def test_default_demo_patient_cannot_be_compared(client,tmp_path,monkeypatch):
    monkeypatch.setattr(brain.brain_model,'segment',lambda data,a,p: np.ones(data.shape,dtype=np.uint8))
    items = [upload(client,tmp_path,'research-demo',day).json for day in ('2026-01-01','2026-02-01')]
    for item in items:
        assert client.post('/brain/studies/'+item['id']+'/segment',json={'points':[{'x':3,'y':4,'z':5,'label':1}]}).status_code == 200
    response = client.get('/brain/studies/'+items[0]['id']+'/compare/'+items[1]['id'])
    assert response.status_code == 400
    assert 'explicit patient' in response.json['error'].lower()

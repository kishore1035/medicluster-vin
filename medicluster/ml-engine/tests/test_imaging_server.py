"""Imaging HTTP contracts; model boundary patched only in isolated tests."""
import base64
from unittest.mock import patch
import pytest
from imaging_server import app


def test_discovery_health_and_invalid_input():
    client=app.test_client()
    assert client.get('/health').json['service']=='medicluster-chest-imaging'
    assert client.get('/models').json['default']=='vindr-cxr-yolov8s'
    assert client.post('/analyze-image',json={}).status_code==400
    assert client.post('/analyze-image',json={'image_b64':'not!base64'}).status_code==400
    assert client.post('/analyze-image',json={'image_b64':'YQ==','model_name':'missing'}).status_code==400
    with patch('imaging_server.analyze_image',side_effect=ValueError('private parser path')):
        result=client.post('/analyze-image',json={'image_b64':'YQ==','model_name':'densenet121-res224-all'})
        assert result.status_code==422
        assert 'private' not in result.json['error']


def test_inference_and_model_failure():
    client=app.test_client()
    expected={'model':'densenet121-res224-all','findings':[{'label':'Effusion','confidence':.12}]}
    with patch('imaging_server.analyze_image',return_value=expected) as inference:
        result=client.post('/analyze-image',json={'image_b64':base64.b64encode(b'pixels').decode(),'filename':'chest.png','model_name':'densenet121-res224-all'})
        assert result.status_code==200 and result.json==expected
        assert inference.call_args.kwargs['filename']=='chest.png'
    with patch('imaging_server.analyze_image',side_effect=RuntimeError('private weights path')):
        result=client.post('/analyze-image',json={'image_b64':'YQ==','model_name':'densenet121-res224-all'})
        assert result.status_code==503 and 'private' not in result.json['error']


def test_corrupt_checkpoint_with_correct_size_is_redownloaded(tmp_path,monkeypatch):
    import io
    import torch
    import download_imaging_models as installer
    model='densenet121-res224-all'
    buffer=io.BytesIO();torch.save({'weight':torch.ones(2)},buffer);valid=buffer.getvalue()
    monkeypatch.setattr(installer,'get_cache_dir',lambda: str(tmp_path))
    monkeypatch.setitem(installer.EXPECTED_SIZES,model,len(valid))
    path=tmp_path/installer.model_urls[model]['weights_url'].rsplit('/',1)[-1]
    path.write_bytes(b'\0'*len(valid))
    monkeypatch.setattr(installer.urllib.request,'urlopen',lambda *a,**k:io.BytesIO(valid))
    installer.download(model)
    assert torch.equal(torch.load(path,weights_only=True)['weight'],torch.ones(2))


def test_detector_http_and_preview_are_independent_of_classifier():
    import io
    from PIL import Image
    from imaging.localization import DETECTOR_ID
    client=app.test_client()
    result={'model':DETECTOR_ID,'findings':[],'localization':{'model':DETECTOR_ID,'width':20,'height':30,'threshold':.25,'boxes':[]}}
    with patch('imaging_server.detect_image',return_value=result) as detector,patch('imaging_server.analyze_image') as classifier:
        response=client.post('/analyze-image',json={'image_b64':'YQ=='})
        assert response.status_code==200 and response.json==result
        detector.assert_called_once();classifier.assert_not_called()
    image=io.BytesIO();Image.new('L',(20,30),128).save(image,format='PNG')
    response=client.post('/preview-image',json={'image_b64':base64.b64encode(image.getvalue()).decode(),'filename':'scan.png'})
    assert response.status_code==200 and response.mimetype=='image/png'
    assert Image.open(io.BytesIO(response.data)).size==(20,30)

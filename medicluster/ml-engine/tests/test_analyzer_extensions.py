import numpy as np
import pytest
from imaging.analyzer import _is_medical_scan, _attach_clinical_info

def test_grayscale_image_passes_validation():
    # Pure grayscale: R == G == B
    arr = np.ones((256, 256, 3), dtype=np.uint8) * 128
    warning = _is_medical_scan(arr)
    assert warning is None

def test_colour_photo_fails_validation():
    # Vivid colour image (green channel very different from red)
    arr = np.zeros((256, 256, 3), dtype=np.uint8)
    arr[:, :, 0] = 200   # R
    arr[:, :, 1] = 20    # G
    arr[:, :, 2] = 20    # B
    warning = _is_medical_scan(arr)
    assert warning is not None
    assert "may not be a medical scan" in warning

def test_small_image_fails_validation():
    arr = np.ones((64, 64, 3), dtype=np.uint8) * 128
    warning = _is_medical_scan(arr)
    assert warning is not None

def test_attach_clinical_info_adds_fields():
    findings = [
        {"label": "Pneumonia", "confidence": 0.87},
        {"label": "Atelectasis", "confidence": 0.43},
    ]
    result = _attach_clinical_info(findings, threshold=0.15)
    assert len(result) == 2
    for f in result:
        assert "cause" in f
        assert "medications" in f
        assert "prevention" in f
        assert "severity" in f

def test_attach_clinical_info_filters_below_threshold():
    findings = [
        {"label": "Pneumonia", "confidence": 0.87},
        {"label": "Nodule", "confidence": 0.10},  # below 0.15
    ]
    result = _attach_clinical_info(findings, threshold=0.15)
    assert len(result) == 1
    assert result[0]["label"] == "Pneumonia"

def test_attach_clinical_info_sorted_descending():
    findings = [
        {"label": "Atelectasis", "confidence": 0.43},
        {"label": "Pneumonia", "confidence": 0.87},
    ]
    result = _attach_clinical_info(findings, threshold=0.15)
    assert result[0]["confidence"] > result[1]["confidence"]


def test_pretrained_scores_are_not_sigmoided_twice(monkeypatch):
    import torch
    import imaging.analyzer as analyzer
    class Model(torch.nn.Module):
        pathologies=['Atelectasis','Pneumonia']
        def forward(self, value): return torch.tensor([[.08,.81]])
    monkeypatch.setattr(analyzer,'_get_model',lambda name:Model())
    monkeypatch.setattr(analyzer,'_load_pixels',lambda data,name:(np.ones((256,256),dtype=np.float32),False))
    monkeypatch.setattr(analyzer,'_preprocess',lambda *args:torch.zeros(1,1,224,224))
    result=analyzer.analyze_image(b'pixels')
    assert result['findings']==[dict(label='Pneumonia',confidence=.81,**{
        key:value for key,value in analyzer.get_clinical_info('Pneumonia').items()
        if key in ('cause','medications','prevention','severity')
    })]


def dicom_bytes(photometric='MONOCHROME2',frames=1):
    import io
    import pydicom
    from pydicom.dataset import FileDataset, FileMetaDataset
    from pydicom.uid import ExplicitVRLittleEndian, SecondaryCaptureImageStorage, generate_uid
    meta=FileMetaDataset();meta.TransferSyntaxUID=ExplicitVRLittleEndian;meta.MediaStorageSOPClassUID=SecondaryCaptureImageStorage;meta.MediaStorageSOPInstanceUID=generate_uid()
    ds=FileDataset('',{},file_meta=meta,preamble=b'\0'*128)
    ds.Rows=128;ds.Columns=128;ds.SamplesPerPixel=1;ds.PhotometricInterpretation=photometric;ds.Modality='CR'
    ds.BitsAllocated=16;ds.BitsStored=12;ds.HighBit=11;ds.PixelRepresentation=0
    if frames>1:ds.NumberOfFrames=frames
    ds.PixelData=(np.arange(128*128*frames,dtype=np.uint16)%4096).tobytes()
    output=io.BytesIO();pydicom.dcmwrite(output,ds,enforce_file_format=True);return output.getvalue()


def test_12bit_chest_dicom_normalizes_before_xrv_preprocessing():
    from imaging.analyzer import _load_pixels,_preprocess
    array,is_dicom=_load_pixels(dicom_bytes(),'xray.dcm')
    assert is_dicom and array.min()==0 and array.max()==255
    assert _preprocess(array,224,is_dicom).shape==(1,1,224,224)
    inverted,_=_load_pixels(dicom_bytes('MONOCHROME1'),'xray.dcm')
    assert inverted[0,0]>inverted[0,1]
    with pytest.raises(ValueError,match='single-frame'):_load_pixels(dicom_bytes(frames=2),'xray.dcm')

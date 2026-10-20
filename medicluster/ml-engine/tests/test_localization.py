"""Detector contracts preserve source geometry and genuine empty results."""
import numpy as np
import pytest
import torch
from imaging.localization import detections_from_result, DETECTOR_ID

class Boxes:
    xyxy=torch.tensor([[-5.,10.,210.,70.],[2.,4.,8.,9.],[1.,1.,2.,2.]])
    conf=torch.tensor([.8,.4,.1]);cls=torch.tensor([0.,1.,0.])
class Result:
    boxes=Boxes();names={0:'Pleural effusion',1:'Nodule/Mass'}

def test_detector_maps_original_pixels_clips_and_summarizes():
    result=detections_from_result(Result(),200,100,.25)
    assert result['localization']['model']==DETECTOR_ID
    assert result['localization']['width']==200
    assert len(result['localization']['boxes'])==2
    box=result['localization']['boxes'][0]
    assert [box[k] for k in ('x1','y1','x2','y2')]==[0,10,200,70]
    assert result['findings'][0]['label']=='Pleural effusion'
    assert result['findings'][0]['confidence']==pytest.approx(.8)

def test_empty_and_nonfinite_predictions_are_not_fabricated():
    class Empty:
        boxes=None;names={}
    assert detections_from_result(Empty(),100,200,.25)['findings']==[]
    assert detections_from_result(Empty(),100,200,.25)['localization']['boxes']==[]
    class Invalid(Boxes):xyxy=torch.tensor([[float('nan'),0,3,4],[3,4,2,1],[1,1,2,2]])
    class Bad(Result):boxes=Invalid()
    with pytest.raises(RuntimeError):detections_from_result(Bad(),200,100,.25)

import numpy as np
from brain_model import infer_with_model


def test_decoder_receives_user_points_labels_and_restore_geometry():
    import torch
    class Prompts:
        def __call__(self, *, points, boxes, masks):
            coords, labels = points
            assert labels.tolist() == [[1,0]]
            # SAM prompt encoder uses tensor W,H,D coordinate ordering directly.
            assert coords.shape == (1,2,3)
            assert boxes is None
            assert masks.shape == (1,1,32,32,32)
            return None, None
        def get_dense_pe(self): return None
    class Model:
        prompt_encoder = Prompts()
        def image_encoder(self, image):
            assert image.shape == (1,1,128,128,128)
            return None
        def mask_decoder(self, *, image_embeddings, image_pe, sparse_prompt_embeddings, dense_prompt_embeddings, multimask_output):
            assert multimask_output is False
            return torch.ones((1,1,32,32,32)), None
    data = np.arange(20*20*20, dtype=np.float32).reshape(20,20,20)
    points = [{'x':10,'y':10,'z':10,'label':1},{'x':11,'y':10,'z':10,'label':0}]
    result = infer_with_model(Model(), 'cpu', data, np.eye(4), points)
    assert result.shape == data.shape
    assert result[10,10,10] == 1

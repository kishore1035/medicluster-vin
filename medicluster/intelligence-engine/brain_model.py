"""Prompt-guided SAM-Med3D inference. Reference annotations never enter this module."""
import os
import logging
import numpy as np
from brain_geometry import make_roi, restore_mask, GeometryError
from runtime import MODEL_DIR, MODEL_LOCK, ApiError

MODEL_NAME = 'SAM-Med3D-turbo'
_model = None
_device = None
_last_error = None


def status():
    return {'model':MODEL_NAME, 'available':(MODEL_DIR / 'sam_med3d_turbo.pth').is_file(), 'loaded':_model is not None, 'researchOnly':True}


def infer_with_model(model, device, data, affine, points):
    import torch
    import torch.nn.functional as F
    roi, roi_affine, coordinates = make_roi(data, affine, points)
    with torch.inference_mode():
        image = torch.from_numpy(roi.copy())[None,None].to(device)
        embedding = model.image_encoder(image)
        coordinates = torch.tensor(coordinates, dtype=torch.float32, device=device)[None]
        labels = torch.tensor([[p['label'] for p in points]], dtype=torch.int64, device=device)
        sparse, dense = model.prompt_encoder(points=[coordinates, labels], boxes=None,
            masks=torch.zeros((1,1,32,32,32), device=device))
        logits, _ = model.mask_decoder(image_embeddings=embedding,
            image_pe=model.prompt_encoder.get_dense_pe(), sparse_prompt_embeddings=sparse,
            dense_prompt_embeddings=dense, multimask_output=False)
        if not torch.isfinite(logits).all():
            raise RuntimeError('SAM-Med3D returned non-finite logits')
        output = F.interpolate(logits, size=(128,128,128), mode='trilinear', align_corners=False)
        candidate = (output[0,0] > 0).cpu().numpy().astype(np.uint8)
    return restore_mask(candidate, roi_affine, data.shape, affine)


def segment(data, affine, points):
    global _model, _device, _last_error
    checkpoint = MODEL_DIR / 'sam_med3d_turbo.pth'
    if not checkpoint.is_file(): raise ApiError(503, 'SAM-Med3D checkpoint unavailable; install the approved model first')
    with MODEL_LOCK:
        try:
            if _model is None:
                import medim
                import torch
                _device = os.environ.get('BRAIN_MODEL_DEVICE') or ('cuda' if torch.cuda.is_available() else 'cpu')
                _model = medim.create_model('SAM-Med3D', pretrained=True, checkpoint_path=str(checkpoint)).to(_device).eval()
            return infer_with_model(_model, _device, data, affine, points)
        except GeometryError:
            raise
        except Exception as exc:
            _last_error = type(exc).__name__
            logging.getLogger(__name__).exception('SAM-Med3D inference failed')
            raise ApiError(503, 'SAM-Med3D inference unavailable; check worker model/device logs') from exc

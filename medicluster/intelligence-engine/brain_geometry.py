"""Geometry in canonical RAS millimetres; array axes remain x, y, z."""
import numpy as np
import math
import nibabel as nib
from scipy.ndimage import affine_transform
from skimage.measure import marching_cubes, block_reduce

MAX_VOXELS = 32_000_000


class GeometryError(ValueError):
    """User-actionable validation message with no local paths."""
    pass


def load_volume(path):
    image = nib.load(path)
    if len(image.shape) != 3 or any(n < 2 for n in image.shape) or math.prod(image.shape) > MAX_VOXELS:
        raise GeometryError('Expected a single-channel 3D volume, at least two voxels per axis, at most 32 million voxels')
    unit = image.header.get_xyzt_units()[0]
    if unit not in ('mm', 'meter', 'micron'):
        raise GeometryError('NIfTI must declare known physical spatial units')
    affine = np.array(image.affine, dtype=float)
    if not np.isfinite(affine).all() or np.linalg.det(affine[:3,:3]) == 0:
        raise GeometryError('NIfTI requires finite invertible geometry')
    factor = {'mm':1, 'meter':1000, 'micron':.001}[unit]
    affine[:3,:] *= factor
    data = image.get_fdata(dtype=np.float32)
    if not np.isfinite(data).all():
        raise GeometryError('NIfTI intensities must be finite')
    canonical = nib.as_closest_canonical(nib.Nifti1Image(data, affine))
    canonical.header.set_xyzt_units('mm')
    return canonical


def validate_points(points, shape):
    if not isinstance(points, list) or not 1 <= len(points) <= 64:
        raise GeometryError('Provide 1–64 positive/negative points')
    clean = []
    for p in points:
        if not isinstance(p, dict) or p.get('label') not in (0,1) or isinstance(p.get('label'), bool):
            raise GeometryError('Each point requires label 0 or 1')
        try:
            xyz = [float(p[k]) for k in ('x','y','z')]
        except (KeyError, TypeError, ValueError):
            raise GeometryError('Point coordinates must be finite voxel coordinates')
        if any(not np.isfinite(v) or v < 0 or v > shape[i]-1 for i,v in enumerate(xyz)):
            raise GeometryError('Point outside volume')
        clean.append(dict(zip(('x','y','z'),xyz), label=int(p['label'])))
    if not any(p['label'] for p in clean):
        raise GeometryError('At least one positive point is required')
    return clean


def make_roi(data, affine, points, size=128, spacing=1.5):
    """Prompt-centered physical ROI. No annotation is accepted by this interface."""
    coordinates = np.array([[p['x'],p['y'],p['z']] for p in points])
    world = nib.affines.apply_affine(affine, coordinates)
    center = (world.min(axis=0) + world.max(axis=0)) / 2
    roi_affine = np.diag([spacing,spacing,spacing,1.])
    roi_affine[:3,3] = center - spacing * (size-1)/2
    mapped = nib.affines.apply_affine(np.linalg.inv(roi_affine), world)
    if ((mapped < 0) | (mapped > size-1)).any():
        raise GeometryError('Points span more than the 192 mm model field of view; use closer points')
    transform = np.linalg.inv(affine) @ roi_affine
    roi = affine_transform(data, transform[:3,:3], transform[:3,3], output_shape=(size,)*3, order=1, mode='constant', cval=0, prefilter=False)
    positive = roi[roi > 0]
    if positive.size < 2 or positive.std() < 1e-8:
        raise GeometryError('Model ROI requires varying positive intensities for normalization')
    roi = (roi - positive.mean()) / positive.std(ddof=1)
    return roi.astype(np.float32), roi_affine, mapped


def restore_mask(mask, roi_affine, shape, affine):
    transform = np.linalg.inv(roi_affine) @ affine
    return affine_transform(mask.astype(np.uint8), transform[:3,:3], transform[:3,3], output_shape=shape, order=0, mode='constant', cval=0, prefilter=False).astype(np.uint8)


def build_mesh(mask, affine, max_faces=60000):
    binary = np.asarray(mask, dtype=bool)
    empty = {'positions':[], 'indices':[], 'coordinateSystem':'RAS-mm'}
    if not binary.any(): return empty
    # Coarsen the grid until its actual surface satisfies the strict browser bound.
    stride = max(1, int(np.ceil(max(binary.shape)/160)))
    while True:
        # Max pooling preserves tiny lesions that point subsampling could erase.
        sampled = binary if stride == 1 else block_reduce(binary, (stride,)*3, np.max)
        padded = np.pad(sampled.astype(np.uint8), 1)
        if not sampled.any(): return empty
        vertices, faces, _, _ = marching_cubes(padded, level=.5, allow_degenerate=False)
        if len(faces) <= max_faces or stride >= max(binary.shape): break
        stride += 1
    vertices = (vertices-1)*stride + (stride-1)/2
    vertices = np.clip(vertices, -.5, np.array(binary.shape)-.5)
    vertices = nib.affines.apply_affine(affine, vertices)
    return {'positions':vertices.ravel().round(4).tolist(), 'indices':faces.ravel().tolist(), 'coordinateSystem':'RAS-mm', 'gridStride':stride, 'approximate':stride>1}

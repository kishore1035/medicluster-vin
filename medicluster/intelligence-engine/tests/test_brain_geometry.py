import numpy as np
import nibabel as nib
import pytest
from brain_geometry import load_volume, make_roi, restore_mask, build_mesh, validate_points


def test_units_flips_and_physical_volume(tmp_path):
    a = np.diag([-0.002, 0.003, 0.004, 1.0])
    image = nib.Nifti1Image(np.ones((6, 7, 8), dtype=np.float32), a)
    image.header.set_xyzt_units('meter')
    path = tmp_path / 'v.nii.gz'
    nib.save(image, path)
    canonical = load_volume(path)
    assert nib.aff2axcodes(canonical.affine) == ('R', 'A', 'S')
    assert abs(np.linalg.det(canonical.affine[:3, :3])) == pytest.approx(24)
    assert canonical.header.get_xyzt_units()[0] == 'mm'


def test_reject_unknown_units_and_nonfinite(tmp_path):
    path = tmp_path / 'v.nii'
    image = nib.Nifti1Image(np.ones((4, 5, 6), dtype=np.float32), np.eye(4))
    nib.save(image, path)
    with pytest.raises(ValueError, match='units'):
        load_volume(path)
    image.header.set_xyzt_units('mm')
    image.get_fdata()[0, 0, 0] = np.nan
    image = nib.Nifti1Image(np.full((4,5,6), np.nan), np.eye(4), image.header)
    nib.save(image, path)
    with pytest.raises(ValueError, match='finite'):
        load_volume(path)


def test_roi_affine_prompt_and_mask_round_trip():
    data = np.zeros((20, 24, 18), dtype=np.float32)
    data[2:18, 2:22, 2:16] = np.arange(16)[:,None,None] + 1
    affine = np.diag([2., 3., 4., 1.]); affine[:3,3] = [-40, 10, 20]
    points = [{'x':8, 'y':11, 'z':9, 'label':1}, {'x':10,'y':12,'z':10,'label':0}]
    roi, roi_affine, coords = make_roi(data, affine, points)
    assert roi.shape == (128,128,128)
    for p, coordinate in zip(points, coords):
        assert np.allclose(roi_affine @ [*coordinate, 1], affine @ [p['x'],p['y'],p['z'],1])
    mask = np.zeros_like(roi, dtype=np.uint8)
    index = np.rint(coords[0]).astype(int)
    mask[tuple(slice(i-2,i+3) for i in index)] = 1
    restored = restore_mask(mask, roi_affine, data.shape, affine)
    assert restored[8,11,9] == 1
    assert restored[0,0,0] == 0


def test_mesh_empty_and_world_coordinates():
    assert build_mesh(np.zeros((5,5,5)), np.eye(4))['positions'] == []
    data = np.zeros((8,8,8)); data[2:5,2:5,2:5] = 1
    affine = np.diag([2,3,4,1]); affine[:3,3] = [10,20,30]
    mesh = build_mesh(data, affine)
    vertices = np.array(mesh['positions']).reshape(-1,3)
    assert vertices.min(axis=0) == pytest.approx([13,24.5,36])
    assert len(mesh['indices']) <= 180000


def test_points_require_positive_and_bounds():
    with pytest.raises(ValueError): validate_points([{'x':1,'y':1,'z':1,'label':0}], (5,5,5))
    with pytest.raises(ValueError): validate_points([{'x':5,'y':1,'z':1,'label':1}], (5,5,5))
    with pytest.raises(ValueError): validate_points([{'x':1,'y':1,'z':float('nan'),'label':1}], (5,5,5))


def test_prompt_field_of_view_is_bounded_without_silent_clipping():
    data = np.ones((220,4,4),dtype=np.float32)
    data[:,1,1] = np.arange(220)+1
    points = [{'x':0,'y':1,'z':1,'label':1},{'x':219,'y':1,'z':1,'label':0}]
    with pytest.raises(ValueError,match='field of view'):
        make_roi(data,np.eye(4),points)


def test_mesh_browser_bound_on_fragmented_foreground():
    mask = np.indices((32,32,32)).sum(axis=0)%2
    mesh = build_mesh(mask,np.eye(4),max_faces=2000)
    assert len(mesh['positions']) > 0
    assert len(mesh['indices']) <= 6000
    assert np.isfinite(mesh['positions']).all()

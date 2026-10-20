"""Download pinned public research checkpoints; never handles patient data."""
from pathlib import Path
import hashlib
import json
from huggingface_hub import hf_hub_download

ROOT = Path(__file__).resolve().parent / '.models'
EXPECTED = {
 'sam_med3d_turbo.pth': '899a46d04d3b70f723282ceb489149373558bf0aaba389a346f5ab57da5cdd3c',
 'config.json': 'ef1143bfdc9c0376d9a056eefca46cb4b1ec3d0ffacd541ff56feb40fb708031',
 'model.safetensors': 'ddcda3c7508bf2528087723e98a20707cc04b7f370ae275a9fd88078ddba4f42',
}
FILES = [
 ('blueyo0/SAM-Med3D', 'fc482a040ea69cdc9ae576a1d6bd9db02ab1994c', 'sam_med3d_turbo.pth', ROOT),
 ('amazon/chronos-2', '29ec3766d36d6f73f0696f85560a422f50e8498c', 'config.json', ROOT / 'chronos-2'),
 ('amazon/chronos-2', '29ec3766d36d6f73f0696f85560a422f50e8498c', 'model.safetensors', ROOT / 'chronos-2'),
]

def main():
    records=[]
    for repository, revision, filename, target in FILES:
        target.mkdir(parents=True, exist_ok=True)
        path=Path(hf_hub_download(repository, filename, revision=revision, local_dir=target))
        digest=hashlib.sha256()
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024*1024), b''): digest.update(chunk)
        if digest.hexdigest() != EXPECTED[filename]:
            raise RuntimeError(f'Checkpoint checksum mismatch: {filename}')
        records.append(dict(repository=repository, revision=revision, file=str(path.relative_to(ROOT)), sha256=digest.hexdigest(), license='Apache-2.0'))
        print(f'{filename}: verified local SHA-256 {digest.hexdigest()}',flush=True)
    (ROOT/'provenance.json').write_text(json.dumps(records,indent=2)+'\n')

if __name__ == '__main__': main()

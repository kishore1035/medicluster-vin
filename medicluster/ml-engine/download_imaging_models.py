"""Install official TorchXRayVision release weights atomically, recording provenance."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import urllib.request
import tempfile
import os
import torch
from torchxrayvision.models import model_urls
from torchxrayvision.utils import get_cache_dir

EXPECTED_SIZES={
 'densenet121-res224-all':28382008,
 'densenet121-res224-chex':28381998,
 'densenet121-res224-nih':28382096,
 'densenet121-res224-pc':28381804,
 'resnet50-res512-all':94471272,
}

def valid_checkpoint(path, expected_size):
    if not path.is_file() or path.stat().st_size != expected_size: return False
    try:
        # These pinned official release files include legacy serialized model objects.
        torch.load(path, map_location='cpu', weights_only=False)
        return True
    except Exception: return False


def download(model):
    url=model_urls[model]['weights_url']
    root=Path(get_cache_dir());root.mkdir(parents=True,exist_ok=True)
    target=root/url.rsplit('/',1)[-1]
    if not valid_checkpoint(target,EXPECTED_SIZES[model]):
        fd,name=tempfile.mkstemp(prefix=target.name+'.',suffix='.download',dir=root)
        os.close(fd);temporary=Path(name)
        try:
            with urllib.request.urlopen(url+"?download=1",timeout=120) as source,temporary.open('wb') as output:
                while chunk:=source.read(1024*1024):output.write(chunk)
            if not valid_checkpoint(temporary,EXPECTED_SIZES[model]):raise RuntimeError('Invalid or incomplete model download: '+model)
            temporary.replace(target)
        finally:temporary.unlink(missing_ok=True)
    digest=hashlib.sha256(target.read_bytes()).hexdigest()
    print(model, 'verified',target.stat().st_size,'bytes',flush=True)
    return dict(model=model,url=url,bytes=target.stat().st_size,sha256=digest,library='torchxrayvision==1.4.0')

if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=3) as pool: records=list(pool.map(download,EXPECTED_SIZES))
    (Path(get_cache_dir())/'medicluster-provenance.json').write_text(json.dumps(records,indent=2)+'\n')

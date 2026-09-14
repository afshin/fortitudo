"""Verify the actual distributions, including every compiler asset."""

import hashlib
import json
from pathlib import Path
import tarfile
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
manifest = json.loads((root / 'compiler/manifest.json').read_text())
assert manifest['origin'] == 'source', 'Build the pinned compiler first.'
expected = dict(manifest['files'])
for name in ['manifest.json', 'worker.js']:
    data = (root / 'compiler' / name).read_bytes()
    expected[name] = {
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
    }


def verify(label, read):
    for name, entry in expected.items():
        data = read(name)
        assert len(data) == entry['bytes'], f'{label}: {name} has wrong size'
        assert hashlib.sha256(data).hexdigest() == entry['sha256'], (
            f'{label}: {name} has wrong hash'
        )
    print(f'{label}: {len(expected)} compiler files verified')


for name in [
    'fortitudo/labextension/static/compiler',
    'dist/standalone/compiler',
    'lite/_output/extensions/fortitudo/static/compiler',
    'dist/site/compiler',
    'dist/site/lite/extensions/fortitudo/static/compiler',
]:
    verify(name, lambda path, base=root / name: (base / path).read_bytes())

archives = [
    (root / 'dist/fortitudo.tgz', 'package/compiler/'),
    (root / f'dist/fortitudo-{version}.tar.gz',
     f'fortitudo-{version}/fortitudo/labextension/static/compiler/'),
]
for archive, prefix in archives:
    with tarfile.open(archive) as package:
        def read(name):
            member = package.extractfile(prefix + name)
            assert member is not None, f'{archive.name}: {name} missing'
            return member.read()
        verify(archive.name, read)
        if prefix == 'package/compiler/':
            for module in ['types', 'execution', 'runner', 'wasm', 'terminal']:
                for suffix in ['js', 'd.ts']:
                    name = f'package/lib/compiler/{module}.{suffix}'
                    assert package.getmember(name).size > 0, name
            entry = package.extractfile('package/lib/index.d.ts')
            assert entry is not None, 'Missing shared library declarations.'
            declarations = entry.read().decode()
            for contract in ['Artifact', 'Stage', 'IRunner', 'inspectWasm']:
                assert contract in declarations, f'Missing {contract} export'
        assert not any('/.cache/' in name or '/node_modules/' in name
                       for name in package.getnames())

wheel = root / f'dist/fortitudo-{version}-py3-none-any.whl'
assert wheel.is_file(), 'Build the current wheel first.'
with zipfile.ZipFile(wheel) as package:
    matches = [name for name in package.namelist()
               if name.endswith('/static/compiler/manifest.json')]
    assert len(matches) == 1, 'The wheel must contain one compiler copy.'
    for match in matches:
        prefix = match.removesuffix('manifest.json')
        verify(wheel.name, lambda name: package.read(prefix + name))

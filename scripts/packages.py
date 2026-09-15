"""Verify the actual distributions, including every compiler asset."""

from email.parser import BytesParser
import hashlib
import json
from pathlib import Path
import tarfile
import zipfile

root = Path(__file__).resolve().parent.parent
project = json.loads((root / 'package.json').read_text())
version = project['version']
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


def verify_metadata(data, label):
    metadata = BytesParser().parsebytes(data)
    assert metadata['Name'] == project['name'], label
    assert metadata['Version'] == version, label
    assert metadata['Summary'] == project['description'], label
    assert set(metadata['Keywords'].split(',')) == set(project['keywords']), (
        label
    )
    urls = dict(value.split(', ', 1)
                for value in metadata.get_all('Project-URL'))
    assert urls['Homepage'] == project['homepage'], label
    assert urls['Bug Tracker'] == project['bugs']['url'], label
    assert urls['Repository'] == project['repository']['url'], label
    description = metadata.get_payload(decode=True).decode('utf-8')
    readme = (root / 'README.md').read_text()
    assert description.strip() == readme.strip(), label
    print(f'{label}: package metadata and README verified')


guide = (root / 'lite/files/Fortitudo guide.md').read_bytes()
for name in [
    'lite/_output/files/Fortitudo guide.md',
    'dist/site/lite/files/Fortitudo guide.md',
]:
    assert (root / name).read_bytes() == guide, f'{name}: stale guide'


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
            metadata = package.extractfile('package/package.json')
            assert metadata is not None, 'Missing npm metadata.'
            assert json.load(metadata) == project, 'Stale npm metadata.'
            guide_module = package.extractfile('package/lib/generated/guide.js')
            assert guide_module is not None, 'Missing generated guide.'
            assert guide_module.read() == (
                root / 'lib/generated/guide.js'
            ).read_bytes(), 'Stale npm guide.'
            for module in ['types', 'execution', 'runner', 'wasm', 'terminal']:
                for suffix in ['js', 'd.ts']:
                    name = f'package/lib/compiler/{module}.{suffix}'
                    assert package.getmember(name).size > 0, name
            entry = package.extractfile('package/lib/index.d.ts')
            assert entry is not None, 'Missing shared library declarations.'
            declarations = entry.read().decode()
            for contract in ['Artifact', 'Stage', 'IRunner', 'inspectWasm']:
                assert contract in declarations, f'Missing {contract} export'
        else:
            metadata = package.extractfile(f'fortitudo-{version}/PKG-INFO')
            assert metadata is not None, 'Missing Python metadata.'
            verify_metadata(metadata.read(), archive.name)
        assert not any('/.cache/' in name or '/node_modules/' in name
                       for name in package.getnames())

wheel = root / f'dist/fortitudo-{version}-py3-none-any.whl'
assert wheel.is_file(), 'Build the current wheel first.'
with zipfile.ZipFile(wheel) as package:
    verify_metadata(
        package.read(f'fortitudo-{version}.dist-info/METADATA'), wheel.name
    )
    matches = [name for name in package.namelist()
               if name.endswith('/static/compiler/manifest.json')]
    assert len(matches) == 1, 'The wheel must contain one compiler copy.'
    for match in matches:
        prefix = match.removesuffix('manifest.json')
        verify(wheel.name, lambda name: package.read(prefix + name))

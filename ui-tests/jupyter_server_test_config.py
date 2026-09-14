from pathlib import Path

root = Path(__file__).resolve().parent.parent
runtime = root / '.cache' / 'jupyter'
contents = root / 'work' / 'jupyter'
runtime.mkdir(parents=True, exist_ok=True)
contents.mkdir(parents=True, exist_ok=True)

c = get_config()  # noqa: F821
c.ServerApp.ip = '127.0.0.1'
c.ServerApp.port = 8766
c.ServerApp.port_retries = 0
c.ServerApp.open_browser = False
c.ServerApp.root_dir = str(contents)
c.ServerApp.base_url = '/fortitudo/'
c.ServerApp.runtime_dir = str(runtime)
c.IdentityProvider.token = ''

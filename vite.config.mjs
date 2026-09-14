import { cpSync, createReadStream, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'standalone',
  base: './',
  build: {
    target: 'es2022',
    outDir: '../dist/standalone',
    emptyOutDir: true
  },
  plugins: [
    {
      name: 'fortitudo-compiler',
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (id.includes('/@jupyterlab/')) {
            throw new Error(`Jupyter code reached the standalone build: ${id}`);
          }
        }
      },
      configureServer(server) {
        const directory = resolve('compiler');
        server.middlewares.use('/compiler', (request, response, next) => {
          const url = new URL(request.url, 'http://localhost');
          const path = resolve(
            directory,
            `.${decodeURIComponent(url.pathname)}`
          );
          if (!path.startsWith(directory + sep)) {
            return next();
          }
          try {
            if (!statSync(path).isFile()) {
              return next();
            }
          } catch {
            return next();
          }
          const type = path.endsWith('.js')
            ? 'text/javascript'
            : path.endsWith('.json')
              ? 'application/json'
              : path.endsWith('.wasm')
                ? 'application/wasm'
                : 'application/octet-stream';
          response.setHeader('Content-Type', type);
          createReadStream(path).pipe(response);
        });
      },
      closeBundle() {
        cpSync(resolve('compiler'), resolve('dist/standalone/compiler'), {
          recursive: true
        });
      }
    }
  ]
});

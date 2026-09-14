import { cpSync, createReadStream, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const output = mode === 'site' ? 'dist/site' : 'dist/standalone';
  return {
    root: 'standalone',
    base: './',
    build: {
      target: 'es2022',
      outDir: `../${output}`,
      emptyOutDir: true
    },
    plugins: [
      {
        name: 'fortitudo-compiler',
        transformIndexHtml() {
          if (mode !== 'site') {
            return [];
          }
          return [
            {
              tag: 'nav',
              attrs: {
                class: 'fortitudo-navigation',
                'aria-label': 'Applications'
              },
              children: [
                { tag: 'strong', children: 'Fortitudo' },
                {
                  tag: 'a',
                  attrs: {
                    href: './lite/lab/index.html',
                    target: '_blank',
                    rel: 'noopener'
                  },
                  children:
                    '<img src="./jupyter.svg" alt="" width="18" height="18">' +
                    '<span>Try in Jupyter</span>' +
                    '<span aria-hidden="true">↗</span>'
                }
              ],
              injectTo: 'body-prepend'
            }
          ];
        },
        generateBundle() {
          for (const id of this.getModuleIds()) {
            if (id.includes('/@jupyterlab/')) {
              throw new Error(
                `Jupyter code reached the standalone build: ${id}`
              );
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
          cpSync(resolve('compiler'), resolve(output, 'compiler'), {
            recursive: true
          });
        }
      }
    ]
  };
});

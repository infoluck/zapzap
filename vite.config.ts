import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function whatsappProxyPlugin(): Plugin {
  return {
    name: 'whatsapp-proxy-plugin',
    configureServer(server) {
      server.middlewares.use('/api/whatsapp-proxy', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const { url, method = 'GET', apiKey, payload } = data;

              if (!url) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing url' }));
                return;
              }

              const trimmedKey = (apiKey || '').trim();
              const headers: Record<string, string> = {
                'Apikey': trimmedKey,
                'apikey': trimmedKey,
                'Authorization': `Bearer ${trimmedKey}`,
                'Content-Type': 'application/json',
              };

              const fetchOptions: RequestInit = {
                method,
                headers,
              };

              if (payload && method !== 'GET' && method !== 'HEAD') {
                fetchOptions.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
              }

              const targetRes = await fetch(url, fetchOptions);
              const contentType = targetRes.headers.get('content-type') || '';

              res.statusCode = targetRes.status;

              if (contentType.includes('image')) {
                const arrayBuf = await targetRes.arrayBuffer();
                const base64 = Buffer.from(arrayBuf).toString('base64');
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    status: targetRes.status,
                    contentType,
                    base64: `data:${contentType};base64,${base64}`,
                  })
                );
              } else {
                const text = await targetRes.text();
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    status: targetRes.status,
                    contentType,
                    text,
                  })
                );
              }
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Proxy error' }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end('Method Not Allowed');
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), whatsappProxyPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

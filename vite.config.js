import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleAIExplain } from './src/api/handlers/aiExplain.js';

// ---------------------------------------------------------------------------
// Dev plugin: local Netlify Functions emulator
//
// Intercepts /.netlify/functions/<name> during `vite dev` and routes the
// request through the EXACT same handler that runs in production. Zero
// divergence — what you test locally is what you deploy.
//
// To use: set OPENAI_API_KEY in .env (never commit that file).
// ---------------------------------------------------------------------------
function netlifyFunctionsDevPlugin() {
  // Map function URL slugs → handler functions.
  // Add entries here as you add more Netlify Functions.
  const functionHandlers = {
    'ai-explain': handleAIExplain,
  };

  return {
    name: 'netlify-functions-dev',

    configureServer(server) {
      server.middlewares.use('/.netlify/functions', async (req, res, next) => {
        // Extract the function name from the URL path
        // e.g.  /.netlify/functions/ai-explain  →  'ai-explain'
        const fnName = req.url?.replace(/^\//, '').split('?')[0];
        const handlerFn = fnName ? functionHandlers[fnName] : undefined;

        if (!handlerFn) {
          // Unknown function — fall through to Vite's 404
          return next();
        }

        // Read the full request body before handing off
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const rawBody = Buffer.concat(chunks).toString() || null;

        try {
          const result = await handlerFn({
            method:  req.method ?? 'GET',
            headers: req.headers,
            rawBody,
          });

          res.writeHead(result.status, result.headers);
          res.end(result.body);
        } catch (err) {
          // The handler itself should never throw, but be defensive
          console.error(`[netlify-dev] Unhandled error in "${fnName}":`, err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal error in local function handler.' }));
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Vite config
// ---------------------------------------------------------------------------
export default defineConfig(({ mode }) => {
  // loadEnv with prefix='' loads ALL variables (not just VITE_* ones).
  // We assign them to process.env so the dev plugin above (which runs in
  // Node.js context) can read OPENAI_API_KEY, LOG_PROMPTS, etc. from .env.
  //
  // VITE_* variables are still available in the browser bundle as normal.
  // Non-VITE_* variables (like OPENAI_API_KEY) are NOT injected into the
  // browser bundle — they remain server-side only.
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      netlifyFunctionsDevPlugin(),
    ],
    server: {
      proxy: {
        // Existing: Flask backend for local Python enrichment pipeline
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
        },
      },
    },
  };
});

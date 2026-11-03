const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openStore, DataError } = require('./database/store.cjs');
const { openSupabaseStore } = require('./database/supabase-store.cjs');
const {createAuth}=require('./database/auth.cjs');
const root = __dirname;
const staticFiles = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/style.css', 'style.css'],
  ['/auth.js','auth.js'],['/dist/auth.js','dist/auth.js'],
  ['/assets/antonini-prestamos.png', 'assets/antonini-prestamos.png'],
  ['/dist/assets/antonini-prestamos.png', 'assets/antonini-prestamos.png'],
  ['/favicon.ico', 'assets/antonini-prestamos.png'],
  ['/dist/', 'dist/index.html'], ['/dist/index.html', 'dist/index.html'], ['/dist/app.js', 'dist/app.js'], ['/dist/style.css', 'dist/style.css']
]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
function createServer(store, options = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    const host = req.headers.host;
    const allowedHosts = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`, `[::1]:${req.socket.localPort}`];
    if (!allowedHosts.includes(host)) return json(res, 403, { error: 'Host no autorizado.' });
    if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, 403, { error: 'Origen no autorizado.' });
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return json(res, 400, { error: 'Ruta inválida.' }); }
    try {
      if(options.auth && await options.auth.handle(req,res,pathname))return;
      if(pathname.startsWith('/api/')){
        if(!options.auth)return json(res,503,{error:'El acceso seguro todavía no está configurado.'});
        if(!await options.auth.authorize(req))return json(res,401,{error:'Tu sesión terminó. Inicia sesión para continuar.'});
      }
    }catch(error){return json(res,error.status||503,{error:error.status===401?'Tu sesión terminó. Inicia sesión nuevamente.':'No se pudo validar el acceso. Inténtalo de nuevo.'})}
    if (pathname === '/api/system') return json(res, 200, { storage: options.storage || 'sqlite', automaticMail: options.storage === 'supabase' });
    if (pathname === '/api/alerts' || pathname === '/api/mail-status') {
      if (req.method !== 'GET') return json(res, 405, { error: 'Método no permitido.' });
      try { return json(res, 200, pathname === '/api/alerts' ? await store.alerts?.() || [] : await store.mailStatus?.() || []); }
      catch { return json(res, 503, { error: 'No se pudo consultar Supabase.' }); }
    }
    if (pathname === '/api/state') {
      if (req.method === 'GET') {
        try { return json(res, 200, await store.read()); }
        catch (error) { return json(res, error.status || 503, { error: error.message }); }
      }
      if (req.method !== 'PUT') return json(res, 405, { error: 'Método no permitido.' });
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return json(res, 415, { error: 'Se requiere JSON.' });
      try {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 5 * 1024 * 1024) throw new DataError('La solicitud supera el límite de 5 MB.', 413);
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new DataError('JSON inválido.'); }
        if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new DataError('Versión de datos inválida.');
        return json(res, 200, await store.write(input.data, input.revision));
      } catch (error) {
        if (!(error instanceof DataError)) console.error('Error de guardado:', error);
        return json(res, error.status || 500, { error: error instanceof DataError ? error.message : 'No se pudieron guardar los datos.' });
      }
    }
    // Only public assets are served: database files and source code stay private.
    const relative = staticFiles.get(pathname);
    if (!relative) return json(res, 404, { error: 'No encontrado.' });
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Método no permitido.' });
    fs.readFile(path.join(root, relative), (error, data) => {
      if (error) return json(res, 404, { error: 'No encontrado.' });
      res.writeHead(200, { 'Content-Type': types[path.extname(relative)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}
if (require.main === module) {
  const envFile = path.join(root, '.env.local');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const mailEnv=path.join(root,'supabase','.env.local');
  if(fs.existsSync(mailEnv))process.loadEnvFile(mailEnv);
  const filename = process.env.ANTONINI_DB_PATH || path.join(root, 'data', 'antonini.sqlite');
  const storage = process.env.ANTONINI_STORAGE || 'sqlite';
  if (!['sqlite', 'supabase'].includes(storage)) throw new Error('ANTONINI_STORAGE debe ser sqlite o supabase.');
  const store = storage === 'supabase' ? openSupabaseStore({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }) : openStore(filename);
  const auth=createAuth({url:process.env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY,filename:path.join(root,'data','auth-sessions.sqlite'),mail:{apiKey:process.env.BREVO_API_KEY,from:process.env.MAIL_FROM,replyTo:process.env.MAIL_REPLY_TO}});
  const server = createServer(store, { storage,auth });
  server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Antonini: http://127.0.0.1:${server.address().port} · ${storage} conectado`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close();auth.close(); process.exit(0); }));
}
module.exports = { createServer };

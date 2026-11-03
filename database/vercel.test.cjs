const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');
const {createVercelHandler}=require('../vercel-handler.cjs');const {PGlite}=require('@electric-sql/pglite');
const user={id:'11111111-1111-4111-8111-111111111111',email:'admin@example.com'};
const env={NEXT_PUBLIC_SUPABASE_URL:'https://supabase.example.com',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private-test-only',ANTONINI_STORAGE:'supabase',VERCEL_URL:'preview.example.vercel.app'};
test('Vercel APIs persist encrypted sessions across instances, serialize refresh, set HTTPS cookies and share logout',async t=>{
 const rows=new Map();let refreshes=0,attempts=0;
 const fetchFn=async(input,opts={})=>{
  const u=new URL(input),data=opts.body?JSON.parse(opts.body):{},method=opts.method||'GET';
  if(u.pathname==='/auth/v1/token'){
   if(u.searchParams.get('grant_type')==='refresh_token'){refreshes++;await new Promise(r=>setTimeout(r,30))}
   return Response.json({user,access_token:'private-user-token',refresh_token:'private-refresh-token',expires_in:3600});
  }
  if(u.pathname==='/auth/v1/user')return Response.json(user);
  if(u.pathname==='/rest/v1/administradores')return Response.json([{usuario_id:user.id}]);
  if(u.pathname==='/rest/v1/rpc/leer_estado_antonini')return Response.json({revision:1,data:{people:[]}});
  if(u.pathname==='/rest/v1/rpc/limitar_intentos_acceso')return Response.json(++attempts<=12);
  if(u.pathname==='/rest/v1/rpc/adquirir_renovacion_sesion'){const row=rows.get(data.p_id);if(!row||row.ticket)return Response.json(null);row.ticket='22222222-2222-4222-8222-222222222222';return Response.json(row.ticket)}
  if(u.pathname==='/rest/v1/sesiones_acceso'){
   if(method==='POST'){rows.set(data.id_hash,{...data});return Response.json([data])}
   const matches=[...rows.values()].filter(row=>[...u.searchParams].filter(([k])=>k!=='select').every(([k,v])=>v.startsWith('eq.')?String(row[k])===v.slice(3):v.startsWith('lte.')?row[k]<=Number(v.slice(4)):false));
   if(method==='DELETE'){for(const row of matches)rows.delete(row.id_hash);return Response.json(matches)}
   if(method==='PATCH'){for(const row of matches)Object.assign(row,data);return Response.json(matches)}
   return Response.json(matches);
  }
  throw Error('Unexpected cloud request: '+u.pathname);
 };
 const one=createVercelHandler({env,fetchFn}),two=createVercelHandler({env,fetchFn});
 const server=http.createServer((req,res)=>(req.headers['x-test-instance']==='two'?two:one)(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))});
 const call=(route,{data,cookie,instance='one',host='proyectopapa.vercel.app',origin='https://proyectopapa.vercel.app'}={})=>new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:route,method:data?'POST':'GET',headers:{Host:host,Origin:origin,'x-test-instance':instance,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data:JSON.parse(text)}))});req.on('error',reject);req.end(data?JSON.stringify(data):undefined);
 });
 assert.equal((await call('/api/auth/session')).status,401);
 const login=await call('/api/auth/login',{data:{email:user.email,password:'password',remember:false}});assert.equal(login.status,200);assert(login.headers['set-cookie'][0].includes('; Secure'));
 const cookie=login.headers['set-cookie'][0].split(';')[0];assert.equal(rows.size,1);const stored=[...rows.values()][0];assert(!stored.tokens_cifrados.includes('private-user-token'));assert(!JSON.stringify(login.data).includes('token'));
 assert.equal((await call('/api/state',{cookie,instance:'two'})).status,200);
 stored.token_expira_ms=Date.now()-1000;
 const renewed=await Promise.all([call('/api/state',{cookie}),call('/api/state',{cookie,instance:'two'})]);assert(renewed.every(r=>r.status===200));assert.equal(refreshes,1);
 assert.equal((await call('/api/state',{cookie,host:'malicious.example',origin:'https://malicious.example'})).status,403);
 assert.equal((await call('/api/state',{cookie,origin:'https://malicious.example'})).status,403);
 assert.equal((await call('/api/auth/logout',{cookie,instance:'two',data:{}})).status,200);
 assert.equal((await call('/api/state',{cookie})).status,401);
 for(const route of ['auth/session','auth/login','auth/logout','auth/recover','auth/recovery','auth/password','state','system','alerts','mail-status'])assert.equal(typeof require('../api/'+route+'.js'),'function');
});
test('cloud session SQL restricts access, limits attempts globally and locks refresh without touching financial data',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${user.id}');`);
 const sql=fs.readFileSync('database/09_sesiones_vercel.sql','utf8');await pg.exec(sql);await pg.exec(sql);
 const hash='a'.repeat(64);
 await pg.query(`INSERT INTO public.sesiones_acceso(id_hash,usuario_id,correo,tokens_cifrados,token_expira_ms,expira_ms,recordar,proposito) VALUES($1,$2,$3,'encrypted',0,(extract(epoch FROM now())*1000)::bigint+3600000,0,'app')`,[hash,user.id,user.email]);
 for(let i=1;i<=13;i++)assert.equal((await pg.query('SELECT public.limitar_intentos_acceso($1) AS permitido',[hash])).rows[0].permitido,i<=12);
 assert((await pg.query('SELECT public.adquirir_renovacion_sesion($1) AS ticket',[hash])).rows[0].ticket);
 assert.equal((await pg.query('SELECT public.adquirir_renovacion_sesion($1) AS ticket',[hash])).rows[0].ticket,null);
 await pg.exec('SET ROLE anon');await assert.rejects(pg.query('SELECT * FROM public.sesiones_acceso'),/permission denied/);await assert.rejects(pg.query('SELECT public.limitar_intentos_acceso($1)',[hash]),/permission denied/);await pg.exec('RESET ROLE');
 assert.equal((await pg.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name IN('sesiones_acceso','intentos_acceso')`)).rows[0].n,2);
});
test('Vercel JSON parsing accepts already parsed bodies without re-reading an exhausted stream',async()=>{
 const {readJsonBody}=require('./request.cjs');
 for(const body of [{email:'admin@example.com',password:'correct'},JSON.stringify({email:'admin@example.com',password:'correct'}),Buffer.from('{"email":"admin@example.com","password":"correct"}')]){
  const req={body,[Symbol.asyncIterator]:()=>{throw Error('No se debe leer de nuevo el stream')}};
  assert.deepEqual(await readJsonBody(req,12000),{email:'admin@example.com',password:'correct'});
 }
 await assert.rejects(readJsonBody({body:{email:'x'.repeat(13000)}},12000),e=>e.status===413);
});
test('serverless login handles requests without a network socket and surfaces storage configuration errors safely',async()=>{
 const store={rate:async()=>true};
 const fetchFn=async()=>Response.json({},{status:400});
 const handler=createVercelHandler({env,fetchFn,sessionStore:store});
 const req={headers:{host:'proyectopapa.vercel.app','content-type':'application/json',origin:'https://proyectopapa.vercel.app'},url:'/api/auth/login',method:'POST',body:{email:'admin@example.com',password:'incorrect'}};
 let status,body;const res={setHeader:()=>{},writeHead:s=>status=s,end:text=>body=JSON.parse(text)};
 await handler(req,res);assert.equal(status,401);assert(body.error.includes('Correo o contraseña'));
 const {createSupabaseSessionStore}=require('./session-store.cjs');const broken=createSupabaseSessionStore({url:env.NEXT_PUBLIC_SUPABASE_URL,key:'never-expose-this',fetchFn:async()=>Response.json({secret:'never-expose-this'},{status:401})});
 await assert.rejects(broken.rate('a'.repeat(64)),error=>error.publicMessage.includes('SUPABASE_SERVICE_ROLE_KEY')&&!JSON.stringify(error).includes('never-expose-this'));
});

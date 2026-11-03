const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createAuth,SIX_HOURS,THIRTY_DAYS}=require('./auth.cjs');const {createServer}=require('../server.cjs');const {openStore}=require('./store.cjs');
const ADMIN={id:'11111111-1111-4111-8111-111111111111',email:'admin@example.com'};
async function setup(t,{filename=':memory:',cleanupDir}={}){
 let clock=1793700000000,allowed=true,recovered=false;const calls=[];
 const fetchFn=async(input,options={})=>{const u=new URL(input),body=options.body?JSON.parse(options.body):{};calls.push({path:u.pathname,body});
  if(u.pathname==='/auth/v1/token'){
   if(u.searchParams.get('grant_type')==='password' && body.password!=='correct-password')return Response.json({}, {status:400});
   const user=body.email==='outsider@example.com'?{...ADMIN,id:'22222222-2222-4222-8222-222222222222'}:ADMIN;
   return Response.json({access_token:'private-access-token',refresh_token:'private-refresh-token',expires_in:3600,user});
  }
  if(u.pathname==='/auth/v1/user')return Response.json(ADMIN);
  if(u.pathname==='/rest/v1/administradores')return Response.json(allowed&&u.searchParams.get('usuario_id')==='eq.'+ADMIN.id?[{usuario_id:ADMIN.id}]:[]);
  if(u.pathname==='/auth/v1/admin/generate_link')return Response.json({hashed_token:'one-time-recovery',user:ADMIN});
  if(u.pathname==='/auth/v1/verify'){if(recovered||body.token_hash!=='one-time-recovery')return Response.json({},{status:401});recovered=true;return Response.json({access_token:'private-access-token',refresh_token:'private-refresh-token',expires_in:3600,user:ADMIN})}
  if(u.hostname==='api.brevo.com')return Response.json({messageId:'recovery-message'});
  throw Error('Unexpected mocked request: '+u.pathname);
 };
 const config={url:'https://auth.example.com',publishableKey:'public-test',serviceKey:'private-service-test',filename,fetchFn,now:()=>clock,mail:{apiKey:'brevo-test',from:'sender@example.com'},...(filename===':memory:'?{secretKey:Buffer.alloc(32,7)}:{})};
 let auth=createAuth(config);const store=openStore(':memory:');const server=createServer(store,{auth:{handle:(...args)=>auth.handle(...args),authorize:(...args)=>auth.authorize(...args)}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));auth.close();store.close();if(cleanupDir)fs.rmSync(cleanupDir,{recursive:true,force:true})});
 const base='http://127.0.0.1:'+server.address().port;
 const request=(route,data,cookie='',extra={})=>fetch(base+route,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})});
 const login=async(remember=false)=>{const res=await request('/api/auth/login',{email:ADMIN.email,password:'correct-password',remember});assert.equal(res.status,200);return {cookie:res.headers.get('set-cookie').split(';')[0],header:res.headers.get('set-cookie'),data:await res.json()}};
 return {request,login,calls,advance:ms=>clock+=ms,revoke:()=>allowed=false,restart:()=>{auth.close();auth=createAuth(config)}};
}
test('all financial APIs require a session and unknown server auth configuration fails closed',async t=>{
 const {request}=await setup(t);for(const route of ['/api/state','/api/system','/api/alerts','/api/mail-status'])assert.equal((await request(route)).status,401);
 assert.equal((await request('/')).status,200);assert.equal((await request('/api/auth/login',{email:'admin@example.com',password:'wrong'})).status,401);
 assert.equal((await request('/api/auth/login',{email:'outsider@example.com',password:'correct-password'})).status,401);
 assert.equal((await request('/api/auth/login',{email:ADMIN.email,password:'correct-password'},'',{Origin:'https://evil.example'})).status,403);
});
test('unremembered session expires after exactly six hours even after token refresh',async t=>{
 const x=await setup(t),s=await x.login();assert.match(s.header,/HttpOnly/);assert.match(s.header,/SameSite=Strict/);assert(!s.header.includes('Max-Age'));assert(!JSON.stringify(s.data).includes('token'));
 x.advance(SIX_HOURS-1000);assert.equal((await x.request('/api/state',null,s.cookie)).status,200);assert(x.calls.some(c=>c.body.refresh_token));
 x.advance(1000);assert.equal((await x.request('/api/state',null,s.cookie)).status,401);assert.equal((await x.request('/api/auth/session',null,s.cookie)).status,401);
});
test('remembered session survives six hours, ends at 30 days and logout revokes its cookie',async t=>{
 const x=await setup(t),s=await x.login(true);assert.match(s.header,/Max-Age=2592000/);x.advance(SIX_HOURS+1000);assert.equal((await x.request('/api/state',null,s.cookie)).status,200);
 assert.equal((await x.request('/api/auth/logout',{},s.cookie)).status,200);assert.equal((await x.request('/api/state',null,s.cookie)).status,401);
 const other=await x.login(true);x.advance(THIRTY_DAYS);assert.equal((await x.request('/api/state',null,other.cookie)).status,401);
});
test('revoking administrator access blocks an already authenticated user',async t=>{const x=await setup(t),s=await x.login();x.revoke();assert.equal((await x.request('/api/state',null,s.cookie)).status,401)});
test('recovery token is one-time, reset session cannot read data, password reset revokes all sessions',async t=>{
 const x=await setup(t),s=await x.login();const response=await x.request('/api/auth/recover',{email:ADMIN.email});assert.equal(response.status,200);
 const mail=x.calls.find(c=>c.path==='/v3/smtp/email').body;assert.equal(mail.to[0].email,ADMIN.email);assert(mail.htmlContent.includes('type=recovery&amp;')||mail.htmlContent.includes('type=recovery&'));assert(mail.htmlContent.includes('token_hash=one-time-recovery'));
 const exchange=await x.request('/api/auth/recovery',{token_hash:'one-time-recovery'});assert.equal(exchange.status,200);const recovery=exchange.headers.get('set-cookie').split(';')[0];
 assert.equal((await x.request('/api/state',null,recovery)).status,401);assert.equal((await x.request('/api/auth/recovery',{token_hash:'one-time-recovery'})).status,401);
 assert.equal((await x.request('/api/auth/password',{password:'short'},recovery)).status,400);
 assert.equal((await x.request('/api/auth/password',{password:'new-secure-password'},recovery)).status,200);
 assert.equal((await x.request('/api/state',null,s.cookie)).status,401);assert.equal((await x.request('/api/auth/password',{password:'another-password'},recovery)).status,401);
});
test('sessions survive a server restart with encrypted tokens and six-hour expiration retained',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'antonini-auth-'));
 const filename=path.join(dir,'sessions.sqlite'),x=await setup(t,{filename,cleanupDir:dir}),s=await x.login();x.advance(1000);x.restart();assert.equal((await x.request('/api/state',null,s.cookie)).status,200);
 const disk=Buffer.concat([fs.readFileSync(filename),fs.existsSync(filename+'-wal')?fs.readFileSync(filename+'-wal'):Buffer.alloc(0)]).toString();assert(!disk.includes('private-access-token'));assert(!disk.includes('private-refresh-token'));assert(!disk.includes(s.cookie.split('=')[1]));
 x.advance(SIX_HOURS);assert.equal((await x.request('/api/state',null,s.cookie)).status,401);
});
test('login attempts are limited without returning provider errors or secrets',async t=>{const x=await setup(t);for(let i=0;i<12;i++)await x.request('/api/auth/login',{email:ADMIN.email,password:'wrong'});const response=await x.request('/api/auth/login',{email:ADMIN.email,password:'wrong'});assert.equal(response.status,429);assert(!(await response.text()).includes('private-service-test'))});

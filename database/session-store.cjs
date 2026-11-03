// Solo servidor: todas las operaciones usan la clave privada, nunca la del navegador.
function createSupabaseSessionStore({url,key,fetchFn=fetch}){
 const columns={id:'id_hash',user_id:'usuario_id',email:'correo',tokens:'tokens_cifrados',token_expires:'token_expira_ms',expires:'expira_ms',remember:'recordar',purpose:'proposito'};
 const encode=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[columns[k]||k,v]));
 const decode=row=>row&&Object.fromEntries(Object.entries(columns).map(([k,v])=>[k,row[v]]));
 async function request(route,method='GET',body){let response;try{response=await fetchFn(url.replace(/\/$/,'')+'/rest/v1/'+route,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})}catch{throw Object.assign(Error('No se pudo consultar el almacenamiento de sesiones.'),{status:503})}
  if(!response.ok)throw Object.assign(Error('No se pudo consultar el almacenamiento de sesiones. Aplica database/09_sesiones_vercel.sql.'),{status:503});return response.status===204?null:response.json();}
 const byId=id=>'sesiones_acceso?id_hash=eq.'+encodeURIComponent(id);
 return {
  get:async id=>decode((await request(byId(id)+'&select=*'))[0]),
  insert:row=>request('sesiones_acceso','POST',encode(row)),
  delete:id=>request(byId(id),'DELETE'),
  deleteUser:id=>request('sesiones_acceso?usuario_id=eq.'+encodeURIComponent(id),'DELETE'),
  prune:now=>request('sesiones_acceso?expira_ms=lte.'+now,'DELETE'),
  claimRefresh:id=>request('rpc/adquirir_renovacion_sesion','POST',{p_id:id}),
  update:async(id,tokens,expires,ticket)=>{const r=await request(byId(id)+'&ticket=eq.'+encodeURIComponent(ticket),'PATCH',{tokens_cifrados:tokens,token_expira_ms:expires,ticket:null,renovando_hasta:null});if(!r?.length)throw Object.assign(Error('La sesión cambió durante la renovación. Intenta nuevamente.'),{status:503})},
  releaseRefresh:(id,ticket)=>request(byId(id)+'&ticket=eq.'+encodeURIComponent(ticket),'PATCH',{ticket:null,renovando_hasta:null}),
  rate:key=>request('rpc/limitar_intentos_acceso','POST',{p_clave:key}),
  close:()=>{}
 };
}
function createLocalSessionStore(filename){
 const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(filename);
 db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,email TEXT NOT NULL,tokens TEXT NOT NULL,token_expires INTEGER NOT NULL,expires INTEGER NOT NULL,remember INTEGER NOT NULL,purpose TEXT NOT NULL);');
 return {
  get:id=>db.prepare('SELECT * FROM sessions WHERE id=?').get(id),
  insert:r=>db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)').run(r.id,r.user_id,r.email,r.tokens,r.token_expires,r.expires,r.remember,r.purpose),
  delete:id=>db.prepare('DELETE FROM sessions WHERE id=?').run(id),
  deleteUser:id=>db.prepare('DELETE FROM sessions WHERE user_id=?').run(id),
  prune:now=>db.prepare('DELETE FROM sessions WHERE expires<=?').run(now),
  update:(id,tokens,expires)=>db.prepare('UPDATE sessions SET tokens=?,token_expires=? WHERE id=?').run(tokens,expires,id),
  close:()=>db.close()
 };
}
module.exports={createSupabaseSessionStore,createLocalSessionStore};

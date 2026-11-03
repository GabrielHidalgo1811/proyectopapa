(()=>{
 const root=document.getElementById('auth-root');let expiryTimer,pollTimer,session,mode='login',busy=false;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(...args)=>{const response=await nativeFetch(...args);const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);if(response.status===401 && url.origin===location.origin && url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/auth/'))lock('Tu sesión terminó. Inicia sesión nuevamente.');return response};
 async function request(endpoint,data){const response=await nativeFetch('/api/auth/'+endpoint,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store'});let result;try{result=await response.json()}catch{throw new Error(response.status===404?'El servidor de acceso no está disponible. Actualiza el despliegue en Vercel.':'El servidor no devolvió una respuesta válida. Inténtalo más tarde.')}if(!response.ok)throw Object.assign(new Error(result.error||'No se pudo completar la operación.'),{status:response.status});return result}
 const eye='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
 function password(name,label,auto){return `<label class="auth-label" for="${name}">${label}</label><div class="auth-password"><input id="${name}" name="${name}" type="password" autocomplete="${auto}" ${auto==='new-password'?'minlength="10" maxlength="128"':''} required><button type="button" class="password-eye" data-password="${name}" aria-label="Mostrar contraseña" aria-pressed="false">${eye}</button></div>`}
 function show(next='login',message=''){
  mode=next;busy=false;document.body.classList.add('auth-locked');root.hidden=false;
  const reset=mode==='reset',forgot=mode==='forgot';
  root.innerHTML=`<section class="auth-card" aria-labelledby="auth-title"><div class="auth-brand"><img src="assets/antonini-prestamos.png" alt="" width="84" height="84"><div><strong>antonini</strong><span>GESTIÓN DE COBROS</span></div></div><p class="auth-eyebrow">ACCESO PRIVADO</p><h1 id="auth-title">${reset?'Crea tu nueva contraseña':forgot?'Recupera tu acceso':'Bienvenido de nuevo'}</h1><p class="auth-description">${reset?'Elige una contraseña de al menos 10 caracteres.':forgot?'Te enviaremos un enlace para crear una nueva contraseña.':'Ingresa a tu espacio para administrar arriendos, préstamos y pagos.'}</p><p class="auth-message" id="auth-message" role="status" ${message?'':'hidden'}>${esc(message)}</p><form id="auth-form">${reset?'':`<label class="auth-label" for="auth-email">Correo electrónico</label><input id="auth-email" name="email" type="email" autocomplete="username" placeholder="tu@correo.com" required>`}${forgot?'':password('auth-password',reset?'Nueva contraseña':'Contraseña',reset?'new-password':'current-password')}${reset?password('auth-confirm','Confirma la contraseña','new-password'):''}${!forgot&&!reset?'<div class="auth-options"><label><input type="checkbox" name="remember"> Mantener sesión</label><button class="auth-link" type="button" id="auth-forgot">Olvidé mi contraseña</button></div><p class="auth-hint">Sin marcar esta opción, tu sesión se cerrará a las 6 horas. Si la marcas, durará hasta 30 días.</p>':''}<button class="button primary auth-submit" type="submit">${reset?'Guardar contraseña':forgot?'Enviar enlace':'Iniciar sesión'}</button>${forgot||reset?'<button class="auth-link auth-back" type="button" id="auth-back">Volver al inicio de sesión</button>':''}</form><div class="auth-footer">Tu gestión, en orden.<span>Acceso exclusivo para administradores autorizados.</span></div></section>`;
  root.querySelectorAll('[data-password]').forEach(button=>button.onclick=()=>{const input=document.getElementById(button.dataset.password);const visible=input.type==='password';input.type=visible?'text':'password';button.setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');button.setAttribute('aria-pressed',String(visible))});
  document.getElementById('auth-forgot')?.addEventListener('click',()=>show('forgot'));
  document.getElementById('auth-back')?.addEventListener('click',()=>show());
  document.getElementById('auth-form').onsubmit=submit;
 }
 function message(text){const el=document.getElementById('auth-message');if(el){el.hidden=false;el.textContent=text}}
 function lock(text=''){clearTimeout(expiryTimer);clearInterval(pollTimer);session=null;document.dispatchEvent(new Event('antonini:signed-out'));show('login',text)}
 function scheduleExpiry(){clearTimeout(expiryTimer);if(!session)return;expiryTimer=setTimeout(()=>{if(!session)return;if(Date.now()>=session.expiresAt)logout('Tu sesión terminó. Inicia sesión nuevamente.');else scheduleExpiry()},Math.min(2147483647,Math.max(0,session.expiresAt-Date.now())))}
 function enter(data){session=data;root.hidden=true;root.innerHTML='';document.body.classList.remove('auth-locked');scheduleExpiry();clearInterval(pollTimer);pollTimer=setInterval(check,30000);document.getElementById('sign-out').title='Cerrar sesión · '+data.user.email;document.dispatchEvent(new Event('antonini:authenticated'))}
 async function submit(event){event.preventDefault();if(busy)return;busy=true;const form=event.target,f=new FormData(form),button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Un momento…';try{
   if(mode==='login')enter(await request('login',{email:f.get('email'),password:f.get('auth-password'),remember:f.get('remember')==='on'}));
   else if(mode==='forgot'){const result=await request('recover',{email:f.get('email')});show('forgot',result.message)}
   else{if(f.get('auth-password')!==f.get('auth-confirm'))throw Error('Las contraseñas no coinciden.');await request('password',{password:f.get('auth-password')});lock('Contraseña actualizada. Inicia sesión con tu nueva contraseña.')}
  }catch(error){message(error.message==='Failed to fetch'?'No se pudo conectar. Revisa tu conexión e inténtalo nuevamente.':error.message)}finally{busy=false;if(button.isConnected){button.disabled=false;button.textContent=mode==='login'?'Iniciar sesión':mode==='forgot'?'Enviar enlace':'Guardar contraseña'}}}
 async function check(){if(!session)return;try{const data=await request('session');session=data;if(Date.now()>=data.expiresAt)await logout('Tu sesión terminó.')}catch(error){if(error.status===401)lock('Tu sesión terminó. Inicia sesión nuevamente.')}}
 async function logout(text='Sesión cerrada.'){sessionStorage.setItem('antonini-logout-pending','1');lock(text);try{await request('logout',{});sessionStorage.removeItem('antonini-logout-pending')}catch{message('Se ocultaron tus datos. No se pudo confirmar el cierre en el servidor; revisa la conexión y vuelve a intentar.')}}
 window.antoniniLogout=()=>logout();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
 document.addEventListener('DOMContentLoaded',async()=>{
  document.getElementById('sign-out').onclick=()=>logout();
  if(sessionStorage.getItem('antonini-logout-pending')){try{await request('logout',{});sessionStorage.removeItem('antonini-logout-pending')}catch{show('login','Revisa la conexión para completar el cierre de sesión.');return}}
  const params=new URLSearchParams(location.search);const token=params.get('token_hash');
  if(params.get('type')==='recovery'){
   history.replaceState(null,'',location.pathname);show('reset','Validando el enlace…');
   try{if(!token)throw Error('El enlace no es válido. Solicita uno nuevo.');await request('recovery',{token_hash:token});show('reset')}catch(error){show('forgot','El enlace no es válido o ya venció. Solicita uno nuevo.')}return;
  }
  try{enter(await request('session'))}catch(error){show('login',error.status===401?'':error.message)}
 });
})();

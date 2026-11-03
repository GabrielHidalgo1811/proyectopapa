import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.loadEnvFile(path.join(root,'.env.local'));
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Falta la conexión de Supabase.');
const headers={apikey:key,Authorization:`Bearer ${key}`};
const response=await fetch(url+'/storage/v1/bucket/correos',{headers});
if(response.status===404 || response.status===400) {
  const created=await fetch(url+'/storage/v1/bucket',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id:'correos',name:'correos',public:true,allowed_mime_types:['image/png'],file_size_limit:1048576})});
  if(!created.ok)throw Error('No se pudo crear el espacio de imágenes: HTTP '+created.status);
} else {
  if(!response.ok)throw Error('No se pudo consultar Storage: HTTP '+response.status);
  if(!(await response.json()).public)throw Error('El espacio correos ya existe y es privado. No se modificó.');
}
const original=await fs.readFile(path.join(root,'assets','antonini-prestamos.png'));
const uploaded=await fetch(url+'/storage/v1/object/correos/antonini-prestamos.png',{method:'POST',headers:{...headers,'Content-Type':'image/png','x-upsert':'true'},body:original});
if(!uploaded.ok)throw Error('No se pudo publicar el logo: HTTP '+uploaded.status);
const check=await fetch(url+'/storage/v1/object/public/correos/antonini-prestamos.png');
if(!check.ok || !original.equals(Buffer.from(await check.arrayBuffer())))throw Error('No se pudo verificar la imagen publicada.');
console.log('Logo original publicado y verificado. No se modificaron personas, pagos ni correos.');

const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
for(const file of ['index.html','style.css','app.js','auth.js','assets/antonini-prestamos.png']){
 const target=path.join(root,'dist',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);
}
console.log('Interfaz preparada para Vercel. Las API están en api/. No se copiaron claves ni datos privados.');

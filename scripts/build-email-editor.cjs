const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const shared = fs.readFileSync(path.join(root, 'supabase/functions/_shared/mail.mjs'), 'utf8').replace(/^export\s+/gm, '');
const entry = fs.readFileSync(path.join(root, 'supabase/functions/enviar-correos/index.ts'), 'utf8').replace(/^import \{ runBatch \} from '\.\.\/_shared\/mail\.mjs';\r?\n/, '');
const source = '// Generado por scripts/build-email-editor.cjs.\n// Copiar todo en index.ts de la funcion EXISTENTE hyper-handler (editor de Supabase).\n// Las claves se leen de Secrets; no pegar claves en este codigo.\n\n' + shared + '\n' + entry;
fs.writeFileSync(path.join(root, 'supabase/enviar-correos-editor.ts'), source.replace(/\r\n/g, '\n'));
console.log('Archivo preparado: supabase/enviar-correos-editor.ts');

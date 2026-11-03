-- Autorizar cuentas que YA EXISTAN en Authentication > Users.
-- El correo de acceso es independiente del correo que recibe los comprobantes.
-- Edita esta lista si deseas habilitar otros administradores.
BEGIN;
INSERT INTO public.administradores(usuario_id)
SELECT id FROM auth.users
WHERE lower(email) IN ('gabriel.hidalgo1@cloud.uautonoma.cl','tvxsiempre@gmail.com')
ON CONFLICT(usuario_id) DO NOTHING;
COMMIT;
SELECT u.email,a.usuario_id FROM public.administradores a
JOIN auth.users u ON u.id=a.usuario_id ORDER BY u.email;
-- Si no aparecen filas, primero crea las cuentas en Authentication > Users > Add user.
-- No se crean contraseñas ni usuarios de Authentication mediante este SQL.

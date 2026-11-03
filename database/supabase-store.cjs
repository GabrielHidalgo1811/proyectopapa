const { normalize, DataError } = require('./store.cjs');

function openSupabaseStore({ url, key, fetchFn = fetch }) {
  if (!url || !key) throw new Error('Configura SUPABASE_SERVICE_ROLE_KEY en .env.local para conectar Supabase.');
  async function rpc(name, body = {}) {
    const response = await fetchFn(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
    });
    const result = await response.json();
    if (!response.ok) throw new DataError(result.message || 'No se pudo acceder a Supabase.', result.code === '40001' ? 409 : response.status >= 500 ? 503 : 400);
    return result;
  }
  return {
    read: () => rpc('leer_estado_antonini'),
    write: (data, revision) => rpc('guardar_estado_antonini', { p_revision: revision, p_datos: normalize(data) }),
    alerts: () => rpc('consultar_alertas_antonini'),
    mailStatus: () => rpc('consultar_correos_antonini'),
    close: () => {}
  };
}
module.exports = { openSupabaseStore };

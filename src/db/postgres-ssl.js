const SSL_MODES = new Set(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']);

export function resolvePostgresSsl(host, configuredSslMode, nodeEnvironment) {
  const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (isLocalDatabase && nodeEnvironment !== 'production') {
    return { mode: 'disable', required: false };
  }

  const required = configuredSslMode === 'require'
    || host.includes('supabase')
    || (nodeEnvironment === 'production' && !isLocalDatabase);
  const mode = configuredSslMode && SSL_MODES.has(configuredSslMode)
    ? configuredSslMode
    : required ? 'require' : 'disable';

  return { mode, required };
}

export function resolvePostgresSsl(
  host: string,
  configuredSslMode: string | null,
  nodeEnvironment: string | undefined,
): { mode: string; required: boolean };

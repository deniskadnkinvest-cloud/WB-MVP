export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

export function getJwtSecret() {
  return requireEnv('JWT_SECRET');
}

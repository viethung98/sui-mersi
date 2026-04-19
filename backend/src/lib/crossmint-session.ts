export function getCrossmintUserIdFromJwt(jwt: string): string {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const payload = JSON.parse(atob(parts[1])) as { sub?: string; exp?: number };
  if (!payload.sub) throw new Error("JWT missing sub");
  if (payload.exp != null && payload.exp * 1000 < Date.now())
    throw new Error("JWT expired");
  return payload.sub;
}

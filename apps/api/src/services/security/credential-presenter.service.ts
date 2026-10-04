export function maskSecret(value: string): string {
  if (value.length <= 4) return '••••';
  return `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

export function summarizeCredentials(credentials: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(credentials).map(([key, value]) => [key, maskSecret(value)]),
  );
}

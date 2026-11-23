export function isLocalRingtone(value: string): boolean {
  return /^data:audio\/[a-z0-9.+-]+;base64,/i.test(value);
}
export function isRingtoneSource(value: string): boolean {
  return /^https?:\/\//i.test(value) || isLocalRingtone(value);
}

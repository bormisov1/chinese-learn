export function explanationReturnPath(from: unknown): string {
  if (typeof from !== 'string' || !/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(from) || from === '/explanation') return '/';
  return from;
}

export function requireSameOrigin(request: Request): void {
  const origin=request.headers.get('origin');
  const host=request.headers.get('host')||new URL(request.url).host;
  if(!origin || new URL(origin).host!==host) throw Error('cross-origin request rejected');
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw Error('JSON required');
}

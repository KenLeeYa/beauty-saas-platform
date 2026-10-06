import { localDemoEnabled } from './local-demo';

/** Separate line_booking tables are only allowed in the synthetic loopback trial. */
export function prototypeAllowed(host: string | null): boolean {
  return localDemoEnabled(host);
}

export function requirePrototype(request: Request): void {
  if (!prototypeAllowed(request.headers.get('host'))) {
    throw new Error('prototype unavailable');
  }
}

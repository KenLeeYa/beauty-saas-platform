export function localDemoEnabled(_host: string | null): boolean {
  void _host;
  // The separate line_booking prototype was retired. Keep legacy branches closed
  // until they are removed without touching the shared public booking adapter.
  return false;
}

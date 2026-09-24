import { clearPrinterHandoff, ensureSchema, getBindings, type PrinterStatus, readPrinterStatus, writePrinterStatus } from '@/lib/cloud-db';

export const dynamic = 'force-dynamic';

function numberWithin(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : 0;
}

function sanitizeStatus(value: unknown): PrinterStatus | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<PrinterStatus>;
  const bridge = ['demo', 'setup_required', 'connecting', 'connected', 'live', 'offline', 'error'].includes(String(input.bridge))
    ? input.bridge as PrinterStatus['bridge']
    : 'offline';

  return {
    bridge,
    connected: Boolean(input.connected),
    model: String(input.model || 'Bambu Lab P1S').slice(0, 40),
    state: String(input.state || 'UNKNOWN').toUpperCase().slice(0, 24),
    filename: String(input.filename || 'P1S').slice(0, 120),
    progress: numberWithin(input.progress, 0, 100),
    remainingMinutes: numberWithin(input.remainingMinutes, 0, 100_000),
    layer: numberWithin(input.layer, 0, 100_000),
    totalLayers: numberWithin(input.totalLayers, 0, 100_000),
    nozzleTemp: numberWithin(input.nozzleTemp, 0, 400),
    bedTemp: numberWithin(input.bedTemp, 0, 150),
    hasError: Boolean(input.hasError),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const { DB } = getBindings();
  await ensureSchema(DB);
  return Response.json(await readPrinterStatus(DB), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const bindings = getBindings();
  const expectedToken = bindings.BRIDGE_INGEST_TOKEN;
  const suppliedToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const hostname = new URL(request.url).hostname;
  const isLocalDevelopment = !expectedToken && ['localhost', '127.0.0.1'].includes(hostname);

  if (!isLocalDevelopment && (!expectedToken || suppliedToken !== expectedToken)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = sanitizeStatus(await request.json().catch(() => null));
  if (!status) return Response.json({ error: 'Invalid printer status' }, { status: 400 });

  await ensureSchema(bindings.DB);
  await Promise.all([
    writePrinterStatus(bindings.DB, status),
    status.state === 'PRINTING' && status.progress < 100
      ? clearPrinterHandoff(bindings.DB)
      : Promise.resolve(),
  ]);
  return Response.json({ ok: true });
}

import { ensureSchema, getBindings, listQueue, readPrinterHandoff, readPrinterStatus } from '@/lib/cloud-db';
import { hasSupabaseQueue, listSupabaseQueue } from '@/lib/supabase-queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { DB } = getBindings();
  await ensureSchema(DB);
  const [queue, printer, handoff] = await Promise.all([
    hasSupabaseQueue() ? listSupabaseQueue() : listQueue(DB),
    readPrinterStatus(DB),
    readPrinterHandoff(DB),
  ]);

  return Response.json(
    { queue, printer, handoff },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

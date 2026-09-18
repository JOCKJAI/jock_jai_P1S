import { ensureSchema, getBindings, listQueue, readPrinterStatus } from '@/lib/cloud-db';
import { hasSupabaseQueue, listSupabaseQueue } from '@/lib/supabase-queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { DB } = getBindings();
  await ensureSchema(DB);
  const [queue, printer] = await Promise.all([
    hasSupabaseQueue() ? listSupabaseQueue() : listQueue(DB),
    readPrinterStatus(DB),
  ]);

  return Response.json(
    { queue, printer },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

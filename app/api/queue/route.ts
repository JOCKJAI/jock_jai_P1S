import { addQueueItem, ensureSchema, getBindings } from '@/lib/cloud-db';

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 1024) return Response.json({ error: 'Request too large' }, { status: 413 });

  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const name = typeof body?.name === 'string'
    ? body.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16).toUpperCase()
    : '';

  if (!name) return Response.json({ error: '請輸入名字' }, { status: 400 });

  const { DB } = getBindings();
  await ensureSchema(DB);
  const queue = await addQueueItem(DB, name);
  return Response.json({ queue }, { status: 201 });
}

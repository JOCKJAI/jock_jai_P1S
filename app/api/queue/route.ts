import { addQueueItem, ensureSchema, getBindings } from '@/lib/cloud-db';
import {
  addSupabaseQueueItem,
  deleteSupabaseQueueItem,
  hasSupabaseQueue,
  updateSupabaseQueueItem,
} from '@/lib/supabase-queue';

function cleanName(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16).toUpperCase()
    : '';
}

function cleanPassword(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 64) : '';
}

function invalidPasswordResponse() {
  return Response.json({ error: '密碼不正確' }, { status: 403 });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 1024) return Response.json({ error: 'Request too large' }, { status: 413 });

  const body = await request.json().catch(() => null) as { name?: unknown; password?: unknown } | null;
  const name = cleanName(body?.name);
  const password = cleanPassword(body?.password);

  if (!name) return Response.json({ error: '請輸入名字' }, { status: 400 });
  if (hasSupabaseQueue() && password.length < 6) {
    return Response.json({ error: '修改密碼最少要有 6 個字元' }, { status: 400 });
  }

  const { DB } = getBindings();
  await ensureSchema(DB);
  try {
    const queue = hasSupabaseQueue()
      ? await addSupabaseQueueItem(name, password)
      : await addQueueItem(DB, name);
    return Response.json({ queue }, { status: 201 });
  } catch (error) {
    console.error('Unable to add queue item', error);
    return Response.json({ error: '未能加入隊伍，請再試一次' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!hasSupabaseQueue()) return Response.json({ error: '修改功能尚未連接' }, { status: 503 });
  const body = await request.json().catch(() => null) as { id?: unknown; name?: unknown; password?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const name = cleanName(body?.name);
  const password = cleanPassword(body?.password);
  if (!id || !name || !password) return Response.json({ error: '資料不完整' }, { status: 400 });

  try {
    const queue = await updateSupabaseQueueItem(id, name, password);
    return Response.json({ queue });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_PASSWORD') return invalidPasswordResponse();
    return Response.json({ error: '未能更新排隊紀錄' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!hasSupabaseQueue()) return Response.json({ error: '修改功能尚未連接' }, { status: 503 });
  const body = await request.json().catch(() => null) as { id?: unknown; password?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const password = cleanPassword(body?.password);
  if (!id || !password) return Response.json({ error: '資料不完整' }, { status: 400 });

  try {
    const queue = await deleteSupabaseQueueItem(id, password);
    return Response.json({ queue });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_PASSWORD') return invalidPasswordResponse();
    return Response.json({ error: '未能取消排隊' }, { status: 500 });
  }
}

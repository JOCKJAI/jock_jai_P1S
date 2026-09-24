import {
  claimPrinterHandoff,
  clearPrinterHandoff,
  completeQueueHead,
  ensureSchema,
  getBindings,
  getQueueHead,
  readPrinterHandoff,
  readPrinterStatus,
} from '@/lib/cloud-db';
import {
  completeSupabaseQueueHead,
  getSupabaseQueueHead,
  hasSupabaseQueue,
} from '@/lib/supabase-queue';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  const { DB } = getBindings();
  await ensureSchema(DB);

  try {
    const printer = await readPrinterStatus(DB);
    const isComplete = Boolean(printer)
      && (printer!.progress >= 100 || ['FINISH', 'IDLE', 'READY'].includes(printer!.state));
    if (!isComplete) {
      return Response.json({ error: 'P1S 完成列印後先可以確認取件' }, { status: 409 });
    }

    const head = hasSupabaseQueue()
      ? await getSupabaseQueueHead()
      : await getQueueHead(DB);
    if (!head) return Response.json({ error: '排隊名單暫時冇人' }, { status: 409 });

    const claimed = await claimPrinterHandoff(DB, head.name);
    if (!claimed) {
      return Response.json({ error: '上一件已經完成取件，等待下一位開始列印' }, { status: 409 });
    }

    try {
      let queue;
      if (hasSupabaseQueue()) {
        queue = await completeSupabaseQueueHead(head.id);
      } else {
        const completed = await completeQueueHead(DB);
        if (!completed || completed.pickedUp.id !== head.id) throw new Error('QUEUE_HEAD_CHANGED');
        queue = completed.queue;
      }
      return Response.json({ queue, handoff: await readPrinterHandoff(DB), pickedUpName: head.name });
    } catch (error) {
      await clearPrinterHandoff(DB);
      throw error;
    }
  } catch (error) {
    console.error('Unable to complete pickup', error);
    return Response.json({ error: '未能完成取件，請再試一次' }, { status: 500 });
  }
}

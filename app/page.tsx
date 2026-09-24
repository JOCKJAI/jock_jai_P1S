'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Check, Coins, LockKeyhole, PackageCheck, Printer, Sparkles, Trash2, UserRound, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type QueueItem = { id: string; name: string; color: string };
type PrinterHandoff = { readyForNext: boolean; pickedUpName: string | null; pickedUpAt: string | null };
type PrinterStatus = {
  bridge: 'demo' | 'setup_required' | 'connecting' | 'connected' | 'live' | 'offline' | 'error';
  connected: boolean;
  model: string;
  state: string;
  filename: string;
  progress: number;
  remainingMinutes: number;
  layer: number;
  totalLayers: number;
  nozzleTemp: number;
  bedTemp: number;
  hasError: boolean;
  updatedAt: string | null;
};

const coin = { mark: 'JW' };

const demoPrinter: PrinterStatus = {
  bridge: 'demo', connected: false, model: 'Bambu Lab P1S', state: 'PRINTING',
  filename: 'ROCKET_V3.3MF', progress: 68, remainingMinutes: 24,
  layer: 816, totalLayers: 1200, nozzleTemp: 220, bedTemp: 55,
  hasError: false, updatedAt: null,
};

export default function Home() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDropping, setIsDropping] = useState(false);
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<QueueItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [handoff, setHandoff] = useState<PrinterHandoff>({ readyForNext: false, pickedUpName: null, pickedUpAt: null });
  const [isPickupDialogOpen, setIsPickupDialogOpen] = useState(false);
  const [isPickingUp, setIsPickingUp] = useState(false);
  const [pickupError, setPickupError] = useState('');
  const [notice, setNotice] = useState('');
  const [printer, setPrinter] = useState<PrinterStatus>(demoPrinter);

  useEffect(() => {
    let active = true;

    async function refreshState() {
      try {
        const response = await fetch('/api/state', { cache: 'no-store' });
        if (!response.ok) throw new Error('Live state unavailable');
        const next = await response.json() as { queue: QueueItem[]; printer: PrinterStatus | null; handoff?: PrinterHandoff };
        if (active) {
          setQueue(next.queue);
          setPrinter(next.printer || demoPrinter);
          setHandoff(next.handoff || { readyForNext: false, pickedUpName: null, pickedUpAt: null });
        }
      } catch {
        if (active) setPrinter((current) => current.bridge === 'demo' ? current : { ...current, bridge: 'offline', connected: false });
      }
    }

    refreshState();
    const timer = window.setInterval(refreshState, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!isNameDialogOpen && !editItem && !isPickupDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNameDialogOpen(false);
        setName('');
        setPassword('');
        setEditItem(null);
        setEditName('');
        setEditPassword('');
        setEditError('');
        setIsPickupDialogOpen(false);
        setPickupError('');
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isNameDialogOpen, editItem, isPickupDialogOpen]);

  const isLive = printer.bridge === 'live' && printer.connected;
  const printerAnimation = handoff.readyForNext
    ? 'idle'
    : printer.hasError || printer.state === 'ERROR'
    ? 'error'
    : printer.state === 'PRINTING'
      ? 'printing'
      : printer.state === 'PAUSED'
        ? 'paused'
        : 'idle';
  const printerAlt = {
    idle: '像素風 3D printer 已完成列印，正在待機',
    printing: '像素風 3D printer 正在列印橙色小火箭',
    paused: '像素風 3D printer 暫停列印',
    error: '像素風 3D printer 顯示錯誤警號',
  }[printerAnimation];
  const printerAnimationSrc = printerAnimation === 'printing'
    ? '/printer-kv-printing-v2.gif'
    : `/printer-kv-${printerAnimation}.gif`;
  const printProgress = handoff.readyForNext
    ? 0
    : Math.max(0, Math.min(100, Math.round(printer.progress)));
  const bridgeLabel = handoff.readyForNext
    ? 'P1S · EMPTY / READY'
    : isLive
      ? `P1S · ${printer.state}`
    : printer.bridge === 'setup_required'
      ? 'P1S BRIDGE · SETUP NEEDED'
      : printer.bridge === 'connecting' || printer.bridge === 'connected'
        ? 'P1S BRIDGE · CONNECTING'
        : 'P1S BRIDGE · DEMO MODE';
  const canMarkPickedUp = !handoff.readyForNext
    && queue.length > 0
    && (printer.progress >= 100 || ['FINISH', 'IDLE', 'READY'].includes(printer.state));

  async function joinQueue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim().slice(0, 16);
    if (!cleanName || password.length < 6 || isDropping) return;
    setIsNameDialogOpen(false);
    setIsDropping(true);
    setNotice('');

    window.setTimeout(async () => {
      try {
        const response = await fetch('/api/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cleanName, password }),
        });
        const result = await response.json() as { queue?: QueueItem[]; error?: string };
        if (!response.ok || !result.queue) throw new Error(result.error || '未能加入隊伍');
        setQueue(result.queue);
        setNotice(`${cleanName}，你已經排到第 ${result.queue.length} 位！`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '未能加入隊伍，請再試一次。');
      } finally {
        setName('');
        setPassword('');
        setIsDropping(false);
      }
    }, 780);
  }

  function openEditDialog(item: QueueItem) {
    setNotice('');
    setEditItem(item);
    setEditName(item.name);
    setEditPassword('');
    setEditError('');
  }

  function closeEditDialog() {
    setEditItem(null);
    setEditName('');
    setEditPassword('');
    setEditError('');
  }

  async function updateQueueItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editItem || !editName.trim() || !editPassword || isEditing) return;
    setIsEditing(true);
    setEditError('');
    try {
      const response = await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editItem.id, name: editName.trim(), password: editPassword }),
      });
      const result = await response.json() as { queue?: QueueItem[]; error?: string };
      if (!response.ok || !result.queue) throw new Error(result.error || '未能更新排隊紀錄');
      setQueue(result.queue);
      setNotice(`${editName.trim().toUpperCase()} 嘅排隊紀錄已更新。`);
      closeEditDialog();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : '未能更新排隊紀錄');
    } finally {
      setIsEditing(false);
    }
  }

  async function removeQueueItem() {
    if (!editItem || !editPassword || isEditing) return;
    setIsEditing(true);
    setEditError('');
    try {
      const response = await fetch('/api/queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editItem.id, password: editPassword }),
      });
      const result = await response.json() as { queue?: QueueItem[]; error?: string };
      if (!response.ok || !result.queue) throw new Error(result.error || '未能取消排隊');
      setQueue(result.queue);
      setNotice(`${editItem.name} 已取消排隊。`);
      closeEditDialog();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : '未能取消排隊');
    } finally {
      setIsEditing(false);
    }
  }

  function closePickupDialog() {
    if (isPickingUp) return;
    setIsPickupDialogOpen(false);
    setPickupError('');
  }

  async function confirmPickup() {
    if (!canMarkPickedUp || isPickingUp) return;
    setIsPickingUp(true);
    setPickupError('');
    try {
      const response = await fetch('/api/queue/pickup', { method: 'POST' });
      const result = await response.json() as {
        queue?: QueueItem[];
        handoff?: PrinterHandoff;
        pickedUpName?: string;
        error?: string;
      };
      if (!response.ok || !result.queue || !result.handoff) {
        throw new Error(result.error || '未能完成取件');
      }
      setQueue(result.queue);
      setHandoff(result.handoff);
      const nextName = result.queue[0]?.name;
      setNotice(nextName
        ? `${result.pickedUpName} 已取件，printer 已空。下一位 ${nextName} 可以開始。`
        : `${result.pickedUpName} 已取件，printer 已空。`);
      setIsPickupDialogOpen(false);
    } catch (error) {
      setPickupError(error instanceof Error ? error.message : '未能完成取件');
    } finally {
      setIsPickingUp(false);
    }
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="COINPRINT home">
          <span className="brand-mark"><Printer aria-hidden="true" /></span>
          <span>COINPRINT <b>LAB</b></span>
        </a>
        <div className="machine-status" role="status">
          <span className={`status-dot ${isLive ? '' : 'offline'}`} /> {bridgeLabel}
        </div>
        <Badge className="queue-badge">{queue.length} IN QUEUE</Badge>
      </header>

      <div className="app-shell" id="top">
        <section className="hero-panel" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow"><Sparkles aria-hidden="true" /> MAKER STATION 01</p>
            <h1 id="page-title">INSERT COIN.<br /><span>PRINT SOMETHING.</span></h1>
            <p className="intro">由左邊玻璃錢罐攞個 JW coin，入名確認，銀仔就會投落部機。</p>
          </div>

          <div className={`printer-stage state-${printerAnimation} ${isDropping ? 'is-dropping' : ''}`}>
            <div className="scanlines" aria-hidden="true" />
            <div className="coin-drop" aria-hidden="true"><span>{coin.mark}</span></div>
            <button
              type="button"
              className={`coin-jar ${isNameDialogOpen ? 'coin-is-picked' : ''}`}
              onClick={() => { setNotice(''); setIsNameDialogOpen(true); }}
              disabled={isDropping}
              aria-label="從玻璃錢罐攞一個 JW coin"
            >
              <img src="/key-visual-jar.png" alt="裝滿金幣的像素風玻璃錢罐" width={600} height={1024} />
              <span className="jar-coin" aria-hidden="true"><span>{coin.mark}</span></span>
              <span className="jar-hint">攞幣排隊</span>
            </button>
            <div
              className="printer-picture"
              style={{
                '--print-progress': `${printProgress}%`,
                '--rocket-line-bottom': `${35.9 + printProgress * 0.179}%`,
              } as React.CSSProperties}
            >
              <picture>
                <source media="(prefers-reduced-motion: reduce)" srcSet="/key-visual-printer.png" />
                <img
                  key={printerAnimation}
                  src={printerAnimationSrc}
                  alt={printerAlt}
                  width={473}
                  height={512}
                  className="printer-art"
                />
              </picture>
              {printerAnimation === 'printing' && (
                <>
                  <span className="rocket-unbuilt" aria-hidden="true" />
                  <span className="rocket-live-layer" aria-hidden="true">
                    <img src="/key-visual-printer.png" alt="" />
                  </span>
                  <span className="rocket-layer-line" aria-hidden="true">
                    <b>{printProgress}%</b>
                  </span>
                </>
              )}
            </div>
            <div className="print-label">
              <span>{handoff.readyForNext ? 'PRINTER EMPTY' : isLive ? 'LIVE FROM P1S' : 'DEMO PREVIEW'}</span>
              <strong>{handoff.readyForNext ? queue[0] ? `NEXT · ${queue[0].name}` : 'READY TO USE' : printer.filename}</strong>
            </div>
          </div>

          <div className={`current-job ${handoff.readyForNext ? 'is-ready' : ''}`}>
            <div className="job-icon"><Printer aria-hidden="true" /></div>
            <div className="job-meta">
              <div><strong>{handoff.readyForNext ? 'PRINTER 已空' : printer.state === 'IDLE' ? 'P1S READY' : printer.filename}</strong><span>{handoff.readyForNext ? 'READY' : `${printer.progress}%`}</span></div>
              <div className="pixel-progress"><i style={{ width: `${handoff.readyForNext ? 0 : printer.progress}%` }} /></div>
              <p>
                {handoff.readyForNext
                  ? queue[0]
                    ? `下一位：${queue[0].name} · 可以開始使用 P1S`
                    : '暫時未有人排隊 · P1S 可以使用'
                  : isLive
                  ? `Layer ${printer.layer || '—'} / ${printer.totalLayers || '—'} · ${printer.remainingMinutes} mins left · ${Math.round(printer.nozzleTemp)}° / ${Math.round(printer.bedTemp)}°`
                  : printer.bridge === 'setup_required'
                    ? 'Add your P1S details to .env.local to go live'
                    : 'Demo data · local P1S bridge is not connected'}
              </p>
            </div>
            {!handoff.readyForNext && queue.length > 0 && (
              <Button
                type="button"
                className="pickup-action"
                onClick={() => { setPickupError(''); setIsPickupDialogOpen(true); }}
                disabled={!canMarkPickedUp}
                title={canMarkPickedUp ? '確認目前作品已經取走' : '完成列印後先可以確認取件'}
              >
                <PackageCheck aria-hidden="true" /> 已取件
              </Button>
            )}
          </div>
          <div className={`bridge-note ${isLive ? 'live' : ''}`}>
            <span /> {isLive ? 'REAL-TIME P1S STATUS' : 'BAMBU CLOUD BRIDGE · READ ONLY'}
          </div>
        </section>

        <aside className="control-panel" aria-label="Join the 3D printing queue">
          <div className="panel-heading">
            <p>LIVE LINE</p><h2>排隊名單</h2><span>由左邊錢罐攞 JW coin 加入。</span>
          </div>
          <p className={`success-message queue-success ${notice ? 'show' : ''}`} aria-live="polite"><Check aria-hidden="true" /> {notice}</p>

          <div className="queue-card">
            <div className="queue-header">
              <div><p>PRINT QUEUE</p><span>點擊排隊格，用密碼改名或取消預約。</span></div>
            </div>
            <ol className="queue-list">
              {queue.length === 0 && <li className="queue-empty">暫時未有人排隊，攞第一個 JW coin 啦。</li>}
              {queue.map((item, index) => (
                <li key={item.id} className={index === 0 ? 'active-job' : ''}>
                  <button type="button" className="queue-row" onClick={() => openEditDialog(item)} aria-label={`修改 ${item.name} 排隊紀錄`}>
                    <span className="queue-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="avatar" style={{ '--avatar': item.color } as React.CSSProperties}>{item.name.slice(0, 1)}</span>
                    <span className="queue-name"><strong>{item.name}</strong><small>{index === 0 ? handoff.readyForNext ? 'YOUR TURN' : 'PRINTING NOW' : 'IN QUEUE'}</small></span>
                    <span className="queue-state">{index === 0 ? handoff.readyForNext ? 'READY' : <i className="mini-bars" /> : index === 1 ? 'NEXT' : 'QUEUED'}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      <footer><span>OPEN 10:00—22:00 · MAKER SPACE, 2/F</span><span>ONE COIN · ONE PRINT · BE NICE ✦</span></footer>

      {isNameDialogOpen && (
        <div className="modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) { setIsNameDialogOpen(false); setName(''); setPassword(''); } }}>
          <section className="name-dialog" role="dialog" aria-modal="true" aria-labelledby="coin-dialog-title" aria-describedby="coin-dialog-description">
            <button type="button" className="modal-close" onClick={() => { setIsNameDialogOpen(false); setName(''); setPassword(''); }} aria-label="關閉">
              <X aria-hidden="true" />
            </button>
            <header className="dialog-header">
              <div className="dialog-token" aria-hidden="true"><span>{coin.mark}</span></div>
              <h2 id="coin-dialog-title">攞咗一個 JW coin</h2>
              <p id="coin-dialog-description">輸入你個名同修改密碼，確認後銀仔就會投落 printer。</p>
            </header>
            <form onSubmit={joinQueue} className="dialog-form">
              <label className="name-field">
                <span><b>1</b> WHO&apos;S PRINTING?</span>
                <div className="input-wrap">
                  <UserRound aria-hidden="true" />
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="輸入你個名..." maxLength={16} autoComplete="name" required autoFocus aria-label="你的名字" />
                </div>
              </label>
              <label className="name-field password-field">
                <span><b>2</b> EDIT PASSWORD</span>
                <div className="input-wrap">
                  <LockKeyhole aria-hidden="true" />
                  <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="最少 6 個字元..." minLength={6} maxLength={64} autoComplete="new-password" required aria-label="修改排隊紀錄的密碼" />
                </div>
              </label>
              <p className="dialog-note">只用作之後改名或取消排隊；系統只會儲存加密驗證值。</p>
              <div className="dialog-actions">
                <Button type="button" variant="outline" onClick={() => { setIsNameDialogOpen(false); setName(''); setPassword(''); }}>放返低</Button>
                <Button type="submit" disabled={!name.trim() || password.length < 6} className="confirm-coin">
                  <Coins aria-hidden="true" /> 確定投幣
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {editItem && (
        <div className="modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget && !isEditing) closeEditDialog(); }}>
          <section className="name-dialog edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-dialog-title" aria-describedby="edit-dialog-description">
            <button type="button" className="modal-close" onClick={closeEditDialog} disabled={isEditing} aria-label="關閉">
              <X aria-hidden="true" />
            </button>
            <header className="dialog-header">
              <div className="dialog-token" aria-hidden="true"><span>{coin.mark}</span></div>
              <h2 id="edit-dialog-title">修改排隊紀錄</h2>
              <p id="edit-dialog-description">輸入加入排隊時設定嘅密碼。現有四位排隊者預設 PIN 係 0000。</p>
            </header>
            <form onSubmit={updateQueueItem} className="dialog-form">
              <label className="name-field">
                <span><b>1</b> DISPLAY NAME</span>
                <div className="input-wrap">
                  <UserRound aria-hidden="true" />
                  <Input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={16} required autoFocus aria-label="更新名字" />
                </div>
              </label>
              <label className="name-field password-field">
                <span><b>2</b> PASSWORD / PIN</span>
                <div className="input-wrap">
                  <LockKeyhole aria-hidden="true" />
                  <Input type="password" value={editPassword} onChange={(event) => setEditPassword(event.target.value)} maxLength={64} autoComplete="current-password" required aria-label="排隊紀錄密碼" />
                </div>
              </label>
              <p className={`edit-feedback ${editError ? 'show' : ''}`} role="alert">{editError}</p>
              <div className="dialog-actions edit-actions">
                <Button type="button" variant="outline" className="danger-action" onClick={removeQueueItem} disabled={!editPassword || isEditing}>
                  <Trash2 aria-hidden="true" /> 取消排隊
                </Button>
                <Button type="submit" disabled={!editName.trim() || !editPassword || isEditing} className="confirm-coin">
                  <Check aria-hidden="true" /> 儲存修改
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isPickupDialogOpen && queue[0] && (
        <div className="modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) closePickupDialog(); }}>
          <section className="name-dialog pickup-dialog" role="dialog" aria-modal="true" aria-labelledby="pickup-dialog-title" aria-describedby="pickup-dialog-description">
            <button type="button" className="modal-close" onClick={closePickupDialog} disabled={isPickingUp} aria-label="關閉">
              <X aria-hidden="true" />
            </button>
            <header className="dialog-header">
              <div className="pickup-token" aria-hidden="true"><PackageCheck /></div>
              <h2 id="pickup-dialog-title">確認已取件？</h2>
              <p id="pickup-dialog-description">確認 {queue[0].name} 已經拎走作品。完成後會移除第一位，並顯示 printer 已空。</p>
            </header>
            <p className={`edit-feedback pickup-feedback ${pickupError ? 'show' : ''}`} role="alert">{pickupError}</p>
            <div className="dialog-actions">
              <Button type="button" variant="outline" onClick={closePickupDialog} disabled={isPickingUp}>返回</Button>
              <Button type="button" className="confirm-pickup" onClick={confirmPickup} disabled={isPickingUp}>
                <PackageCheck aria-hidden="true" /> {isPickingUp ? '處理中…' : '確認已取件'}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Check, Coins, Printer, Sparkles, UserRound, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type QueueItem = { id: string; name: string; color: string };
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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDropping, setIsDropping] = useState(false);
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [printer, setPrinter] = useState<PrinterStatus>(demoPrinter);

  useEffect(() => {
    let active = true;

    async function refreshState() {
      try {
        const response = await fetch('/api/state', { cache: 'no-store' });
        if (!response.ok) throw new Error('Live state unavailable');
        const next = await response.json() as { queue: QueueItem[]; printer: PrinterStatus | null };
        if (active) {
          setQueue(next.queue);
          setPrinter(next.printer || demoPrinter);
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
    if (!isNameDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNameDialogOpen(false);
        setName('');
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isNameDialogOpen]);

  const isLive = printer.bridge === 'live' && printer.connected;
  const printerAnimation = printer.hasError || printer.state === 'ERROR'
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
  const bridgeLabel = isLive
    ? `P1S · ${printer.state}`
    : printer.bridge === 'setup_required'
      ? 'P1S BRIDGE · SETUP NEEDED'
      : printer.bridge === 'connecting' || printer.bridge === 'connected'
        ? 'P1S BRIDGE · CONNECTING'
        : 'P1S BRIDGE · DEMO MODE';

  async function joinQueue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim().slice(0, 16);
    if (!cleanName || isDropping) return;
    setIsNameDialogOpen(false);
    setIsDropping(true);
    setNotice('');

    window.setTimeout(async () => {
      try {
        const response = await fetch('/api/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cleanName }),
        });
        if (!response.ok) throw new Error('Queue request failed');
        const result = await response.json() as { queue: QueueItem[] };
        setQueue(result.queue);
        setNotice(`${cleanName}，你已經排到第 ${result.queue.length} 位！`);
      } catch {
        setNotice('未能加入隊伍，請再試一次。');
      } finally {
        setName('');
        setIsDropping(false);
      }
    }, 780);
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
            <picture className="printer-picture">
              <source media="(prefers-reduced-motion: reduce)" srcSet="/key-visual-printer.png" />
              <img
                key={printerAnimation}
                src={`/printer-kv-${printerAnimation}.gif`}
                alt={printerAlt}
                width={473}
                height={512}
                className="printer-art"
              />
            </picture>
            <div className="print-label"><span>{isLive ? 'LIVE FROM P1S' : 'DEMO PREVIEW'}</span><strong>{printer.filename}</strong></div>
          </div>

          <div className="current-job">
            <div className="job-icon"><Printer aria-hidden="true" /></div>
            <div className="job-meta">
              <div><strong>{printer.state === 'IDLE' ? 'P1S READY' : printer.filename}</strong><span>{printer.progress}%</span></div>
              <div className="pixel-progress"><i style={{ width: `${printer.progress}%` }} /></div>
              <p>
                {isLive
                  ? `Layer ${printer.layer || '—'} / ${printer.totalLayers || '—'} · ${printer.remainingMinutes} mins left · ${Math.round(printer.nozzleTemp)}° / ${Math.round(printer.bedTemp)}°`
                  : printer.bridge === 'setup_required'
                    ? 'Add your P1S details to .env.local to go live'
                    : 'Demo data · local P1S bridge is not connected'}
              </p>
            </div>
          </div>
          <div className={`bridge-note ${isLive ? 'live' : ''}`}>
            <span /> {isLive ? 'REAL-TIME P1S STATUS' : 'LOCAL BRIDGE · READ ONLY'}
          </div>
        </section>

        <aside className="control-panel" aria-label="Join the 3D printing queue">
          <div className="panel-heading">
            <p>LIVE LINE</p><h2>排隊名單</h2><span>由左邊錢罐攞 JW coin 加入。</span>
          </div>
          <p className={`success-message queue-success ${notice ? 'show' : ''}`} aria-live="polite"><Check aria-hidden="true" /> {notice}</p>

          <div className="queue-card">
            <div className="queue-header">
              <div><p>PRINT QUEUE</p><span>而家有 {queue.length} 個 makers</span></div>
            </div>
            <ol className="queue-list">
              {queue.length === 0 && <li className="queue-empty">暫時未有人排隊，攞第一個 JW coin 啦。</li>}
              {queue.map((item, index) => (
                <li key={item.id} className={index === 0 ? 'active-job' : ''}>
                  <span className="queue-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="avatar" style={{ '--avatar': item.color } as React.CSSProperties}>{item.name.slice(0, 1)}</span>
                  <span className="queue-name"><strong>{item.name}</strong><small>{index === 0 ? 'PRINTING NOW' : 'IN QUEUE'}</small></span>
                  <span className="queue-state">{index === 0 ? <i className="mini-bars" /> : index === 1 ? 'NEXT' : 'QUEUED'}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      <footer><span>OPEN 10:00—22:00 · MAKER SPACE, 2/F</span><span>ONE COIN · ONE PRINT · BE NICE ✦</span></footer>

      {isNameDialogOpen && (
        <div className="modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) { setIsNameDialogOpen(false); setName(''); } }}>
          <section className="name-dialog" role="dialog" aria-modal="true" aria-labelledby="coin-dialog-title" aria-describedby="coin-dialog-description">
            <button type="button" className="modal-close" onClick={() => { setIsNameDialogOpen(false); setName(''); }} aria-label="關閉">
              <X aria-hidden="true" />
            </button>
            <header className="dialog-header">
              <div className="dialog-token" aria-hidden="true"><span>{coin.mark}</span></div>
              <h2 id="coin-dialog-title">攞咗一個 JW coin</h2>
              <p id="coin-dialog-description">輸入你個名，確認後銀仔就會投落 printer，完成排隊。</p>
            </header>
            <form onSubmit={joinQueue} className="dialog-form">
              <label className="name-field">
                <span><b>1</b> WHO&apos;S PRINTING?</span>
                <div className="input-wrap">
                  <UserRound aria-hidden="true" />
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="輸入你個名..." maxLength={16} autoComplete="name" required autoFocus aria-label="你的名字" />
                </div>
              </label>
              <div className="dialog-actions">
                <Button type="button" variant="outline" onClick={() => { setIsNameDialogOpen(false); setName(''); }}>放返低</Button>
                <Button type="submit" disabled={!name.trim()} className="confirm-coin">
                  <Coins aria-hidden="true" /> 確定投幣
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

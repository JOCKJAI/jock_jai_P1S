'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, Clock3, Coins, Printer, Sparkles, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Coin = { value: number; minutes: number; label: string };
type QueueItem = { id: number; name: string; minutes: number; color: string };

const coins: Coin[] = [
  { value: 1, minutes: 15, label: 'Quick' },
  { value: 2, minutes: 30, label: 'Standard' },
  { value: 5, minutes: 60, label: 'Big print' },
];

const starterQueue: QueueItem[] = [
  { id: 1, name: 'MING', minutes: 24, color: '#ff774f' },
  { id: 2, name: 'JOYCE', minutes: 15, color: '#abf23e' },
  { id: 3, name: 'KAI', minutes: 30, color: '#4fd7ff' },
];

export default function Home() {
  const [selectedCoin, setSelectedCoin] = useState<Coin>(coins[1]);
  const [name, setName] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>(starterQueue);
  const [isDropping, setIsDropping] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const saved = window.localStorage.getItem('coinprint-queue');
    if (saved) {
      try {
        setQueue(JSON.parse(saved));
      } catch {
        window.localStorage.removeItem('coinprint-queue');
      }
    }
  }, []);

  const totalWait = useMemo(
    () => queue.reduce((sum, item) => sum + item.minutes, 0),
    [queue],
  );

  function joinQueue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim().slice(0, 16);
    if (!cleanName || isDropping) return;
    setIsDropping(true);
    setNotice('');

    window.setTimeout(() => {
      const newQueue = [
        ...queue,
        {
          id: Date.now(),
          name: cleanName.toUpperCase(),
          minutes: selectedCoin.minutes,
          color: selectedCoin.value === 1 ? '#abf23e' : selectedCoin.value === 2 ? '#4fd7ff' : '#ff774f',
        },
      ];
      setQueue(newQueue);
      window.localStorage.setItem('coinprint-queue', JSON.stringify(newQueue));
      setName('');
      setIsDropping(false);
      setNotice(`${cleanName}，你已經排到第 ${newQueue.length} 位！`);
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
          <span className="status-dot" /> PRINTER 01 · PRINTING
        </div>
        <Badge className="queue-badge">{queue.length} IN QUEUE</Badge>
      </header>

      <div className="app-shell" id="top">
        <section className="hero-panel" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow"><Sparkles aria-hidden="true" /> MAKER STATION 01</p>
            <h1 id="page-title">INSERT COIN.<br /><span>PRINT SOMETHING.</span></h1>
            <p className="intro">揀一個 print slot，留低你個名，再將銀仔投落部機。就係咁簡單。</p>
          </div>

          <div className={`printer-stage ${isDropping ? 'is-dropping' : ''}`}>
            <div className="scanlines" aria-hidden="true" />
            <div className="coin-drop" aria-hidden="true">${selectedCoin.value}</div>
            <Image src="/pixel-printer.png" alt="一部正在列印橙色小火箭的像素風 3D printer" width={900} height={900} priority className="printer-art" />
            <div className="print-label" aria-hidden="true"><span>NOW PRINTING</span><strong>ROCKET_V3.STL</strong></div>
          </div>

          <div className="current-job">
            <div className="job-icon"><Printer aria-hidden="true" /></div>
            <div className="job-meta">
              <div><strong>MING&apos;S ROCKET</strong><span>68%</span></div>
              <div className="pixel-progress"><i /></div>
              <p>Layer 816 / 1200 · 24 mins left</p>
            </div>
          </div>
        </section>

        <aside className="control-panel" aria-label="Join the 3D printing queue">
          <div className="panel-heading">
            <p>YOUR TURN</p><h2>拎個籌，排隊印。</h2><span>每個 coin 代表一個列印時段。</span>
          </div>

          <form onSubmit={joinQueue}>
            <fieldset>
              <legend><span>1</span> PICK A COIN</legend>
              <div className="coin-grid">
                {coins.map((coin) => (
                  <button type="button" key={coin.value} onClick={() => setSelectedCoin(coin)} className={`coin-option ${selectedCoin.value === coin.value ? 'selected' : ''}`} aria-pressed={selectedCoin.value === coin.value}>
                    <span className="coin-face">${coin.value}</span><strong>{coin.minutes} MIN</strong><small>{coin.label}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="name-field">
              <span><b>2</b> WHO&apos;S PRINTING?</span>
              <div className="input-wrap">
                <UserRound aria-hidden="true" />
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="輸入你個名..." maxLength={16} autoComplete="name" required aria-label="你的名字" />
              </div>
            </label>

            <Button type="submit" disabled={!name.trim() || isDropping} className="insert-button">
              <Coins aria-hidden="true" /> {isDropping ? 'COIN DROPPING...' : `INSERT $${selectedCoin.value} COIN`} <span aria-hidden="true">→</span>
            </Button>
            <p className={`success-message ${notice ? 'show' : ''}`} aria-live="polite"><Check aria-hidden="true" /> {notice}</p>
          </form>

          <div className="queue-card">
            <div className="queue-header">
              <div><p>PRINT QUEUE</p><span>而家有 {queue.length} 個 makers</span></div>
              <div className="wait-time"><Clock3 aria-hidden="true" /><strong>~{totalWait}</strong><small>MIN</small></div>
            </div>
            <ol className="queue-list">
              {queue.map((item, index) => (
                <li key={item.id} className={index === 0 ? 'active-job' : ''}>
                  <span className="queue-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="avatar" style={{ '--avatar': item.color } as React.CSSProperties}>{item.name.slice(0, 1)}</span>
                  <span className="queue-name"><strong>{item.name}</strong><small>{index === 0 ? 'PRINTING NOW' : `${item.minutes} MIN SLOT`}</small></span>
                  <span className="queue-state">{index === 0 ? <i className="mini-bars" /> : index === 1 ? 'NEXT' : `${item.minutes}m`}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      <footer><span>OPEN 10:00—22:00 · MAKER SPACE, 2/F</span><span>ONE COIN · ONE PRINT · BE NICE ✦</span></footer>
    </main>
  );
}

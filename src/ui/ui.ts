import type { Level } from '../game/levels';
import type { RideReason } from '../game/ride';
import type { DeathReason } from '../game/rhythm';
import { share } from '../share';
import type { Progress } from '../storage';
import {
  DAILY_NAME,
  DEATH_JOKES,
  DEATH_TITLES,
  ENDLESS_LOCKED,
  ENDLESS_NAME,
  ENDLESS_SUBTITLE,
  GRANDPA_TIPS,
  HOW_TO,
  pick,
  RIDE_DEATH_JOKES,
  RIDE_DEATH_TITLES,
  RIDE_NAME,
  RIDE_SUBTITLE,
  RIDE_TIPS,
  streetsWord,
  TAGLINE,
  TITLE,
} from '../text/ru';

export interface EndlessEntry {
  open: boolean;
  best: number;
  onPlay: () => void;
}

export interface RideEntry {
  open: boolean;
  /** Longest ride, metres. */
  best: number;
  onPlay: () => void;
}

export interface RideStats {
  distance: number;
  best: number;
  record: boolean;
  nearMisses: number;
  time: number;
}

export interface DailyEntry {
  open: boolean;
  /** Small line under the button: attempt, done, or the day's flavour. */
  note: string;
  onPlay: () => void;
}

/** What the death screen adds during a street of the day. */
export interface DailyRun {
  rows: string[];
  note: string;
}

export interface DailyResult {
  won: boolean;
  stars: number;
  number: number;
  street: string;
  subtitle: string;
  rows: string[];
  streak: number;
  next: string;
  shareText: string;
}

export interface SettingItem {
  label: string;
  value: string;
  /** Applies the change and returns the new value to show. */
  onClick: () => string;
}

export interface EndlessRun {
  crossed: number;
  best: number;
  record: boolean;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Marker position 0..1 on the tempo bar: slow on the left, fast on the right. */
export function tempoPos(ratio: number): number {
  const v = -Math.log2(Math.max(0.01, ratio));
  return 0.5 + Math.max(-1, Math.min(1, v)) * 0.5;
}

export class Hud {
  readonly root: HTMLElement;
  private title: HTMLElement;
  private mute: HTMLButtonElement;
  private tempo: HTMLElement;
  private hint: HTMLElement;
  private zone: HTMLElement;
  private marker: HTMLElement;
  private beat: HTMLElement;
  private progress: HTMLElement;
  private fill: HTMLElement;
  private topbar: HTMLElement;

  constructor(
    private ui: HTMLElement,
    handlers: { onMute: () => void; onMenu: () => void },
  ) {
    this.root = el('div', 'hud hidden');
    this.topbar = el('div', 'topbar');
    const menu = el('button', 'icon-btn', '☰');
    menu.setAttribute('aria-label', 'Меню');
    menu.addEventListener('click', handlers.onMenu);
    this.title = el('div', 'title');
    this.mute = el('button', 'icon-btn') as HTMLButtonElement;
    this.mute.setAttribute('aria-label', 'Звук');
    this.mute.addEventListener('click', handlers.onMute);
    this.topbar.append(menu, this.title, this.mute);

    this.tempo = el('div', 'tempo');
    this.hint = el('div', 'hint');
    const bar = el('div', 'bar');
    this.zone = el('div', 'zone');
    this.marker = el('div', 'marker');
    this.beat = el('div', 'beat');
    bar.append(this.zone, this.beat, this.marker);
    const labels = el('div', 'labels', '<span>медленно</span><span>ровно</span><span>быстро</span>');
    this.tempo.append(this.hint, bar, labels);

    this.progress = el('div', 'progress');
    this.fill = el('div', 'fill');
    this.progress.append(this.fill);

    this.root.append(this.topbar, this.progress, this.tempo);
    ui.append(this.root);
  }

  show(level: Level, title: string): void {
    this.title.textContent = title;
    const a = tempoPos(1 + level.tolerance);
    const b = tempoPos(1 - level.tolerance);
    this.zone.style.left = `${a * 100}%`;
    this.zone.style.width = `${(b - a) * 100}%`;
    this.root.classList.remove('ride', 'hidden');
  }

  /** The bike mode has no rhythm: the bottom bar only carries a line of text. */
  showRide(title: string): void {
    this.title.textContent = title;
    this.root.classList.add('ride');
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setMuted(m: boolean): void {
    this.mute.textContent = m ? '🔇' : '🔊';
  }

  setTempo(ratio: number | null): void {
    this.marker.style.left = `${tempoPos(ratio ?? 1) * 100}%`;
    this.marker.style.opacity = ratio === null ? '0.35' : '1';
  }

  setHint(text: string, warn = false, tip = false): void {
    if (this.hint.textContent !== text) this.hint.textContent = text;
    this.hint.classList.toggle('warn', warn);
    this.hint.classList.toggle('tip', tip);
  }

  pulse(): void {
    this.beat.classList.remove('pulse');
    void this.beat.offsetWidth; // restart the animation
    this.beat.classList.add('pulse');
  }

  setProgress(p: number): void {
    this.fill.style.height = `${Math.max(0, Math.min(1, p)) * 100}%`;
  }

  pop(text: string, x: number, y: number, small = false): void {
    const p = el('div', small ? 'pop small' : 'pop');
    p.textContent = text;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    this.ui.append(p);
    setTimeout(() => p.remove(), 950);
  }

  /** A big word in the middle of the screen: "street crossed" in the endless run. */
  banner(text: string): void {
    this.ui.querySelector('.banner')?.remove();
    const b = el('div', 'banner');
    b.textContent = text;
    this.ui.append(b);
    setTimeout(() => b.remove(), 1100);
  }

  /** CSS px of the playfield covered by HUD bars. */
  insets(): { top: number; bottom: number } {
    if (this.root.classList.contains('hidden')) return { top: 0, bottom: 0 };
    return { top: this.topbar.offsetHeight, bottom: this.tempo.offsetHeight };
  }
}

export class Screens {
  private current: HTMLElement | null = null;

  constructor(private ui: HTMLElement) {}

  close(): void {
    this.current?.remove();
    this.current = null;
  }

  get open(): boolean {
    return this.current !== null;
  }

  private mount(card: HTMLElement, cls = ''): HTMLElement {
    this.close();
    const s = el('div', `screen ${cls}`);
    s.append(card);
    this.ui.append(s);
    this.current = s;
    return s;
  }

  /** "Share" that reports back on itself: shared, copied, or try again. */
  private shareButton(text: string): HTMLButtonElement {
    const b = this.button('Поделиться', () => {
      void share(text).then((res) => {
        if (res === 'copied') b.textContent = 'Ссылка скопирована ✓';
        else if (res === 'shared') b.textContent = 'Поделился ✓';
      });
    }, true);
    return b;
  }

  private button(label: string, onClick: () => void, secondary = false): HTMLButtonElement {
    const b = el('button', secondary ? 'btn secondary' : 'btn', escape(label)) as HTMLButtonElement;
    b.addEventListener('click', onClick);
    return b;
  }

  menu(
    onPlay: () => void,
    onLevels: () => void,
    endless: EndlessEntry,
    onSettings: () => void,
    daily: DailyEntry,
    ride: RideEntry,
  ): void {
    const card = el('div', 'card');
    card.append(
      el('h1', '', escape(TITLE)),
      el('p', '', escape(TAGLINE)),
      el('p', 'muted', HOW_TO.map(escape).join('<br>')),
      this.button('Перейти дорогу', onPlay),
    );
    if (daily.open) card.append(this.dailyButton(daily));
    if (endless.open) card.append(this.endlessButton(endless));
    if (ride.open) card.append(this.rideButton(ride));
    card.append(this.button('Выбрать улицу', onLevels, true), this.button('Настройки', onSettings, true));
    this.mount(card);
  }

  settings(items: SettingItem[], onBack: () => void): void {
    const card = el('div', 'card');
    card.append(el('h2', '', 'Настройки'));
    const list = el('div', 'levels');
    for (const it of items) {
      const b = el(
        'button',
        'level-btn setting',
        `<span class="name">${escape(it.label)}</span><span class="value">${escape(it.value)}</span>`,
      ) as HTMLButtonElement;
      b.addEventListener('click', () => (b.querySelector('.value')!.textContent = it.onClick()));
      list.append(b);
    }
    card.append(list, this.button('Назад', onBack, true));
    this.mount(card);
  }

  private endlessButton(e: EndlessEntry): HTMLButtonElement {
    const b = el(
      'button',
      'btn endless',
      `${escape(ENDLESS_NAME)}${e.best ? `<small>рекорд: ${e.best}</small>` : ''}`,
    ) as HTMLButtonElement;
    b.addEventListener('click', e.onPlay);
    return b;
  }

  private rideButton(e: RideEntry): HTMLButtonElement {
    const b = el(
      'button',
      'btn ride',
      `${escape(RIDE_NAME)}<small>${escape(e.best ? `рекорд: ${e.best} м` : RIDE_SUBTITLE)}</small>`,
    ) as HTMLButtonElement;
    b.addEventListener('click', e.onPlay);
    return b;
  }

  private dailyButton(d: DailyEntry): HTMLButtonElement {
    const b = el('button', 'btn daily', `${escape(DAILY_NAME)}<small>${escape(d.note)}</small>`) as HTMLButtonElement;
    b.addEventListener('click', d.onPlay);
    return b;
  }

  /** `onRestart` is left out where starting over would dodge a lost attempt. */
  pause(onResume: () => void, onRestart: (() => void) | undefined, onMenu: () => void): void {
    const card = el('div', 'card');
    card.append(
      el('h1', '', 'Пауза'),
      el('p', 'muted', 'Дорога подождёт. Байки тоже замерли — редкий случай.'),
      this.button('Продолжить', onResume),
    );
    if (onRestart) card.append(this.button('Заново', onRestart, true));
    card.append(this.button('Меню', onMenu, true));
    this.mount(card);
  }

  levels(
    levels: Level[],
    progress: Progress,
    onPick: (i: number) => void,
    onBack: () => void,
    endless: EndlessEntry,
  ): void {
    const card = el('div', 'card');
    card.append(el('h2', '', 'Улицы Нячанга'));
    const list = el('div', 'levels');
    levels.forEach((lv, i) => {
      const locked = i > progress.unlocked;
      const stars = progress.stars[lv.id] ?? 0;
      const b = el(
        'button',
        'level-btn',
        `<span class="num">${locked ? '🔒' : i + 1}</span>
         <span class="name">${escape(lv.name)}<small>${escape(lv.subtitle)}</small></span>
         <span>${'★'.repeat(stars)}${'<span style="opacity:.25">★</span>'.repeat(3 - stars)}</span>`,
      ) as HTMLButtonElement;
      b.disabled = locked;
      b.addEventListener('click', () => onPick(i));
      list.append(b);
    });
    const e = el(
      'button',
      'level-btn',
      `<span class="num">${endless.open ? '∞' : '🔒'}</span>
       <span class="name">${escape(ENDLESS_NAME)}<small>${escape(endless.open ? ENDLESS_SUBTITLE : ENDLESS_LOCKED)}</small></span>
       <span>${endless.best ? endless.best : ''}</span>`,
    ) as HTMLButtonElement;
    e.disabled = !endless.open;
    e.addEventListener('click', endless.onPlay);
    list.append(e);
    card.append(list, this.button('Назад', onBack, true));
    this.mount(card);
  }

  death(
    reason: DeathReason,
    stats: { accuracy: number; time: number },
    onRetry: (() => void) | undefined,
    onMenu: () => void,
    run?: EndlessRun,
    shareText?: string,
    daily?: DailyRun,
  ): void {
    const card = el('div', 'card');
    card.append(el('h1', '', escape(DEATH_TITLES[reason])));
    if (run) {
      card.append(
        el(
          'div',
          'stats',
          `<div><b>${run.crossed}</b><span>${escape(streetsWord(run.crossed))}</span></div>
           <div><b>${run.best}</b><span>${run.record && run.crossed ? 'новый рекорд!' : 'рекорд'}</span></div>`,
        ),
      );
    }
    card.append(
      el('p', '', escape(pick(DEATH_JOKES[reason]))),
      el('div', 'tip', `<span class="who">👴</span><span><b>Дед Тхань с пластикового стульчика:</b><br>${escape(pick(GRANDPA_TIPS[reason]))}</span>`),
      el(
        'p',
        'muted',
        `Ровных шагов: ${Math.round(stats.accuracy * 100)}% · ${stats.time.toFixed(1)} с на дороге`,
      ),
    );
    if (daily) card.append(this.grid(daily.rows), el('p', 'muted', escape(daily.note)));
    if (onRetry) card.append(this.button(daily ? 'Следующая попытка' : 'Ещё раз', onRetry));
    if (shareText) card.append(this.shareButton(shareText));
    card.append(this.button('Меню', onMenu, true));
    this.mount(card);
  }

  rideOver(reason: RideReason, st: RideStats, onRetry: () => void, onMenu: () => void, shareText?: string): void {
    const card = el('div', 'card');
    card.append(
      el('h1', '', escape(RIDE_DEATH_TITLES[reason])),
      el(
        'div',
        'stats',
        `<div><b>${st.distance}</b><span>метров</span></div>
         <div><b>${st.best}</b><span>${st.record ? 'новый рекорд!' : 'рекорд'}</span></div>
         <div><b>${st.nearMisses}</b><span>бип-бип</span></div>`,
      ),
      el('p', '', escape(pick(RIDE_DEATH_JOKES[reason]))),
      el('div', 'tip', `<span class="who">👴</span><span><b>Дед Тхань с пластикового стульчика:</b><br>${escape(pick(RIDE_TIPS[reason]))}</span>`),
      el('p', 'muted', `${st.time.toFixed(1)} с в седле`),
      this.button('Ещё раз', onRetry),
    );
    if (shareText) card.append(this.shareButton(shareText));
    card.append(this.button('Меню', onMenu, true));
    this.mount(card);
  }

  /** Attempts of the street of the day, one emoji row each. */
  private grid(rows: string[]): HTMLElement {
    return el('div', 'grid', rows.map(escape).join('<br>'));
  }

  dailyResult(r: DailyResult, onMenu: () => void): void {
    const card = el('div', 'card');
    card.append(
      el('h1', '', escape(r.won ? 'Перешёл!' : 'Улица победила')),
      el('p', 'muted', `${escape(DAILY_NAME)} №${r.number} · ${escape(r.street)}<br>${escape(r.subtitle)}`),
    );
    if (r.won) {
      card.append(el('div', 'stars', [0, 1, 2].map((i) => `<span class="${i < r.stars ? '' : 'off'}">⭐</span>`).join('')));
    }
    card.append(
      this.grid(r.rows),
      el(
        'div',
        'stats',
        `<div><b>${r.won ? r.rows.length : '—'}</b><span>${r.won ? 'с попытки' : 'не перешёл'}</span></div>
         <div><b>${r.streak}</b><span>дней подряд</span></div>
         <div><b>${escape(r.next)}</b><span>до новой улицы</span></div>`,
      ),
      this.shareButton(r.shareText),
      this.button('Меню', onMenu, true),
    );
    this.mount(card);
  }

  win(
    title: string,
    stars: number,
    stats: { accuracy: number; time: number; nearMisses: number },
    hasNext: boolean,
    onNext: () => void,
    onRetry: () => void,
    onMenu: () => void,
    shareText: string,
  ): void {
    const card = el('div', 'card');
    const starsHtml = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">⭐</span>`).join('');
    card.append(
      el('h1', '', escape(title)),
      el('div', 'stars', starsHtml),
      el(
        'div',
        'stats',
        `<div><b>${Math.round(stats.accuracy * 100)}%</b><span>ровных шагов</span></div>
         <div><b>${stats.time.toFixed(1)}с</b><span>время</span></div>
         <div><b>${stats.nearMisses}</b><span>бип-бип</span></div>`,
      ),
    );
    if (hasNext) card.append(this.button('Следующая улица', onNext));
    card.append(this.button('Ещё раз', onRetry, hasNext), this.shareButton(shareText), this.button('Меню', onMenu, true));
    this.mount(card);
  }
}

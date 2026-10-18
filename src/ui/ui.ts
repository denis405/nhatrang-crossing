import type { Level } from '../game/levels';
import type { DeathReason } from '../game/rhythm';
import type { Progress } from '../storage';
import {
  DEATH_JOKES,
  DEATH_TITLES,
  ENDLESS_LOCKED,
  ENDLESS_NAME,
  ENDLESS_SUBTITLE,
  GRANDPA_TIPS,
  HOW_TO,
  pick,
  streetsWord,
  TAGLINE,
  TITLE,
} from '../text/ru';

export interface EndlessEntry {
  open: boolean;
  best: number;
  onPlay: () => void;
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

  setHint(text: string, warn = false): void {
    if (this.hint.textContent !== text) this.hint.textContent = text;
    this.hint.classList.toggle('warn', warn);
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

  private button(label: string, onClick: () => void, secondary = false): HTMLButtonElement {
    const b = el('button', secondary ? 'btn secondary' : 'btn', escape(label)) as HTMLButtonElement;
    b.addEventListener('click', onClick);
    return b;
  }

  menu(onPlay: () => void, onLevels: () => void, endless: EndlessEntry): void {
    const card = el('div', 'card');
    card.append(
      el('h1', '', escape(TITLE)),
      el('p', '', escape(TAGLINE)),
      el('p', 'muted', HOW_TO.map(escape).join('<br>')),
      this.button('Перейти дорогу', onPlay),
    );
    if (endless.open) card.append(this.endlessButton(endless));
    card.append(this.button('Выбрать улицу', onLevels, true));
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
    onRetry: () => void,
    onMenu: () => void,
    run?: EndlessRun,
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
      this.button('Ещё раз', onRetry),
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
    card.append(this.button('Ещё раз', onRetry, hasNext), this.button('Меню', onMenu, true));
    this.mount(card);
  }
}

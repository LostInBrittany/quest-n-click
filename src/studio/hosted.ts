// The hosted Studio's own screens and live state (4.2.1 PR 7, plan §3, §5, P5, P7; the mock-ups the maintainer
// approved on 18 Oct. 2026). Only on the Studio Server (`hosting.hosted`):
//   - before the Studio: the login page, "access not granted" for someone who is not a member, "session suspended"
//     when the identity provider has not confirmed the session for 15 min;
//   - in the header: the exact revision the editors and reads are at, who is here and where, who you are (with the
//     members for an owner, the spans, the logout);
//   - the live stream (`/api/events`): each committed revision, the leases, who is here; after a cut, what was missed
//     is read from the journal (`/api/ops?after=`), so no change goes unseen; a new epoch reloads the page;
//   - the heartbeat (every 30 s) that says where you are and keeps your leases.
import { onRefused, waiting } from './api';
import { apiUrl, loginUrl, studioFetch } from './api-base';
import { membersPanel } from './members';
import { conflictDialog, leaseText, lockedDialog, spansPanel, takeSpan, releaseSpan } from './spans';

/** A request to the server's own routes (`/auth/…`), with the Studio's header. */
const auth = (path: string, init: RequestInit = {}) =>
  fetch(path, {
    ...init,
    headers: { ...(init.headers as object), 'x-studio-request': '1' },
    credentials: 'same-origin',
  });
import { h } from './ui';

export type Role = 'owner' | 'dev' | 'reviewer';
export interface Me {
  user: { id: string; email: string | null; name: string | null };
  role: Role | null;
}
export interface Lease {
  span: string;
  holder: string;
  holderName: string;
  fence: number;
  until: number;
}
export interface Here {
  userId: string;
  name: string;
  where?: string;
  at: number;
}
export interface Revision {
  id: string;
  rev: number;
  author: string;
  paths: string[];
  spans?: string[];
}

/** Who the session is: a member (`me`), someone logged in but not a member (403), nobody (401), or suspended (503). */
export async function whoAmI(): Promise<
  { state: 'member'; me: Me } | { state: 'stranger'; me: Me } | { state: 'out' } | { state: 'suspended' }
> {
  const r = await auth('/auth/me', { cache: 'no-store' }).catch(() => null);
  if (!r || r.status === 401) return { state: 'out' };
  const data = (await r.json().catch(() => ({}))) as Partial<Me> & { suspended?: boolean };
  if (r.status === 503 && data.suspended) return { state: 'suspended' };
  if (!r.ok || !data.user) return { state: 'out' };
  const me = { user: data.user, role: data.role ?? null } as Me;
  return me.role ? { state: 'member', me } : { state: 'stranger', me };
}

/** The display name of someone: their name, else their email, else "someone". */
const nameOf = (u: { name?: string | null; email?: string | null }) => u.name || u.email || 'someone';

/** A colour per person (stable across sessions), from the night palette. */
const COLOURS = ['#ffd84d', '#7fb2ff', '#c79bff', '#6fdc8c', '#ff9f6b', '#5fd4d4', '#ff7fb2'];
function colourOf(id: string): string {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return COLOURS[n % COLOURS.length]!;
}

/** The page before the Studio: its art, a sentence, a button, the facts. */
function gatePage(...kids: (Node | null)[]): HTMLElement {
  return h(
    'div',
    { class: 'gate' },
    h(
      'div',
      { class: 'gate-card' },
      h(
        'div',
        { class: 'gate-brand' },
        h('img', { src: '/icons/icon-192.png', alt: '', width: '40', height: '40' }),
        h('span', null, 'web-scumm Studio'),
      ),
      ...kids,
    ),
  );
}

/** Nobody is logged in: the provider's login, then back here. */
async function loginScreen(): Promise<HTMLElement> {
  const cli = (await auth('/auth/cli')
    .then((r) => r.json())
    .catch(() => ({}))) as { issuer?: string };
  const provider = cli.issuer ? new URL(cli.issuer).host : '';
  return gatePage(
    h('h1', null, 'Log in to work on the game'),
    h(
      'p',
      null,
      "Access goes through your team's identity provider. Your rights on this project are given by an owner of the Studio.",
    ),
    h('a', { class: 'gate-go', href: loginUrl() }, 'Log in'),
    h(
      'ul',
      { class: 'gate-facts' },
      provider ? h('li', null, `Provider: ${provider} · OpenID Connect`) : null,
      h('li', null, 'The game runs on another origin, apart from your session.'),
    ),
  );
}

/** Logged in, but not a member: nothing of the game is shown. */
function strangerScreen(me: Me): HTMLElement {
  return gatePage(
    h('h1', null, 'Access not granted'),
    h(
      'p',
      null,
      'You are logged in as ',
      h('strong', null, me.user.email ?? nameOf(me.user)),
      ', but you are not a member of this project. No data of the game is shown.',
    ),
    h('p', { class: 'muted' }, 'Ask an owner of the project for an invitation.'),
    h('button', { type: 'button', onclick: () => void logout() }, 'Use another account'),
  );
}

/** The provider has not confirmed the session for 15 min: the Studio waits (fail closed). */
function suspendedScreen(): HTMLElement {
  return gatePage(
    h('h1', null, 'Identity provider unreachable'),
    h(
      'p',
      null,
      'Your access could not be checked again for 15 minutes. For safety, the Studio is paused until the next check succeeds.',
    ),
    h('p', { class: 'muted' }, 'Nothing was sent during the pause.'),
    h(
      'div',
      { class: 'gate-actions' },
      h('button', { type: 'button', class: 'primary', onclick: () => location.reload() }, 'Try again now'),
      h('a', { class: 'gate-alt', href: loginUrl() }, 'Log in again'),
    ),
  );
}

/** Logs out of the Studio, then of the provider. */
async function logout(): Promise<void> {
  const r = await auth('/auth/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }).catch(() => null);
  const data = (await r?.json().catch(() => ({}))) as { redirect?: string } | undefined;
  location.assign(data?.redirect ?? '/');
}

/** What the live stream tells, kept: the revision, the leases, who is here, and whether the stream is up. */
export class Live {
  epoch = '';
  revision = 0;
  leases: Lease[] = [];
  here: Here[] = [];
  up = false;
  private es?: EventSource;
  private seq = -1;
  private listeners = new Set<() => void>();

  constructor(
    private o: {
      /** Each committed revision, once, in order (also those read back from the journal after a cut). */
      revision: (r: Revision) => void;
    },
  ) {}

  /** Called after every change of what is kept. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private changed() {
    for (const fn of this.listeners) fn();
  }

  start(url: string) {
    const es = new EventSource(url);
    this.es = es;
    es.onerror = () => {
      this.up = false;
      this.changed();
    };
    es.addEventListener('hello', (m) => void this.hello(JSON.parse((m as MessageEvent).data)));
    es.addEventListener('revision', (m) => this.revisionEvent(JSON.parse((m as MessageEvent).data) as Revision));
    es.addEventListener('leases', (m) => {
      const d = JSON.parse((m as MessageEvent).data) as { seq: number; leases: Lease[] };
      if (d.seq <= this.seq) return;
      this.seq = d.seq;
      this.leases = d.leases;
      this.changed();
    });
    es.addEventListener('presence', (m) => {
      this.here = (JSON.parse((m as MessageEvent).data) as { here: Here[] }).here;
      this.changed();
    });
  }

  private async hello(d: { epoch: string; revision: number; leases: Lease[]; seq: number; here: Here[] }) {
    const missed = this.epoch === d.epoch && d.revision > this.revision;
    if (this.epoch && this.epoch !== d.epoch) {
      // The game was imported or restored again: what this page holds belongs to another history.
      location.reload();
      return;
    }
    const from = this.revision;
    this.epoch = d.epoch;
    this.leases = d.leases;
    this.seq = d.seq;
    this.here = d.here;
    this.up = true;
    if (!from) this.revision = d.revision;
    else if (missed) await this.catchUp(from);
    this.changed();
  }

  private revisionEvent(r: Revision) {
    // At least once, in order: a revision already seen is not told again.
    if (r.rev <= this.revision) return;
    this.revision = r.rev;
    this.o.revision(r);
    this.changed();
  }

  /** What was committed during a cut, from the journal: the stream is not the source, the journal is. */
  private async catchUp(after: number) {
    let cursor = after;
    for (;;) {
      const r = await studioFetch(`ops?after=${cursor}&epoch=${encodeURIComponent(this.epoch)}`, { cache: 'no-store' });
      if (r.status === 409) return location.reload();
      if (!r.ok) return;
      const d = (await r.json()) as {
        ops: { id: string; rev: number; author: string; paths: string[] }[];
        next: number;
        revision: number;
      };
      for (const op of d.ops) this.revisionEvent(op);
      if (!d.ops.length || d.next >= d.revision) {
        this.revision = Math.max(this.revision, d.revision);
        return;
      }
      cursor = d.next;
    }
  }

  /** Who is here, from the heartbeat's answer. */
  setHere(here: Here[]) {
    this.here = here;
    this.changed();
  }

  stop() {
    this.es?.close();
  }
}

/**
 * The header's part on a hosted Studio: the exact revision (green while the stream is up), who is here and where, who
 * you are with the spans, the members (owner) and the logout.
 */
function hostedBar(o: { live: Live; me: Me; spans: () => void; members: () => void }): HTMLElement {
  const rev = h('span', { class: 'rev', title: 'The exact revision the editors and the reads are at' });
  const here = h('span', { class: 'here', 'aria-label': 'Who is here' });
  const draw = () => {
    rev.classList.toggle('up', o.live.up);
    rev.replaceChildren(
      h('span', { class: 'dot', 'aria-hidden': 'true' }),
      'revision ',
      h('strong', null, String(o.live.revision)),
      h('span', { class: 'epoch' }, ` · epoch ${o.live.epoch.slice(0, 4)}`),
      h('span', { class: 'sr-only' }, o.live.up ? '' : ' (reconnecting)'),
    );
    here.replaceChildren(
      ...o.live.here.map((x) =>
        h(
          'span',
          {
            class: 'avatar',
            style: { background: colourOf(x.userId) },
            title: `${x.userId === o.me.user.id ? `${x.name} (you)` : x.name}${x.where ? ` · ${x.where}` : ''}`,
          },
          (x.name.trim()[0] ?? '?').toUpperCase(),
        ),
      ),
    );
  };
  o.live.onChange(draw);
  draw();
  const menu = h(
    'details',
    { class: 'who' },
    h('summary', null, `${nameOf(o.me.user)} · ${o.me.role} ▾`),
    h(
      'div',
      { class: 'menu' },
      h('span', { class: 'muted small' }, o.me.user.email ?? ''),
      h('button', { type: 'button', onclick: () => ((menu.open = false), o.spans()) }, 'Spans…'),
      o.me.role === 'owner'
        ? h('button', { type: 'button', onclick: () => ((menu.open = false), o.members()) }, 'Members…')
        : null,
      h('button', { type: 'button', onclick: () => void logout() }, 'Log out'),
    ),
  );
  return h('div', { class: 'hosted-bar' }, rev, here, menu);
}

/** Every 30 s while the page is open: where you are (a tab, a room), which also renews your leases. */
function heartbeat(where: () => string, live: Live): void {
  const beat = () =>
    void studioFetch('presence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ where: where() }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { here?: Here[] } | null) => {
        if (d?.here) live.setHere(d.here);
      })
      .catch(() => undefined);
  beat();
  setInterval(beat, 30_000);
}

/** The page shown instead of the Studio when the session is not a member's. */
export async function gateScreen(
  who: Exclude<Awaited<ReturnType<typeof whoAmI>>, { state: 'member' }>,
): Promise<HTMLElement> {
  if (who.state === 'stranger') return strangerScreen(who.me);
  if (who.state === 'suspended') return suspendedScreen();
  return loginScreen();
}

/**
 * Everything a hosted Studio adds to the page: the bar (revision, who is here, you), the line that says when the stream
 * is cut or writes are waiting, the lease of the room shown, the live preview's label, the heartbeat, and the dialogs
 * of a refused write. `changed`: a file a committed revision touched, with its author.
 */
export function hostedStudio(o: {
  me: Me;
  rooms: { id: string; name: string }[];
  /** The room shown in the Rooms tab, and the tab shown: where you are, for the others. */
  room: () => string;
  where: () => string;
  changed: (file: string, author: string) => void;
}): {
  bar: HTMLElement;
  banner: HTMLElement;
  roomChip: HTMLElement;
  /** Draws the room chip again (another room shown). */
  roomShown: () => void;
  previewLabel: (frame: HTMLIFrameElement) => HTMLElement;
} {
  const live = new Live({ revision: (r) => r.paths.forEach((f) => o.changed(f, r.author)) });
  live.start(apiUrl('events'));
  heartbeat(o.where, live);
  onRefused((r) => {
    if (r.status === 423) lockedDialog(r.data, r.draft, { live, me: o.me, retry: r.retry });
    else conflictDialog(String(r.data.error ?? 'The file changed since you read it.'), r.draft, r.retry);
  });
  const banner = h('div', { class: 'pending', role: 'status', hidden: true });
  const drawBanner = () => {
    const cut = !live.up && live.revision > 0;
    banner.hidden = !cut && waiting.count === 0;
    banner.classList.toggle('cut', cut);
    banner.textContent = cut
      ? `Reconnecting… last revision seen: ${live.revision}. Nothing is lost: what changed meanwhile is read from the journal.`
      : `${waiting.count} change${waiting.count > 1 ? 's' : ''} waiting, sent again with the same id: each applies once.`;
  };
  live.onChange(drawBanner);
  waiting.changed = drawBanner;
  // The room shown: who holds it, and taking or letting it go.
  const roomChip = h('span', { class: 'lease-chip' });
  const drawChip = () => {
    const span = `room:${o.room()}`;
    const l = live.leases.find((x) => x.span === span || x.span === '*');
    const mine = l?.holder === o.me.user.id;
    roomChip.className = `lease-chip${mine ? ' mine' : l ? ' held' : ''}`;
    roomChip.replaceChildren(
      `${o.room()}: ${leaseText(l, o.me)}`,
      o.me.role === 'reviewer' || (l && !mine)
        ? ''
        : h(
            'button',
            {
              type: 'button',
              class: 'link',
              onclick: () => void (mine ? releaseSpan(span) : takeSpan(span)).catch(() => undefined),
            },
            mine ? ' Release' : ' Take',
          ),
    );
  };
  live.onChange(drawChip);
  drawChip();
  const bar = hostedBar({
    live,
    me: o.me,
    spans: () => spansPanel(o.rooms, live, o.me),
    members: () => void membersPanel(o.me, live),
  });
  /** "live preview · revision N", and the head when it has moved on since the frame was loaded. */
  const previewLabel = (frame: HTMLIFrameElement) => {
    const label = h('span', {
      class: 'preview-label',
      title: 'The game as it was when the view was loaded; per-revision previews come in 4.2.2',
    });
    let at = 0;
    const draw = () => {
      label.textContent = at
        ? `live preview, not frozen · loaded at revision ${at}${live.revision > at ? ` · head ${live.revision}: reload to see it` : ''}`
        : 'live preview, not frozen';
    };
    frame.addEventListener('load', () => {
      at = live.revision;
      draw();
    });
    live.onChange(draw);
    draw();
    return label;
  };
  return { bar, banner, roomChip, roomShown: drawChip, previewLabel };
}

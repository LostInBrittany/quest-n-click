// The map: places, travel, regions, and the travel animation.
// Part of the player (4.1.0 "Clarity"): App's methods of the same name forward here.
import { check } from '../core/cond';
import { must } from '../core/must';
import type { GameState, Id, MapDef, PlaceDef } from '../core/types';
import { roving } from './a11y';
import { el, esc, sleep } from './app-shared';
import type { App } from './app';

// ---------------------------------------------------------------- map
/**
 * The regions the map offers (4.6.1, #421): a region is open once a place in it, or in a region below it, is unlocked.
 * The regions in `keep` (the one the map opens on, and `map.start`) are open too, so the player can always zoom back to
 * where they stand. A child region that is not open has no zoom button and no frame on its parent's image.
 */
export function openRegions(map: MapDef, unlocked: readonly Id[], keep: readonly (Id | undefined)[] = []): Set<Id> {
  const open = new Set<Id>();
  const mark = (from: Id | undefined) => {
    // Up the parents: a region holding an open one is open. Stopping at a region already open also ends a loop of parents.
    for (let r = from; r !== undefined && !open.has(r); r = map.regions[r]?.parent) {
      if (!map.regions[r]) return;
      open.add(r);
    }
  };
  for (const [id, p] of Object.entries(map.places)) if (unlocked.includes(id)) mark(p.region);
  for (const r of keep) mark(r);
  return open;
}

export async function openMap(app: App, state: GameState): Promise<Id | null> {
  const map = app.game.map;
  if (!map) return null;
  const here = Object.entries(map.places).find(([, p]) => p.room === state.room)?.[0];
  let region = here ? must(map.places[here], `place ${here}`).region : map.start;
  const open = openRegions(map, state.unlocked, [region, map.start]);
  if (map.music) app.audio.push(map.music);
  const ov = el('div', 'overlay mapview');
  ov.style.background = '#000';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', app.game.ui.mapTitle);
  app.scene.append(ov);
  app.verbsEl.hidden = true;
  app.invEl.hidden = true;
  app.invNav.hidden = true;
  // The place list is a prompt like a `choice`: `choosing` keeps refresh() from dimming the side column (busy) while
  // the player is expected to tap it. Without it, any refresh during the map (a script tick, a save) made the list
  // untappable; CI runners hit it, phones can too.
  app.choosing = true;
  app.side.classList.remove('off');
  const list = el('div', 'choices');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', app.game.ui.mapTitle);
  roving(list, '.choice');
  app.side.insertBefore(list, app.toolsEl);
  const places = () =>
    Object.entries(map.places).filter(([id, p]) => state.unlocked.includes(id) && p.region === region);
  const icons = app.game.skin.icons;
  const pin = map.vehicles?.pin ?? icons.pin,
    newsImg = map.vehicles?.news ?? icons.news;
  const cleanup = () => {
    app.choosing = false;
    ov.remove();
    list.remove();
    app.verbsEl.hidden = false;
    app.invEl.hidden = false;
    app.renderInv();
    if (map.music) app.audio.pop();
  };

  return new Promise<Id | null>((resolve) => {
    let layer: HTMLElement = ov;
    let svg: SVGSVGElement;
    const draw = () => {
      ov.innerHTML = '';
      list.innerHTML = '';
      const R = must(map.regions[region], `map region ${region}`);
      const parent = R.parent ? map.regions[R.parent] : null;
      if (parent) {
        const bg = el('img', 'bg') as HTMLImageElement;
        bg.src = app.bank.img(parent.image);
        Object.assign(bg.style, {
          position: 'absolute',
          inset: '0',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'blur(3px) brightness(.55)',
        });
        ov.append(bg);
        const [w, h] = app.bank.size(R.image);
        layer = el('div');
        Object.assign(layer.style, {
          position: 'absolute',
          top: '2.5%',
          bottom: '2.5%',
          left: '50%',
          transform: 'translateX(-50%)',
          aspectRatio: `${w}/${h}`,
        });
        const im = el('img') as HTMLImageElement;
        im.src = app.bank.img(R.image);
        Object.assign(im.style, {
          width: '100%',
          height: '100%',
          display: 'block',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.6))',
        });
        layer.append(im);
        ov.append(layer);
      } else {
        layer = el('div');
        Object.assign(layer.style, { position: 'absolute', inset: '0' });
        const im = el('img') as HTMLImageElement;
        im.src = app.bank.img(R.image);
        Object.assign(im.style, { width: '100%', height: '100%', objectFit: 'cover' });
        layer.append(im);
        ov.append(layer);
      }
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      Object.assign(svg.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      });
      layer.append(svg);
      const size = parent ? 7.5 : 6;
      // `pins: 'hidden'` (4.6.1, #428): the map's own drawing shows the places. Each place keeps its button, the size of
      // a face, centred on its `pos`, but draws nothing (no face, no needle); its "!" still shows there.
      const bare = map.pins === 'hidden';
      list.append(el('div', 'who', `<img src="${app.bank.img(icons.map)}" alt="">${esc(app.game.ui.mapTitle)}`));
      // One pin per place, except the places that join another's pin (4.4.0): their faces sit on it, each face a way
      // to its own place. Several faces (a portrait list, or joined places) sit side by side, overlapping a little: the
      // pin widens, each face keeps its size.
      const groups = new Map<Id, [Id, PlaceDef][]>();
      for (const [id, p] of places()) {
        const host = p.joins ?? id;
        groups.set(host, [...(groups.get(host) ?? []), [id, p]]);
      }
      for (const [host, members] of groups) {
        const at = (map.places[host] ?? members[0]![1]).pos;
        // Bare pins: one empty spot per place (a joined place gets its own beside the host's).
        const faces = bare
          ? members.map(([id, p]) => ({ id, p, img: '' }))
          : members.flatMap(([id, p]) =>
              (p.portrait === undefined ? (pin ? [pin] : []) : ([] as Id[]).concat(p.portrait)).map((img) => ({
                id,
                p,
                img,
              })),
            );
        const face = (img: Id, extra = '') =>
          bare ? `<span class="face"${extra}></span>` : `<img class="face" src="${app.bank.img(img)}" alt=""${extra}>`;
        const n = Math.max(1, faces.length);
        const fw = 100 / (1 + 0.6 * (n - 1));
        const style = (i: number) =>
          n > 1
            ? ` style="width:${fw}%;${i ? `margin-left:${-0.4 * fw}%;` : ''}position:relative;z-index:${n - i}"`
            : '';
        const needle =
          pin && !bare
            ? `<img class="needle" src="${app.bank.img(pin)}" alt=""${n > 1 ? ` style="width:${0.4 * fw}%"` : ''}>`
            : '';
        const isHere = members.some(([id]) => id === here);
        const news = members.some(([, p]) => (p.news ? check(p.news, state) : false));
        const cls = 'pin' + (bare ? ' bare' : '') + (isHere ? ' here' : '');
        let b: HTMLElement;
        if (members.length === 1) {
          // One place: the pin is its button, as before.
          const [id, p] = members[0]!;
          b = el('button', cls);
          b.setAttribute('aria-label', p.name);
          const faceHtml = faces.map((f, i) => face(f.img, style(i))).join('');
          b.innerHTML = (n > 1 ? `<span class="faces" style="display:flex">${faceHtml}</span>` : faceHtml) + needle;
          b.onclick = () => void go(id);
        } else {
          // Several places: one button per face, each named after its place.
          b = el('div', cls);
          const row = el('span', 'faces');
          row.style.display = 'flex';
          faces.forEach((f, i) => {
            const fb = el('button', 'facebtn' + (f.id === here ? ' here' : ''));
            fb.setAttribute('aria-label', f.p.name);
            fb.innerHTML = face(f.img);
            Object.assign(fb.style, {
              width: `${fw}%`,
              marginLeft: i ? `${-0.4 * fw}%` : '0',
              position: 'relative',
              zIndex: `${n - i}`,
            });
            fb.onclick = () => void go(f.id);
            row.append(fb);
          });
          b.append(row);
          b.insertAdjacentHTML('beforeend', needle);
        }
        Object.assign(b.style, { left: `${at[0]}%`, top: `${at[1]}%`, width: `${size * 1.1 * (1 + 0.6 * (n - 1))}%` });
        if (news && newsImg)
          b.insertAdjacentHTML('beforeend', `<img class="news" src="${app.bank.img(newsImg)}" alt="">`);
        layer.append(b);
      }
      for (const [id, p] of places()) {
        const news = p.news ? check(p.news, state) : false;
        const li = el('button', 'choice', `• ${esc(p.name)}${news ? ' <span style="color:#ffd84d">!</span>' : ''}`);
        li.onclick = () => void go(id);
        list.append(li);
      }
      // The open child regions (4.6.1, #421): their frames on this image, and the zoom button to the first one. A child
      // region with no open place shows neither.
      const children = Object.entries(map.regions).filter(([id, r]) => r.parent === region && open.has(id));
      for (const [id, r] of children) {
        if (!r.frame) continue;
        const [x, y, w, h] = r.frame;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'region-frame');
        rect.dataset.region = id;
        for (const [k, v] of [
          ['x', x],
          ['y', y],
          ['width', w],
          ['height', h],
        ] as const)
          rect.setAttribute(k, `${v}`);
        Object.assign(rect.style, {
          fill: 'none',
          stroke: '#ffd84d',
          strokeWidth: '2',
          vectorEffect: 'non-scaling-stroke',
        });
        svg.append(rect);
      }
      // The zoom buttons, bottom right: up to the parent region, and down to the first open child. A region in the
      // middle (a child that has an open child itself, 4.6.1, #421) has both, the way down above the way up.
      const zooms: [Id, string][] = [];
      if (children[0]) zooms.push([children[0][0], app.game.ui.zoomIn + ' ⤡']);
      if (R.parent) zooms.push([R.parent, app.game.ui.world + ' ⤢']);
      if (zooms.length) {
        const box = el('div', 'mapzoom');
        Object.assign(box.style, {
          position: 'absolute',
          right: '2%',
          bottom: '3%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '6px',
          zIndex: '20',
        });
        for (const [to, label] of zooms) {
          const sw = el('button', 'bigbtn', esc(label));
          Object.assign(sw.style, { color: '#ffd84d', fontSize: `${Math.max(8, Math.round(app.sw * 0.016))}px` });
          sw.onclick = () => {
            region = to;
            draw();
          };
          box.append(sw);
        }
        ov.append(box);
      }
      const back = el('button', 'choice gl', '• ' + esc(app.game.ui.mapBack));
      back.onclick = () => {
        cleanup();
        resolve(null);
      };
      list.append(back);
      queueMicrotask(() => list.querySelector<HTMLElement>('.choice')?.focus({ preventScroll: true }));
    };
    const go = async (id: Id) => {
      if (id === here) {
        cleanup();
        resolve(null);
        return;
      }
      const p = must(map.places[id], `place ${id}`);
      const herePlace = here ? must(map.places[here], `place ${here}`) : undefined;
      // Two places of the same pin (4.4.0): no journey to draw.
      if (here && (herePlace?.joins ?? here) === (p.joins ?? id)) {
        cleanup();
        resolve(id);
        return;
      }
      const posOf = (q: PlaceDef) => (q.joins ? (map.places[q.joins]?.pos ?? q.pos) : q.pos);
      const to = posOf(p);
      const from = herePlace && herePlace.region === region ? posOf(herePlace) : null;
      const origin = from ?? [50, 50];
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mx = (origin[0] + to[0]) / 2,
        my = Math.min(origin[1], to[1]) - 10;
      path.setAttribute('d', `M${origin[0]} ${origin[1] - 2} Q${mx} ${my} ${to[0]} ${to[1] - 2}`);
      Object.assign(path.style, {
        fill: 'none',
        stroke: '#e02828',
        strokeWidth: '3',
        vectorEffect: 'non-scaling-stroke',
      });
      svg.append(path);
      const L = path.getTotalLength();
      path.style.strokeDasharray = `${L}`;
      path.style.strokeDashoffset = `${L}`;
      path.style.transition = 'stroke-dashoffset 1.6s linear';
      requestAnimationFrame(() => {
        path.style.strokeDashoffset = '0';
      });
      const veh = el('img') as HTMLImageElement;
      // On foot (4.6.1, #422): the hero the player plays now (their variant, recoloured as the room paints them), with
      // their walk frames. A hero with no walk frames travels by car.
      const heroId = app.engine.heroId();
      const hero = p.vehicle === 'walk' ? app.engine.character(heroId) : undefined;
      const walking = !!hero?.sprites?.walk?.length;
      const vehImg = p.vehicle === 'plane' ? (map.vehicles?.plane ?? icons.plane) : (map.vehicles?.car ?? icons.car);
      if (!walking && vehImg) veh.src = app.bank.img(vehImg);
      Object.assign(veh.style, {
        position: 'absolute',
        ...(walking
          ? { height: `${MAP_WALKER_HEIGHT}%`, width: 'auto' }
          : { width: p.vehicle === 'plane' ? '6%' : '4%' }),
        transform: walking ? 'translate(-50%,-100%)' : 'translate(-50%,-50%)',
        zIndex: '15',
        pointerEvents: 'none',
      });
      if (walking || vehImg) layer.append(veh);
      const planeSfx = app.game.skin.sounds?.plane;
      if (p.vehicle === 'plane' && planeSfx) app.audio.sfx(planeSfx);
      let flip = to[0] < origin[0];
      const t0 = performance.now();
      await new Promise<void>((r) => {
        const f = (n: number) => {
          const k = Math.min(1, (n - t0) / 1600);
          const pt = path.getPointAtLength(L * k);
          veh.style.left = `${pt.x}%`;
          veh.style.top = `${pt.y}%`;
          if (walking) {
            // The way of travel on screen: the route's tangent, in pixels of the map.
            const a = path.getPointAtLength(Math.max(0, L * k - 1)),
              b = path.getPointAtLength(Math.min(L, L * k + 1));
            const s = mapWalkStep(
              hero?.sprites ?? {},
              ((b.x - a.x) * layer.clientWidth) / 100,
              ((b.y - a.y) * layer.clientHeight) / 100,
              n - t0,
              hero?.fps ?? 8,
              flip,
            );
            flip = s.flip;
            if (s.img) {
              const url = app.view.characterImage(heroId, s.img);
              if (veh.getAttribute('src') !== url) veh.src = url;
            }
            veh.style.transform = `translate(-50%,-100%)${flip ? ' scaleX(-1)' : ''}`;
          }
          if (k < 1) requestAnimationFrame(f);
          else r();
        };
        requestAnimationFrame(f);
      });
      await sleep(300);
      cleanup();
      resolve(id);
    };
    draw();
  });
}

/** The walker's height on the map (4.6.1, #422), in % of the map's height: about a pin's size. */
const MAP_WALKER_HEIGHT = 12;

/**
 * The hero's image at one moment of a walk on the map (4.6.1, #422), as the room's walker chooses it: `walk_back` going
 * mostly up and `walk_front` going mostly down when the sheet has them, else `walk`, flipped when the way goes left (a
 * nearly vertical way keeps the side it had). `dx`, `dy`: the way of travel in pixels; `ms`: time since the start.
 */
export function mapWalkStep(
  sprites: Readonly<Record<string, Id[]>>,
  dx: number,
  dy: number,
  ms: number,
  fps: number,
  flip: boolean,
): { img: Id | undefined; flip: boolean } {
  const vertical = Math.abs(dy) > Math.abs(dx) * 1.5;
  const pose =
    vertical && dy < 0 && sprites.walk_back?.length
      ? 'walk_back'
      : vertical && dy > 0 && sprites.walk_front?.length
        ? 'walk_front'
        : 'walk';
  const frames = sprites[pose] ?? [];
  const i = Math.floor((Math.max(0, ms) * (fps || 8)) / 1000) % Math.max(1, frames.length);
  return { img: frames[i], flip: Math.abs(dx) > 0.5 ? dx < 0 : flip };
}

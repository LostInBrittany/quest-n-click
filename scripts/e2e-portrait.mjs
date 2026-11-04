// npm run e2e:portrait -- <url> [--browser=chromium|webkit] [--json] (4.6.0): the portrait layout of a phone held
// upright (`skin.portrait`), measured on the sample game in a touch browser (isMobile, DPR 2).
//
// 1. The game as it ships (the option off): the "rotate your phone" overlay covers an upright phone.
// 2. The option switched on in the running page (`__game.game.skin.portrait = true`, then a resize: `layout()` reads it
//    live), at common upright sizes, with and without safe areas (a notch and a home indicator, simulated as #app's
//    padding, which is what `env(safe-area-inset-*)` gives it on a phone): the scene at full width and 16:10, the panel
//    below with every verb, slot and tool inside the screen and the safe areas, at 44 px or more; the title screen, a
//    conversation, the map, the pause menu.
// 3. Turning the phone mid-game: landscape, then upright again, the room and the bag kept.
// 4. Landscape and desktop with the option on: the same measurements as the option off.
// Screenshots land in E2E_OUT (default /tmp/e2e-portrait). With --json, the measurements are printed as JSON last.
import { mkdirSync } from 'node:fs';
import { chromium, webkit } from 'playwright';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:4173/';
const engine = args.find((a) => a.startsWith('--browser='))?.split('=')[1] === 'webkit' ? webkit : chromium;
const out = process.env.E2E_OUT ?? '/tmp/e2e-portrait';
mkdirSync(out, { recursive: true });
let failed = 0;
const say = (ok, msg) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✔' : '✖'} ${msg}`);
};
const rows = [];

const SIZES = [
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [430, 932],
];
// Simulated safe areas: a notch on top, a home indicator at the bottom (an iPhone held upright).
const SAFE = { top: 47, right: 0, bottom: 34, left: 0 };

const browser = await engine.launch();

async function open(width, height, { fine = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    hasTouch: !fine,
    isMobile: !fine,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__game?.engine, null, { timeout: 20000 });
  await page.waitForSelector('.overlay .bigbtn', { timeout: 20000 });
  return { ctx, page, errors };
}
const setSafe = (page, s) =>
  page.evaluate((s) => {
    const a = document.getElementById('app');
    a.style.padding = s ? `${s.top}px ${s.right}px ${s.bottom}px ${s.left}px` : '';
    window.dispatchEvent(new Event('resize'));
  }, s);
const optIn = (page, on) =>
  page.evaluate((on) => {
    window.__game.game.skin.portrait = on;
    window.dispatchEvent(new Event('resize'));
  }, on);
const idle = (page) =>
  page
    .waitForFunction(
      () => {
        const g = window.__game;
        // The intro: its cutscene skipped, its lines dismissed, as a hurried player does.
        document.querySelector('.scene .skip')?.click();
        // The intro's question (a `choice`): its first answer.
        if (g.engine.busy) document.querySelector('.side .choices .choice')?.click();
        if (document.querySelector('.speech, .narr')) {
          g.endSpeech?.();
          return false;
        }
        // Still for a second (the intro starts a moment after New game), the room's image drawn.
        const still = !!g.engine.state && !g.engine.busy && !!document.querySelector('.scene img.bg')?.complete;
        window.__still = still ? (window.__still ?? 0) + 1 : 0;
        return window.__still >= 4;
      },
      null,
      { timeout: 60000, polling: 300 },
    )
    .catch(() => {});

/** Every box that matters, in CSS pixels. */
const measure = (page) =>
  page.evaluate(() => {
    const r = (e) => {
      if (!e || e.hidden || getComputedStyle(e).display === 'none') return null;
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height) return null; // inside a hidden row (the bag's page buttons)
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const all = (sel) => [...document.querySelectorAll(sel)].map(r).filter(Boolean);
    const app = document.getElementById('app');
    const cs = getComputedStyle(app);
    const g = document.querySelector('.game');
    return {
      vw: innerWidth,
      vh: innerHeight,
      pad: {
        top: parseFloat(cs.paddingTop),
        bottom: parseFloat(cs.paddingBottom),
        left: parseFloat(cs.paddingLeft),
        right: parseFloat(cs.paddingRight),
      },
      portrait: g.classList.contains('portrait'),
      desk: g.classList.contains('desk'),
      rotate: r(document.querySelector('.rotate')),
      scene: r(document.querySelector('.scene')),
      side: r(document.querySelector('.side')),
      sideScroll: (() => {
        const s = document.querySelector('.side');
        return s.scrollHeight - s.clientHeight;
      })(),
      sbar: r(document.querySelector('.sbar')),
      verbs: all('.verbs .verb'),
      slots: all('.inv .slot'),
      tools: all('.tools .tool'),
      nav: all('.invnav .tool'),
    };
  });

/** Everything inside the screen, inside the safe areas, nothing under 44 px (verbs, tools) or cut. */
function check(label, m, { touch = true } = {}) {
  const top = m.pad.top,
    bottom = m.vh - m.pad.bottom,
    left = m.pad.left,
    right = m.vw - m.pad.right;
  const inside = (b) => b.y >= top - 0.5 && b.y + b.h <= bottom + 0.5 && b.x >= left - 0.5 && b.x + b.w <= right + 0.5;
  const boxes = [m.scene, m.side, ...m.verbs, ...m.slots, ...m.tools, ...m.nav].filter(Boolean);
  const out = boxes.filter((b) => !inside(b));
  say(
    out.length === 0,
    `${label}: everything inside the screen and its safe areas${out.length ? ` (${JSON.stringify(out[0])} is not)` : ''}`,
  );
  say(m.sideScroll <= 0, `${label}: the panel does not scroll (overflow ${m.sideScroll} px)`);
  if (touch) {
    const small = [...m.verbs, ...m.tools, ...m.nav].filter((b) => b.h < 44);
    const slotSmall = m.slots.filter((b) => b.h < 44 || b.w < 44);
    say(small.length === 0 && slotSmall.length === 0, `${label}: verbs, slots and tools at 44 px or more`);
  }
}

// ------------------------------------------------------------------------------------------------ 1. option off
console.log(`portrait layout (${engine === webkit ? 'WebKit' : 'Chromium'}, ${url}):`);
{
  const { ctx, page } = await open(390, 844);
  const m = await measure(page);
  say(
    !!m.rotate && m.rotate.w === 390 && m.rotate.h === 844,
    'a game without skin.portrait: the rotate overlay covers an upright phone',
  );
  say(!m.portrait, 'a game without skin.portrait: no portrait layout');
  await page.screenshot({ path: `${out}/00-off-rotate.png` });
  await optIn(page, true);
  say(!(await measure(page)).rotate, 'skin.portrait switched on: the overlay is gone');
  await optIn(page, false);
  say(!!(await measure(page)).rotate, 'switched off again: the overlay is back');
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------ 2. option on
let n = 1;
for (const [w, h] of SIZES)
  for (const safe of [null, SAFE]) {
    const tag = `${w}x${h}${safe ? ' safe' : ''}`;
    const { ctx, page, errors } = await open(w, h);
    await optIn(page, true);
    if (safe) await setSafe(page, safe);
    // The title screen at full width, its buttons touch targets.
    const title = await page.evaluate(() =>
      [...document.querySelectorAll('.overlay .bigbtn')].map((b) => {
        const r = b.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    say(
      title.every((b) => b.h >= 44 && b.x >= 0 && b.x + b.w <= w),
      `${tag} title: buttons on the screen, ${title.map((b) => `${Math.round(b.w)}x${Math.round(b.h)}`).join(', ')}`,
    );
    if (w === 390)
      await page.screenshot({
        path: `${out}/${String(n++).padStart(2, '0')}-${w}x${h}${safe ? '-safe' : ''}-title.png`,
      });
    await page.locator('.overlay .bigbtn').first().tap();
    if (w === 390 && !safe) {
      // The intro: a line of speech in the scene, then the sample game's question (a `choice`) in the panel.
      await page.waitForSelector('.scene .speech, .scene .narr', { timeout: 30000 }).catch(() => {});
      const speech = await page.evaluate(() => {
        const s = document.querySelector('.scene .speech, .scene .narr')?.getBoundingClientRect();
        const sc = document.querySelector('.scene').getBoundingClientRect();
        return s ? s.x >= sc.x - 1 && s.x + s.width <= sc.x + sc.width + 1 && s.y >= sc.y - 1 : null;
      });
      say(speech === true, `${tag} intro: a line of speech, inside the scene`);
      await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${w}x${h}-speech.png` });
      await page
        .waitForFunction(
          () => {
            document.querySelector('.scene .skip')?.click();
            if (document.querySelector('.speech, .narr')) window.__game.endSpeech?.();
            return !!document.querySelector('.side .choices .choice');
          },
          null,
          { timeout: 30000, polling: 300 },
        )
        .catch(() => {});
      const choices = await page.evaluate(() =>
        [...document.querySelectorAll('.side .choices .choice')].map((b) => {
          const r = b.getBoundingClientRect();
          return r.height > 0 && r.y >= 0 && r.y + r.height <= innerHeight;
        }),
      );
      say(
        choices.length > 0 && choices.every(Boolean),
        `${tag} intro: ${choices.length} choice(s) in the panel, on the screen`,
      );
      await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${w}x${h}-choices.png` });
    }
    await idle(page);
    const m = await measure(page);
    say(m.portrait && !m.rotate, `${tag}: portrait layout, no overlay`);
    const cw = w - m.pad.left - m.pad.right;
    // Full width, unless the panel would lose its touch targets (a short screen with large safe areas): then narrower,
    // never under 60% of the width, still 16:10.
    const wide = m.scene.w === cw;
    say(
      (wide || (m.scene.w >= Math.round(cw * 0.6) && m.verbs[0].h >= 44)) &&
        Math.abs(m.scene.h - Math.round(m.scene.w / 1.6)) <= 1,
      `${tag}: scene ${m.scene.w}x${m.scene.h} (${wide ? 'full width' : 'narrowed for the panel'}, 16:10)`,
    );
    check(tag, m);
    const toolsBottom = Math.max(...m.tools.map((b) => b.y + b.h));
    rows.push({
      size: tag,
      scene: `${m.scene.w}x${m.scene.h}`,
      panel: m.side.h,
      verb: m.verbs[0]?.h,
      slot: `${m.slots[0]?.w}x${m.slots[0]?.h}`,
      tool: m.tools[0]?.h,
      toolsBottom: `${toolsBottom} / ${m.vh - m.pad.bottom}`,
    });
    await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${w}x${h}${safe ? '-safe' : ''}-room.png` });

    // A full bag: the page buttons show and the panel still fits.
    await page.evaluate(() => {
      const g = window.__game;
      const all = Object.keys(g.game.items);
      const ids = Array.from({ length: 11 }, (_, i) => all[i % all.length]);
      g.presenter.inventory(ids);
    });
    const full = await measure(page);
    rows.at(-1).fullBag = `verb ${full.verbs[0]?.h}, slot ${full.slots[0]?.h}`;
    // The scene keeps its size (nothing jumps when the bag fills up); on a short screen the panel's buttons shrink
    // instead, as the landscape column does (#227), never under the floor and never out of the screen.
    check(`${tag} full bag`, full, { touch: false });
    const floor = [...full.verbs, ...full.slots].every((b) => b.h >= 24);
    say(
      full.scene.w === m.scene.w && full.scene.h === m.scene.h && floor,
      `${tag} full bag: the scene keeps its size, verbs and slots ${full.verbs[0]?.h} / ${full.slots[0]?.h} px`,
    );
    say(full.nav.length === 2, `${tag} full bag: the page buttons show`);
    await page.evaluate(() => window.__game.presenter.inventory(window.__game.engine.state.inventory));

    // The pause menu over the whole screen, its rows touch targets, inside the screen.
    await page.locator('.tools .tool').nth(-2).tap();
    await page.waitForSelector('.dim .menu', { timeout: 5000 });
    const menu = await page.evaluate(() => {
      const d = document.querySelector('.dim').getBoundingClientRect();
      const mm = document.querySelector('.dim .menu').getBoundingClientRect();
      const rowsH = [...document.querySelectorAll('.dim .menu button')].map((b) => b.getBoundingClientRect().height);
      return {
        dim: [d.width, d.height],
        menu: [mm.y, mm.y + mm.height, mm.x, mm.x + mm.width],
        minRow: Math.min(...rowsH),
      };
    });
    say(
      menu.dim[0] === w &&
        menu.dim[1] === h &&
        menu.menu[0] >= m.pad.top &&
        menu.menu[1] <= h - m.pad.bottom &&
        menu.minRow >= 44,
      `${tag} pause menu: full screen, inside the safe areas, rows ${Math.round(menu.minRow)} px or more ${JSON.stringify(menu)}`,
    );
    if (w === 390)
      await page.screenshot({
        path: `${out}/${String(n++).padStart(2, '0')}-${w}x${h}${safe ? '-safe' : ''}-pause.png`,
      });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.dim'), null, { timeout: 5000 }).catch(() => {});

    if (w === 390 && !safe) {
      // The map: the image in the scene, the places in the panel.
      if (await page.evaluate(() => !!window.__game.game.map)) {
        await page.locator('.tools .tool').nth(-3).tap();
        await page.waitForSelector('.side .choices .choice', { timeout: 5000 }).catch(() => {});
        const map = await page.evaluate(() => ({
          ov: !!document.querySelector('.scene .overlay.mapview'),
          list: [...document.querySelectorAll('.side .choices .choice')].map((b) => b.getBoundingClientRect().height),
        }));
        say(
          map.ov && map.list.length > 0,
          `${tag} map: the map in the scene, ${map.list.length} place(s) in the panel`,
        );
        await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${w}x${h}-map.png` });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.mapview'), null, { timeout: 5000 }).catch(() => {});
        await idle(page);
      }
      // 3. Turning the phone: landscape and back, the state kept.
      const before = await page.evaluate(() => ({
        room: window.__game.engine.state.room,
        inv: window.__game.engine.state.inventory.join(),
      }));
      await page.setViewportSize({ width: h, height: w });
      await page.waitForTimeout(300);
      const land = await measure(page);
      say(
        !land.portrait &&
          land.side.w <= 300 &&
          land.sbar.y >= land.scene.y &&
          land.sbar.y < land.scene.y + land.scene.h,
        `turned to landscape: the right-hand column (${land.side.w} px), the sentence back in the scene`,
      );
      check('turned to landscape', land, { touch: false });
      await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${h}x${w}-turned.png` });
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(300);
      const back = await measure(page);
      say(back.portrait, 'turned upright again: the portrait layout');
      check('turned upright again', back);
      const after = await page.evaluate(() => ({
        room: window.__game.engine.state.room,
        inv: window.__game.engine.state.inventory.join(),
      }));
      say(
        JSON.stringify(after) === JSON.stringify(before),
        `the room and the bag kept across both turns (${after.room})`,
      );
    }
    say(errors.length === 0, `${tag}: no page error${errors.length ? ` (${errors[0]})` : ''}`);
    await ctx.close();
  }

// ------------------------------------------------------------------------------------------------ 4. landscape, desktop
// The option changes nothing there: the same boxes with it on and off.
for (const [w, h, fine] of [
  [844, 390],
  [932, 430],
  [568, 320],
  [844, 320],
  [1280, 800, true],
]) {
  const res = [];
  for (const on of [false, true]) {
    const { ctx, page } = await open(w, h, { fine });
    await optIn(page, on);
    await page.locator('.overlay .bigbtn').first().click();
    await idle(page);
    const m = await measure(page);
    res.push(JSON.stringify({ scene: m.scene, side: m.side, verbs: m.verbs, slots: m.slots, tools: m.tools }));
    await ctx.close();
  }
  say(res[0] === res[1], `${w}x${h}${fine ? ' desktop' : ' landscape'}: identical with the option on and off`);
}

await browser.close();
console.table(rows);
if (args.includes('--json')) console.log(JSON.stringify(rows));
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

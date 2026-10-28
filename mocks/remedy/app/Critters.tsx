'use client';

import { useEffect, useRef } from 'react';

const SIZE = 48;
const BODY_H = SIZE + 8;
const FEET_Y = 54; // y of the soles inside the SVG
const HAMMER_REACH = 46; // x of the hammer head from his left edge when facing right
const SCARE_DISTANCE = 130;
const WARY_DISTANCE = 260;
const WALK_SPEED = 1.2;
const BUILD_WALK_SPEED = 2;
const FLEE_SPEED = 9;
const HIT_INTERVAL = 900; // matches the hammer animation period
const LETTERS_PER_HIT = 2;
const FAIL_CHANCE = 0.35;

const WORK_TALK = ['Building tickets…', 'Almost done!', 'Measure twice…', 'Bang bang!', 'CRQ coming up…', 'Nailing the title'];
const DONE_TALK = ['Looks good!', 'Tightening a bolt', 'Polishing…', 'Not bad, huh?', 'Another day, another ticket'];
const SCARE_TALK = ['Eek!', 'Nope!', 'Gotta go!', 'Not again!', 'Run!'];
const CONFETTI = ['#e60000', '#ffc400', '#16c6b5', '#5b3df5', '#ff7ab8', '#4db8ff'];

type Mode = 'hidden' | 'working' | 'walking' | 'fleeing' | 'celebrating' | 'sad';
// build: hammering letters in · success / fail: showing the outcome · done: title stays built
type Phase = 'build' | 'success' | 'fail' | 'done';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A little builder who hammers the page title into existence, letter by letter.
// Each build either succeeds (he celebrates and the title stays) or collapses
// (he's sad and starts over). He runs off and hides when the pointer gets
// close, then sneaks back.
function Builder() {
  const rootRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const pupilsRef = useRef<SVGGElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anchor = document.querySelector<HTMLElement>('[data-builder-anchor]');
    if (!anchor) return;
    if (reducedMotion()) {
      anchor.dataset.ready = '1'; // keep the plain static title
      return;
    }

    const root = rootRef.current!;
    const flip = flipRef.current!;
    const bubble = bubbleRef.current!;
    const pupils = pupilsRef.current!;
    const fx = fxRef.current!;
    const range = document.createRange();
    const original = anchor.textContent ?? '';
    const title = original.trim();

    const pos = { x: -SIZE * 2, y: 0 };
    const pointer = { x: -9999, y: -9999 };
    let mode: Mode = 'hidden';
    let hiddenUntil = performance.now() + 1500;
    let workUntil = 0;
    let nextHit = 0;
    let nextTalk = 0;
    let targetX = 0;
    let fleeDir = 1;
    let facing = 1;
    let minX = 0;
    let maxX = 0;
    let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
    let appearTimer: ReturnType<typeof setTimeout> | undefined;
    let collapseTimer: ReturnType<typeof setTimeout> | undefined;
    let wipeTimer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    let last = performance.now();

    // build state
    let phase: Phase = 'build';
    let phaseUntil = 0;
    let letters: HTMLSpanElement[] = [];
    let revealed = 0;
    let willFail = false;
    let failAt = 0;

    const setMode = (next: Mode) => {
      mode = next;
      root.classList.toggle('hidden', next === 'hidden');
      root.classList.toggle('working', next === 'working');
      root.classList.toggle('walking', next === 'walking');
      root.classList.toggle('fleeing', next === 'fleeing');
      root.classList.toggle('cheer', next === 'celebrating');
      root.classList.toggle('sad', next === 'sad');
    };

    const say = (text: string, ms: number) => {
      clearTimeout(bubbleTimer);
      bubble.textContent = text;
      bubble.classList.add('show');
      bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
    };

    // where he stands to hammer the next letter in
    const standX = () => {
      const next = letters[revealed];
      if (!next) return null;
      const box = next.getBoundingClientRect();
      return Math.max(minX, Math.min(maxX, box.left + box.width / 2 - HAMMER_REACH));
    };

    const startWorking = (now: number) => {
      setMode('working');
      workUntil = now + rand(3000, 6000);
      nextHit = now + 400; // the hammer lands ~40% into its swing
    };

    // head for the next letter if it's out of reach, otherwise get hammering
    const goToWork = (now: number) => {
      const need = standX();
      if (phase === 'build' && need !== null && Math.abs(need - pos.x) > 60) {
        targetX = need;
        facing = need < pos.x ? -1 : 1;
        setMode('walking');
      } else {
        if (phase === 'build') facing = 1;
        startWorking(now);
      }
    };

    // short-lived particles (confetti, dust) that clean up after themselves
    const particles = (x: number, y: number, count: number, make: (el: HTMLDivElement) => Keyframe[], ms: [number, number]) => {
      for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'fx-bit';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        fx.appendChild(el);
        const anim = el.animate(make(el), { duration: rand(ms[0], ms[1]), easing: 'ease-out', fill: 'forwards' });
        anim.onfinish = () => el.remove();
      }
    };

    const confetti = (x: number, y: number) =>
      particles(
        x,
        y,
        32,
        (el) => {
          el.style.background = pick(CONFETTI);
          const vx = rand(-160, 160);
          const vy = rand(-170, -60);
          const r = rand(-540, 540);
          return [
            { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
            { transform: `translate(${vx}px, ${vy}px) rotate(${r / 2}deg)`, opacity: 1, offset: 0.4 },
            { transform: `translate(${vx * 1.3}px, ${vy + 260}px) rotate(${r}deg)`, opacity: 0 },
          ];
        },
        [1400, 2200],
      );

    const dust = (x: number, y: number) =>
      particles(
        x,
        y,
        10,
        (el) => {
          el.classList.add('dust');
          const vx = rand(-70, 70);
          return [
            { transform: 'translate(0, 0) scale(.4)', opacity: 0.8 },
            { transform: `translate(${vx}px, ${rand(-40, -10)}px) scale(1.6)`, opacity: 0 },
          ];
        },
        [700, 1100],
      );

    // swap the heading's content for a fresh copy of the title made of invisible letters
    const resetBuild = () => {
      clearTimeout(collapseTimer);
      clearTimeout(wipeTimer);
      anchor.classList.remove('done', 'wobble', 'collapsed');
      anchor.textContent = '';
      letters = [];
      title.split(' ').forEach((word, i) => {
        if (i > 0) anchor.appendChild(document.createTextNode(' '));
        const wordEl = document.createElement('span');
        wordEl.className = 'title-word';
        for (const ch of word) {
          const letter = document.createElement('span');
          letter.className = 'title-letter';
          letter.style.setProperty('--i', String(letters.length));
          letter.textContent = ch;
          wordEl.appendChild(letter);
          letters.push(letter);
        }
        anchor.appendChild(wordEl);
      });
      anchor.setAttribute('aria-label', title);
      anchor.dataset.ready = '1';
      revealed = 0;
      phase = 'build';
      willFail = Math.random() < FAIL_CHANCE;
      failAt = Math.ceil(letters.length * rand(0.4, 0.9));
    };

    const succeed = (now: number) => {
      phase = 'success';
      phaseUntil = now + 3200;
      setMode('celebrating');
      anchor.classList.add('done');
      confetti(pos.x + SIZE / 2, pos.y + 6);
      say('It works! 🎉', 2800);
    };

    const fail = (now: number) => {
      phase = 'fail';
      phaseUntil = now + 3600;
      setMode('sad');
      anchor.classList.add('wobble');
      say('Noooo… my title!', 3000);
      collapseTimer = setTimeout(collapseLetters, 400);
    };

    // letters tumble off the title and fade away
    const collapseLetters = () => {
      for (const l of letters) {
        l.style.setProperty('--dx', `${rand(-40, 40)}px`);
        l.style.setProperty('--dy', `${rand(60, 120)}px`);
        l.style.setProperty('--r', `${rand(-140, 140)}deg`);
      }
      anchor.classList.remove('wobble');
      anchor.classList.add('collapsed');
      const box = range.getBoundingClientRect();
      dust(box.left + box.width / 2, box.bottom + 40);
    };

    // scared off mid-build (or after finishing): the title falls apart and must be rebuilt
    const wipeTitle = () => {
      if (phase === 'build' && revealed === 0) return;
      clearTimeout(collapseTimer);
      phase = 'build'; // cancels any pending success / fail outcome
      collapseLetters();
      wipeTimer = setTimeout(resetBuild, 1500);
    };

    const hit = (now: number) => {
      for (let i = 0; i < LETTERS_PER_HIT && revealed < letters.length; i++) letters[revealed++].classList.add('on');
      if (willFail && revealed >= failAt) fail(now);
      else if (revealed >= letters.length) succeed(now);
    };

    const endPhase = (now: number) => {
      const failed = phase === 'fail';
      if (failed) resetBuild();
      else phase = 'done'; // the finished title stays
      if (mode === 'celebrating' || mode === 'sad') {
        goToWork(now);
        say(failed ? "Okay, let's start again!" : 'Next, a bit of polishing', 1800);
      }
    };

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    setMode('hidden');
    resetBuild();

    const tick = (now: number) => {
      const dt = Math.min(now - last, 50) / 16.67;
      last = now;

      // he stands on top of the title, so follow wherever it currently is
      range.selectNodeContents(anchor);
      const text = range.getBoundingClientRect();
      pos.y = Math.max(0, text.top + 9 - FEET_Y);
      minX = Math.max(0, text.left - HAMMER_REACH);
      maxX = Math.max(minX, text.right - SIZE / 2);

      if ((phase === 'success' || phase === 'fail') && now >= phaseUntil) endPhase(now);

      const dx = pointer.x - (pos.x + SIZE / 2);
      const dy = pointer.y - (pos.y + BODY_H / 2);
      const dist = Math.hypot(dx, dy) || 1;

      if (mode === 'hidden') {
        if (now >= hiddenUntil) {
          const spawnX = standX() ?? rand(minX, maxX);
          const spawnDist = Math.hypot(pointer.x - (spawnX + SIZE / 2), pointer.y - (pos.y + BODY_H / 2));
          if (spawnDist < WARY_DISTANCE + 40) {
            hiddenUntil = now + 500; // pointer is still around, keep hiding
          } else {
            pos.x = spawnX;
            facing = 1;
            startWorking(now);
            nextTalk = now + 1500;
            root.classList.add('appear');
            clearTimeout(appearTimer);
            appearTimer = setTimeout(() => root.classList.remove('appear'), 700);
            say('Back to work!', 1300);
          }
        }
      } else if (mode === 'fleeing') {
        pos.x += fleeDir * FLEE_SPEED * dt;
        facing = fleeDir;
        if (pos.x < -SIZE - 10 || pos.x > window.innerWidth + 10) {
          setMode('hidden');
          hiddenUntil = now + rand(4000, 7300);
          bubble.classList.remove('show');
        }
      } else if (dist < SCARE_DISTANCE) {
        // run away from the pointer; if it's right above/below, pick the roomier side
        fleeDir = Math.abs(dx) > 20 ? (dx > 0 ? -1 : 1) : pos.x > window.innerWidth / 2 ? 1 : -1;
        setMode('fleeing');
        say(pick(SCARE_TALK), 1000);
        wipeTitle();
      } else if (mode === 'celebrating' || mode === 'sad') {
        // stay put until the phase ends (handled above)
      } else if (mode === 'working') {
        pos.x = Math.max(minX, Math.min(maxX, pos.x));
        if (now >= nextHit) {
          nextHit += HIT_INTERVAL;
          if (phase === 'build') hit(now);
        }
        if (mode === 'working') {
          const need = phase === 'build' ? standX() : null;
          if (need !== null && Math.abs(need - pos.x) > 60) {
            // next letters are further along the title, follow them
            targetX = need;
            facing = need < pos.x ? -1 : 1;
            setMode('walking');
          } else if (phase !== 'build' && now >= workUntil) {
            // title is finished: just wander about tinkering
            targetX = pos.x;
            for (let i = 0; i < 5 && Math.abs(targetX - pos.x) < 100; i++) targetX = rand(minX, maxX);
            facing = targetX < pos.x ? -1 : 1;
            setMode('walking');
          } else if (now >= nextTalk) {
            say(pick(phase === 'build' ? WORK_TALK : DONE_TALK), 1800);
            nextTalk = now + rand(5000, 10000);
          }
        }
      } else {
        targetX = Math.max(minX, Math.min(maxX, targetX));
        const step = (phase === 'build' ? BUILD_WALK_SPEED : WALK_SPEED) * dt;
        if (Math.abs(targetX - pos.x) <= step) {
          pos.x = targetX;
          goToWork(now);
        } else {
          pos.x += Math.sign(targetX - pos.x) * step;
        }
      }

      root.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      flip.style.transform = `scaleX(${facing})`;
      // wary eyes follow a close pointer, otherwise he looks at his work
      let look = '1px, 1.2px';
      if (mode === 'sad') look = '0px, 2px';
      else if (mode === 'celebrating') look = '0px, -0.5px';
      else if (dist < WARY_DISTANCE) look = `${(dx / dist) * 1.6 * facing}px, ${(dy / dist) * 1.6}px`;
      pupils.style.transform = `translate(${look})`;

      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
      clearTimeout(bubbleTimer);
      clearTimeout(appearTimer);
      clearTimeout(collapseTimer);
      clearTimeout(wipeTimer);
      anchor.classList.remove('done', 'wobble', 'collapsed');
      anchor.removeAttribute('aria-label');
      anchor.textContent = original;
    };
  }, []);

  return (
    <>
      <div ref={fxRef} className="fx-layer" aria-hidden="true" />
      <div ref={rootRef} className="builder hidden" aria-hidden="true">
        <div ref={bubbleRef} className="builder-bubble" />
        <div className="builder-puff" />
        <div ref={flipRef} className="builder-flip">
          <div className="builder-body">
            <svg width={SIZE} height={BODY_H} viewBox="0 0 48 56">
              <rect className="leg leg-l" x="16" y="42" width="6" height="12" rx="3" fill="#333" />
              <rect className="leg leg-r" x="28" y="42" width="6" height="12" rx="3" fill="#333" />
              <rect x="12" y="28" width="24" height="18" rx="6" fill="#e60000" />
              <rect x="21" y="32" width="6" height="8" rx="2" fill="#fff" opacity="0.85" />
              <circle cx="24" cy="20" r="12" fill="#ffd9b3" />
              <path d="M11 17a13 13 0 0 1 26 0z" fill="#ffc400" />
              <rect x="9" y="16" width="30" height="3.5" rx="1.75" fill="#ffb000" />
              <circle cx="19" cy="23" r="3.4" fill="#fff" />
              <circle cx="29" cy="23" r="3.4" fill="#fff" />
              <g ref={pupilsRef}>
                <circle cx="19" cy="23" r="1.6" fill="#222" />
                <circle cx="29" cy="23" r="1.6" fill="#222" />
              </g>
              <path className="mouth" d="M20 29q4 3 8 0" stroke="#a33" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              <path className="mouth-sad" d="M20 31q4 -3 8 0" stroke="#a33" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              <ellipse className="mouth-o" cx="24" cy="30" rx="2.2" ry="2.8" fill="#a33" />
              <g className="arm">
                <rect x="33.2" y="43" width="1.8" height="13" rx="0.9" fill="#8a5a2b" />
                <rect x="29.5" y="54" width="9" height="5" rx="1" fill="#7a7f87" />
                <rect x="32" y="29" width="4.5" height="15" rx="2.2" fill="#c40000" />
                <circle cx="34.2" cy="44.5" r="2.4" fill="#ffd9b3" />
              </g>
            </svg>
            <div className="builder-spark">✦</div>
            <div className="builder-tear" />
          </div>
        </div>
      </div>
    </>
  );
}

const css = `
/* the title is built by the builder; keep it hidden until the script has taken over */
[data-builder-anchor]:not([data-ready]) { visibility: hidden; }
.title-word { display: inline-block; white-space: nowrap; }
.title-letter { display: inline-block; opacity: 0; }
.title-letter.on { opacity: 1; animation: stamp .25s ease-out; }
.done .title-letter.on { animation: wave .7s ease-out calc(var(--i) * 35ms) both; }
.wobble .title-letter.on { animation: shake .1s alternate 4; }
.collapsed .title-letter { transform: translate(var(--dx), var(--dy)) rotate(var(--r)); opacity: 0; transition: transform .9s cubic-bezier(.4,0,1,.7), opacity .5s .5s; }

.builder { position: fixed; left: 0; top: 0; width: ${SIZE}px; height: ${BODY_H}px; z-index: 9999; pointer-events: none; will-change: transform; }
.builder.hidden { visibility: hidden; }
.builder-flip { transform-origin: 50% 50%; }
.builder-body { position: relative; transform-origin: 50% 100%; }
.builder-body svg { display: block; overflow: visible; filter: drop-shadow(0 3px 2px rgba(0,0,0,.25)); }
.builder .leg { transform-box: fill-box; transform-origin: 50% 0; }
.builder .mouth-o, .builder .mouth-sad { opacity: 0; }
.builder.fleeing .mouth, .builder.sad .mouth { opacity: 0; }
.builder.fleeing .mouth-o { opacity: 1; }
.builder.sad .mouth-sad { opacity: 1; }

.builder .arm { transform-origin: 34px 31px; transform: rotate(8deg); }
.builder.working .arm { animation: hammer .9s linear infinite; }
.builder.walking .arm { animation: arm-walk .35s ease-in-out infinite alternate; }
.builder.fleeing .arm { animation: arm-flail .14s ease-in-out infinite alternate; }
.builder.cheer .arm { animation: arm-flail .18s ease-in-out infinite alternate; }
.builder.sad .arm { transform: rotate(14deg); }

.builder.walking .leg-l, .builder.fleeing .leg-r { animation: leg-swing .35s ease-in-out infinite alternate; }
.builder.walking .leg-r, .builder.fleeing .leg-l { animation: leg-swing .35s ease-in-out infinite alternate-reverse; }
.builder.fleeing .leg-l, .builder.fleeing .leg-r { animation-duration: .12s; }
.builder.walking .builder-body { animation: bob .35s ease-in-out infinite alternate; }
.builder.fleeing .builder-body { animation: hop .24s ease-in-out infinite; }
.builder.working .builder-body { animation: lean .9s ease-in infinite; }
.builder.cheer .builder-body { animation: jump .5s ease-in-out infinite; }
.builder.sad .builder-body { animation: slump .8s ease-out forwards; }
.builder.appear .builder-body { animation: pop .5s cubic-bezier(.3,1.6,.5,1); }

.builder-spark { position: absolute; left: 44px; top: 47px; font-size: 14px; line-height: 1; color: #ffb000; opacity: 0; pointer-events: none; }
.builder.working .builder-spark { animation: spark .9s linear infinite; }
.builder-tear { position: absolute; left: 15px; top: 27px; width: 4px; height: 6px; border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; background: #4db8ff; opacity: 0; }
.builder.sad .builder-tear { animation: tear 1s ease-in infinite; }

.builder-puff { position: absolute; left: 50%; bottom: 0; width: 64px; height: 64px; margin-left: -32px; border-radius: 50%; background: radial-gradient(circle, #fff 30%, #d9d9d9 60%, transparent 72%); opacity: 0; }
.builder.appear .builder-puff { animation: puff .6s ease-out; }

.builder-bubble { position: absolute; bottom: 100%; left: 50%; transform: translate(-50%, 4px) scale(.8); white-space: nowrap; background: #fff; color: #111; font: 600 12px/1 sans-serif; padding: 6px 9px; border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,.25); opacity: 0; transition: opacity .15s, transform .15s; }
.builder-bubble.show { opacity: 1; transform: translate(-50%, -2px) scale(1); }

.fx-layer { position: fixed; inset: 0; z-index: 9997; pointer-events: none; overflow: hidden; }
.fx-bit { position: absolute; width: 7px; height: 11px; border-radius: 2px; }
.fx-bit.dust { width: 22px; height: 22px; border-radius: 50%; background: #b8b2a8; }

@keyframes hammer {
  0%, 8% { transform: rotate(-165deg); animation-timing-function: ease-in; }
  42% { transform: rotate(-30deg); }
  50% { transform: rotate(-30deg); animation-timing-function: ease-out; }
  85%, 100% { transform: rotate(-165deg); }
}
@keyframes spark {
  0%, 41% { opacity: 0; transform: scale(.3) rotate(0); }
  44% { opacity: 1; transform: scale(1.2) rotate(40deg); }
  62%, 100% { opacity: 0; transform: scale(.6) rotate(90deg); }
}
@keyframes lean { 0%, 40% { transform: rotate(0); } 46% { transform: rotate(3deg); } 70%, 100% { transform: rotate(0); } }
@keyframes arm-walk { from { transform: rotate(-25deg); } to { transform: rotate(25deg); } }
@keyframes arm-flail { from { transform: rotate(-150deg); } to { transform: rotate(-110deg); } }
@keyframes leg-swing { from { transform: rotate(-28deg); } to { transform: rotate(28deg); } }
@keyframes bob { from { transform: translateY(0); } to { transform: translateY(-3px); } }
@keyframes hop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes jump { 0%, 100% { transform: translateY(0) scale(1.05, .93); } 50% { transform: translateY(-22px) scale(.96, 1.06); } }
@keyframes slump { to { transform: rotate(5deg) scaleY(.93) translateY(3px); } }
@keyframes tear { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(18px); opacity: 0; } }
@keyframes pop { from { transform: scale(0) rotate(-180deg); } to { transform: scale(1) rotate(0); } }
@keyframes puff { from { transform: scale(.2); opacity: .9; } to { transform: scale(1.5); opacity: 0; } }
@keyframes stamp { from { transform: scale(1.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes wave { 40% { transform: translateY(-14px) scale(1.15); color: #e60000; } }
@keyframes shake { from { transform: rotate(-8deg); } to { transform: rotate(8deg); } }
@media (prefers-reduced-motion: reduce) { .builder, .fx-layer { display: none; } }
`;

export default function Critters() {
  return (
    <>
      <style>{css}</style>
      <Builder />
    </>
  );
}

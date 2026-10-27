/* Small SVG guests: the stored party size controls every seated/walking group. */
"use strict";
globalThis.GuestAnimation = (() => {
  const count = order => {
    const n = Number(order?.guestCount);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
  };
  function person(index, seated) {
    const shirt = ['#e89b77', '#8eaed5', '#9fbd7a', '#c7a0cd', '#e7c36f'][index % 5];
    const skin = ['#edba91', '#d89d74', '#f2c7a4'][index % 3];
    return `<g class="guest-body"><ellipse cy="6" rx="10" ry="4" fill="#233536" opacity=".2"/>
      <path class="guest-leg guest-leg-left" d="${seated ? 'M-5-5l-6 7 5 5' : 'M-4-5l-3 13'}" fill="none" stroke="#374d5a" stroke-width="5" stroke-linecap="round"/>
      <path class="guest-leg guest-leg-right" d="${seated ? 'M4-5l7 7-5 5' : 'M4-5l3 13'}" fill="none" stroke="#374d5a" stroke-width="5" stroke-linecap="round"/>
      <path d="M-8-24q8-5 16 0l2 20h-20z" fill="${shirt}"/>
      <path d="M-8-22l-5 13" fill="none" stroke="${skin}" stroke-width="4" stroke-linecap="round"/>
      <circle cy="-35" r="10" fill="${skin}"/><path d="M-10-36q-1-13 11-11 12 3 9 14l-5-7-13 3" fill="#493f3d"/>
      <circle cx="-3" cy="-35" r="1" fill="#443938"/><circle cx="4" cy="-35" r="1" fill="#443938"/>
      <path d="M-2-30q3 3 6 0" fill="none" stroke="#a66b59" stroke-width="1.2"/>
      <g class="${seated ? 'guest-drink' : 'guest-arm'}" style="--sip-delay:${index * -.67}s"><path d="M7-22l6 9 6-5" fill="none" stroke="${skin}" stroke-width="4" stroke-linecap="round"/>
      ${seated ? '<path d="M14-25h9l-1 11h-7z" fill="#d8eddf" stroke="#fff6d7" stroke-width="1"/><path d="M16-21h5v5h-5z" fill="#dfad55"/><path d="M20-26l2-5" stroke="#e6e7cf" stroke-width="1.5"/>' : ''}</g></g>`;
  }
  function positions(seat, guests, project) {
    return Array.from({ length: guests }, (_, i) => {
      if (seat.shape === 'bar') return project(seat.x + (i - (guests - 1) / 2) * .65, seat.y - 1 - i % 2 * .35, .6);
      const angle = -Math.PI / 2 + i * Math.PI * 2 / Math.max(guests, 2);
      return project(seat.x + Math.cos(angle) * (seat.shape === 'oval' ? 1.7 : 1.4), seat.y + Math.sin(angle) * 1.4, .55);
    });
  }
  function group(order, targets, phase, entrance, via) {
    const state = phase?.type || 'seated', elapsed = Math.max(0, Number(phase?.elapsed || 0));
    return `<g class="guest-party" data-guest-party="${Number(order.tableNo)}" data-guest-count="${targets.length}" aria-hidden="true" pointer-events="none">` + targets.map(([x, y], i) => {
      const duration = 2.8 + i * .18;
      const waiting = state === 'arriving' && elapsed < duration;
      const seated = state !== 'leaving' ? `<g class="guest-seated${waiting ? ' guest-settling' : ''}" data-guest-state="seated" style="transform:translate(${x}px,${y}px);${waiting ? 'animation-delay:' + (duration - elapsed) + 's;' : ''}">${person(i, true)}</g>` : '';
      if (state === 'seated' || elapsed >= duration) return seated;
      const start = state === 'leaving' ? [x, y] : [entrance[0] - i * 10, entrance[1] + i * 6];
      const end = state === 'leaving' ? [entrance[0] - i * 10, entrance[1] + i * 6] : [x, y];
      return seated + `<g class="guest-walker" data-guest-state="${state}" style="--start-x:${start[0]}px;--start-y:${start[1]}px;--via-x:${via[0]}px;--via-y:${via[1]}px;--end-x:${end[0]}px;--end-y:${end[1]}px;animation-duration:${duration}s;animation-delay:${-elapsed}s;">${person(i, false)}</g>`;
    }).join('') + '</g>';
  }
  function render(seat, order, phase, project) {
    if (!order) return '';
    return group(order, positions(seat, count(order), project), phase, project(.3, 16.7, .1), project(6, 13, .1));
  }
  function extra(order, phase) {
    if (!order) return '';
    return `<svg class="extra-guest-scene" viewBox="0 0 180 88" aria-hidden="true">${group(order, Array.from({length:count(order)}, (_,i) => [25 + i * 30, 75]), phase, [-10, 75], [80, 68])}</svg>`;
  }
  return { count, render, extra };
})();

/* Physical seat labels share the existing numeric order IDs: B1–B8 = 12–19. */
"use strict";
globalThis.SeatPlan = (() => {
  const plan = [
    { id: 1, x: 8, y: 10.8, shape: 'round', seats: 2 },
    { id: 2, x: 10.6, y: 10.8, shape: 'round', seats: 2 },
    { id: 3, x: 13.2, y: 10.8, shape: 'round', seats: 2 },
    { id: 4, x: 15.8, y: 10.8, shape: 'round', seats: 2 },
    { id: 5, x: 10.6, y: 6.4, shape: 'round', seats: 2, chairAxis: 'x' },
    { id: 6, x: 21.3, y: 8, shape: 'oval', seats: 4 },
    { id: 7, x: 20, y: 12.1, shape: 'oval', seats: 4 },
    { id: 8, x: 23.8, y: 12.1, shape: 'oval', seats: 4 },
    { id: 9, x: 6.3, y: 2, shape: 'square', seats: 4 },
    { id: 10, x: 12.1, y: 2, shape: 'square', seats: 4 },
    { id: 11, x: 16.1, y: 2, shape: 'round', seats: 2 },
    ...Array.from({ length: 8 }, (_, i) => ({ id: i + 12, x: 2.5 + i * 2.65, y: 15.3, shape: 'bar', seats: 1 })),
  ];
  const shortLabel = id => Number(id) >= 12 && Number(id) <= 19 ? 'B' + (Number(id) - 11) : String(id);
  const label = id => Number(id) >= 12 && Number(id) <= 19 ? 'บาร์ ' + shortLabel(id) : Number(id) >= 20 ? 'โต๊ะเสริม ' + id : 'โต๊ะ ' + id;
  const entries = (orders = [], capacity = 20) => {
    const max = Math.max(19, Number(capacity) || 19);
    const extraIDs = new Set(Array.from({ length: Math.max(0, max - 19) }, (_, i) => i + 20));
    orders.forEach(o => { if (Number.isSafeInteger(Number(o.tableNo)) && Number(o.tableNo) >= 20) extraIDs.add(Number(o.tableNo)); });
    // Reserve the open side of the terrace for extra tables.
    const positions = [[22.7,4.2], [19.4,4.2], [22.7,1.2], [19.4,1.2]];
    return [...plan.map(s => ({ ...s })), ...Array.from(extraIDs).sort((a, b) => a - b).map((id, i) => ({ id, shape: 'extra', seats: 4, x: positions[i % positions.length][0], y: positions[i % positions.length][1] }))];
  };
  return { label, shortLabel, entries, baseCount: 19, capacity: 20 };
})();

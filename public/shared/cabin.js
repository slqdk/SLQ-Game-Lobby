// SLQ Game Lobby — one's own log cabin: where it stands in the valley, and what is in it. Søren: "en dør i den ene
// ende af huset. Den dør skal føre figuren til ens egen personlige træhytte ... Hytten er den samme for alle brugere,
// der er bare forskellige ting i den". So there is one cabin, and everybody who goes in finds their own things in it.
//
// It stands among the pines west of the saloon (whose west end is x = 0), its front with the door and the porch
// turned towards the saloon. Measures as the room's (room.js): x across, y towards the saloon's front (in 3D: z), a
// unit is a metre. Nobody else is ever in one's cabin, so walking in it is the browser's own business: the server only
// knows that one is in it (and whether one sleeps).

export const CABIN = {
  out: [-27.3, 3.2, -20.5, 10.8],                // the outside of the log walls: [x0, y0, x1, y1]; the front (x1) faces the saloon
  in: [-27.05, 3.45, -20.75, 10.55],             // the inside of the walls
  wallH: 2.7, ridge: 2.3,                        // the eaves, and the ridge above them (it runs along x, over y = 7)
  mid: 7.0,
  door: { y: 7.0, w: 1.0, h: 2.1 },              // in the front wall
  windows: [                                     // [which wall, along it, width, sill, top]: 'front' (x1), 'back' (x0), 'y0', 'y1'
    ['front', 4.95, 1.1, 1.0, 2.2], ['front', 9.05, 1.1, 1.0, 2.2], ['y0', -22.05, 1.0, 1.15, 2.15], ['y1', -25.85, 1.0, 1.15, 2.15],
  ],
  porch: 2.0,                                    // the deck in front of the door, from x1 out
  spawn: [-21.45, 7.0, -Math.PI / 2],            // where one stands on coming in: just inside the door, looking into the room
  pad: 0.28,
};

// The things in it. box: [x, y, w, d] on the floor, h: how high; use: what E does with it (the browser decides how);
// sit: [x, y, facing, how high] where one sits (facing as a figure's: towards (sin a, cos a)).
export const CABIN_THINGS = [
  { id: 'out', use: 'out', name: 'Døren', box: [-21.05, 6.45, 0.3, 1.1], h: 2.1, wall: true },
  { id: 'bed', use: 'bed', name: 'Sengen', box: [-25.0, 3.45, 1.7, 2.25], h: 0.95 },
  { id: 'wardrobe', use: 'wardrobe', name: 'Klædeskabet', box: [-24.4, 9.9, 1.7, 0.65], h: 2.25 },
  { id: 'fire', use: 'fire', name: 'Pejsen', box: [-27.05, 5.95, 0.95, 2.1], h: 1.4 },
  { id: 'sofa', use: 'sit', name: 'Sofaen', box: [-23.05, 6.0, 0.95, 2.0], h: 0.85, sit: [-22.66, 7.0, -Math.PI / 2, 0.5] },
  { id: 'chair', use: 'sit', name: 'Lænestolen', box: [-25.75, 8.5, 0.85, 0.85], h: 1.0, sit: [-25.33, 8.92, -2.3, 0.5] },
  { id: 'table', box: [-25.05, 6.6, 0.8, 0.8], h: 0.45 },
  { id: 'stand', box: [-25.75, 3.5, 0.55, 0.45], h: 0.6 },
  { id: 'wood', box: [-27.05, 4.55, 0.55, 1.15], h: 0.8 },
  { id: 'shelf', box: [-27.05, 8.55, 0.4, 1.2], h: 1.8 },
  { id: 'lamp', box: [-22.2, 9.9, 0.4, 0.4], h: 1.7 },
];
export const CABIN_THING = Object.fromEntries(CABIN_THINGS.map(t => [t.id, t]));
// where one lies in the bed: the feet at the foot end, the head on the pillow by the wall
export const BED = { x: -24.15, y: 5.42, a: 0, top: 0.55 };

// Can one stand here?
export function cabinFree(x, y) {
  const [x0, y0, x1, y1] = CABIN.in, p = CABIN.pad;
  if (x < x0 + p || x > x1 - p || y < y0 + p || y > y1 - p) return false;
  for (const t of CABIN_THINGS) { if (t.wall) continue; const [bx, by, bw, bd] = t.box; if (x > bx - p && x < bx + bw + p && y > by - p && y < by + bd + p) return false; }
  return true;
}
// is a place in the cabin (also where one cannot stand)?
export const inCabin = (x, y) => x > CABIN.out[0] - 0.5 && x < CABIN.out[2] + 0.5 && y > CABIN.out[1] - 0.5 && y < CABIN.out[3] + 0.5;

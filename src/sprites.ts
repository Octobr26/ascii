import type { FlowerKind } from './world.ts';

export interface SpriteArt {
  readonly rows: readonly string[];
  readonly palette: Readonly<Record<string, number>>;
  readonly pixelSize: number;
}

export const PLAYER = [
  '    hhh    ',
  '   hHHHh   ',
  '   hfffh   ',
  '   hfffh   ',
  '    sss    ',
  '   ccscc   ',
  '  ccccccc  ',
  ' ccccccccc ',
  ' ccccccccc ',
  '  ccccccc  ',
  '  ccccccc  ',
  '  ccccccc  ',
  '   ccccc   ',
  '   bb bb   ',
  '   bb bb   ',
  '  bbb bbb  ',
];
// Artwork is independent of lighting, camera position, and terminal dimensions.
const FLOWER_HEADS = {
  daisy: ['   p   ', ' p p p ', '  pop  ', 'ppooopp', '  pop  ', ' p p p ', '   p   '],
  poppy: [' pp pp ', 'ppppppp', 'ppppppp', ' pdddp ', '  ddd  '],
  lavender: ['  p  ', ' ppp ', '  d  ', ' ppp ', 'ppppp', '  d  ', ' ppp ', 'ppppp', '  d  '],
};
const MUSHROOM = ['   ccc   ', '  cpccc  ', ' ccccpcc ', 'ccccccccc', '  ggggg  ', '   sss   ', '   sss   ', '   sss   '];
const FLOWER_COLORS = {
  daisy: { p: 0xf2e8c7, o: 0xe8b84e, d: 0xb5a675 },
  poppy: { p: 0xee806e, o: 0xe8b84e, d: 0x9d454f },
  lavender: { p: 0xb5a0df, o: 0xe8b84e, d: 0x7969a4 },
};
export const SPRITE_COLORS: Record<string, number> = { h: 0xb7baab, H: 0xe3ddbe, f: 0xc9a489, s: 0xb77948, c: 0x55938b, b: 0x434c48 };

const MUSHROOM_PALETTES = {
  terracotta: { c: 0xc17a58, p: 0xe6cd9e, g: 0x846547, s: 0xc7bc91 },
  ochre: { c: 0xc1a065, p: 0xe6cd9e, g: 0x846547, s: 0xc7bc91 },
} as const;

export const FLOWER_SPRITES = {
  daisy: { rows: FLOWER_HEADS.daisy, palette: FLOWER_COLORS.daisy, pixelSize: 0.115 },
  poppy: { rows: FLOWER_HEADS.poppy, palette: FLOWER_COLORS.poppy, pixelSize: 0.115 },
  lavender: { rows: FLOWER_HEADS.lavender, palette: FLOWER_COLORS.lavender, pixelSize: 0.09 },
} satisfies Record<FlowerKind, SpriteArt>;

export const MUSHROOM_SPRITES = {
  terracotta: { rows: MUSHROOM, palette: MUSHROOM_PALETTES.terracotta, pixelSize: 0.095 },
  ochre: { rows: MUSHROOM, palette: MUSHROOM_PALETTES.ochre, pixelSize: 0.095 },
} satisfies Record<string, SpriteArt>;

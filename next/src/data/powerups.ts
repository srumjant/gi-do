import { getLang, type Lang } from '../config/i18n';
import type { PowerupType } from '../game/types';

/** A phrase in both languages, the shape the live table writes inline. */
type Bilingual = Record<Lang, string>;

export interface PowerupInfo {
  name: Bilingual;
  desc: Bilingual;
  /** Hex, as the live game writes it — the popup converts it for Phaser. */
  color: string;
  icon: string;
}

/**
 * What each silly power-up is called, in both languages, with the colour and the emoji
 * its announcement is drawn in (index.html:1143-1147).
 *
 * A table of its own rather than six more keys in `TRANSLATIONS`, because that is what
 * it is in the live game: the strings arrive bundled with a colour and an icon, and the
 * popup reads all four off one record. The three icons are the same three glyphs the HUD
 * column draws (index.html:1865-1867), written out a second time by the live game too;
 * neither copy is derived from the other.
 */
export const POWERUP_INFO: Record<PowerupType, PowerupInfo> = {
  fart: {
    name: { et: 'PEERUKAS HÜPE', en: 'FART JUMP' },
    desc: { et: 'Ülibouncy!', en: 'Super bouncy!' },
    color: '#88cc44',
    icon: '\u{1F4A8}',
  },
  bighead: {
    name: { et: 'SUUR PEA', en: 'BIG HEAD' },
    desc: { et: 'Mega tramp!', en: 'Mega stomp!' },
    color: '#ff69b4',
    icon: '\u{1F92A}',
  },
  chicken: {
    name: { et: 'KANA KIIR', en: 'CHICKEN RAY' },
    desc: { et: 'Kaak kaak!', en: 'Bawk bawk!' },
    color: '#ffdd00',
    icon: '\u{1F414}',
  },
};

/** One record with its two phrases already resolved to the language being played in. */
export interface PowerupLabel {
  name: string;
  desc: string;
  color: string;
  icon: string;
}

/**
 * index.html:3171-3173, which resolves each phrase as `info.name[lang]||info.name.en`.
 * The same fallback to English that `T()` makes (config/i18n.ts), over this table rather
 * than over `TRANSLATIONS` — the lookup differs, the rule does not.
 */
export function powerupLabel(type: PowerupType): PowerupLabel {
  const info = POWERUP_INFO[type];
  const lang = getLang();
  return {
    name: info.name[lang] ?? info.name.en,
    desc: info.desc[lang] ?? info.desc.en,
    color: info.color,
    icon: info.icon,
  };
}

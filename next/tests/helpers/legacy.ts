// Loads a slice of the LIVE game (../index.html) in a VM so ported modules can be
// checked against the real thing instead of against a copy of it. The old game is one
// inline <script> divided by banner comments; a section is the text between two of them.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const LEGACY_HTML = path.resolve(here, '../../../index.html');

let cachedScript: string | null = null;

function legacyScript(): string {
  if (cachedScript === null) {
    const html = fs.readFileSync(LEGACY_HTML, 'utf8');
    const m = html.match(/<script>([\s\S]*)<\/script>/);
    if (!m) throw new Error(`No inline <script> found in ${LEGACY_HTML}`);
    cachedScript = m[1];
  }
  return cachedScript;
}

/**
 * Enough of a browser for a data section to evaluate. It models nothing; it only stops
 * top-of-file DOM calls from throwing. Pass it as `prelude` when the slice reaches code
 * that touches document/window.
 */
export const DOM_STUB = `
  const __el = {
    width: 640, height: 400, style: {}, textContent: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    getContext: () => new Proxy({}, {
      get: () => () => ({ addColorStop(){} }),
      set: () => true,
    }),
    addEventListener(){}, removeEventListener(){}, appendChild(){},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400 }),
  };
  const document = { getElementById: () => __el, createElement: () => __el,
                     body: __el, addEventListener(){} };
  const window = { addEventListener(){}, innerWidth: 1280, innerHeight: 800,
                   devicePixelRatio: 1 };
  const localStorage = { getItem: () => null, setItem(){} };
  const navigator = {};
`;

export interface LegacySectionOptions {
  /** Unique text marking the start of the slice. Omit to start at the top of the script. */
  from?: string;
  /** Unique text marking the end of the slice. Omit to run to the end of the script. */
  to?: string;
  /** Declarations injected before the slice — DOM_STUB, or stubs for later functions. */
  prelude?: string;
  /** Names declared in the slice to hand back. */
  expose: string[];
}

/** The raw text of one section, for tests that need to inspect the source itself. */
export function legacySectionSource(from: string, to: string): string {
  const src = legacyScript();
  const start = src.indexOf(from);
  if (start < 0) throw new Error(`Start marker not found in index.html: ${from}`);
  const end = src.indexOf(to, start);
  if (end < 0) throw new Error(`End marker not found in index.html: ${to}`);
  return src.slice(start, end);
}

export function loadLegacySection<T = Record<string, any>>(
  opts: LegacySectionOptions,
): T {
  const src = legacyScript();

  const start = opts.from === undefined ? 0 : src.indexOf(opts.from);
  if (start < 0) throw new Error(`Start marker not found in index.html: ${opts.from}`);

  const end = opts.to === undefined ? src.length : src.indexOf(opts.to, start);
  if (end < 0) throw new Error(`End marker not found in index.html: ${opts.to}`);

  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(
    `${opts.prelude ?? ''}\n${src.slice(start, end)}\n;this.__exposed = { ${opts.expose.join(', ')} };`,
    sandbox,
    { filename: 'legacy-index.html' },
  );
  return sandbox.__exposed as T;
}

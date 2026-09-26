export type Lang = 'et' | 'en';

/** A phrase is a single string, or a list the caller cycles through. */
export type Phrase = string | string[];
export type Entry = Record<Lang, Phrase>;

export const LANG_KEYS: Lang[] = ['et', 'en'];

export const TRANSLATIONS: Record<string, Entry> = {
  // Title screen
  title:              {et:'GIGI & DODO',             en:'GIGI & DODO'},
  subtitle:           {et:'Julge päästmisseiklus!',  en:'A brave rescue adventure!'},
  worlds:             {et:'6 maailma avastamiseks!',  en:'6 worlds to explore!'},
  press_start:        {et:'VAJUTA SPACE v\u00f5i {A} ALUSTAMISEKS!', en:'PRESS SPACE OR {A} TO START!'},
  controls:           {et:'Nooled/WASD: liigu | Space: hüppa | X: tulista | 🎮 Pult töötab!', en:'Arrows/WASD: move | Space: jump | X: shoot | 🎮 Gamepad works!'},
  // Mode selector
  choose_mode:        {et:'MIDA TEEME?',              en:'WHAT SHALL WE DO?'},
  mode_adventure:     {et:'SEIKLUS',                  en:'ADVENTURE'},
  mode_adventure_d:   {et:'Päästa oma õde-venda!',    en:'Rescue your sibling!'},
  mode_learn:         {et:'ÕPIME!',                   en:'LET\'S LEARN!'},
  mode_learn_d:       {et:'Tähed, silbid ja sõnad',   en:'Letters, syllables, words'},
  mode_hint:          {et:'◀ ▶ vali  •  Space / OK / {A} kinnita', en:'◀ ▶ choose  •  Space / OK / {A} confirm'},
  // Pause menu
  pause_title:        {et:'PAUS',                     en:'PAUSED'},
  pause_continue:     {et:'JÄTKA',                    en:'CONTINUE'},
  pause_switch:       {et:'VAHETA MÄNGU',             en:'SWITCH MODE'},
  pause_menu:         {et:'PEAMENÜÜ',                 en:'MAIN MENU'},
  pause_hint:         {et:'◀ ▶ vali  •  Space / OK kinnita',  en:'◀ ▶ choose  •  Space / OK confirm'},
  // Language selector
  lang_hint:          {et:'L = English',              en:'L = Eesti keel'},
  // Art style selector
  style_flat:         {et:'F = kangas',               en:'F = felt'},
  style_felt:         {et:'F = tavaline',             en:'F = normal'},
  // Difficulty
  select_diff:        {et:'VALI RASKUSASTE',          en:'SELECT DIFFICULTY'},
  super_easy:         {et:'Ülikerge',                 en:'Super Easy'},
  easy:               {et:'Kerge',                    en:'Easy'},
  normal:             {et:'Tavaline',                 en:'Normal'},
  hard:               {et:'Raske',                    en:'Hard'},
  lives:              {et:'elu',                      en:'lives'},
  arrows:             {et:'noolt',                    en:'arrows'},
  cape_pit:           {et:'Keep + augu kaitse',       en:'Cape + pit save'},
  cape_start:         {et:'Algab keepiga',            en:'Start w/ cape'},
  no_cape:            {et:'Ilma keepita',              en:'No cape'},
  enemies_label:      {et:'Vaenlased: ',              en:'Enemies: '},
  very_slow:          {et:'Väga aeglased',            en:'Very slow'},
  slow:               {et:'Aeglased',                 en:'Slow'},
  normal_speed:       {et:'Tavalised',                en:'Normal'},
  fast:               {et:'Kiired!',                  en:'Fast!'},
  fewer_enemies:      {et:'Vähem vaenlasi',           en:'Fewer enemies'},
  lr_choose:          {et:'Vasakule / Paremale valimiseks, Space kinnitab', en:'Left / Right to choose, Space to confirm'},
  // Character select
  choose_hero:        {et:'VALI OMA KANGELANE!',      en:'CHOOSE YOUR HERO!'},
  rescue:             {et:'Päästa',                   en:'Rescue'},
  // Intro cutscene
  la_la:              {et:'LA LA LA...',               en:'LA LA LA...'},
  help_cry:           {et:'APPI!!',                   en:'HELP!!'},
  i_come_help:        {et:'MA TULEN APPI!',           en:'I\'M COMING!'},
  save_sib:           {et:'PÄÄSTA',                   en:'SAVE'},
  adventure_begins:   {et:'SEIKLUS ALGAB!',           en:'THE ADVENTURE BEGINS!'},
  press_space:        {et:'VAJUTA SPACE...',           en:'PRESS SPACE...'},
  dino_phrases:       {et:['TULE SIIA, PISIKE!','HEH HEH HEH!','SA OLED NII NALJAKAS!','MINA OLEN SUUR DINO!','MÄNGIME PEITUST!'],
                       en:['COME HERE, LITTLE ONE!','HEH HEH HEH!','YOU ARE SO FUNNY!','I AM A BIG DINO!','LET\'S PLAY HIDE AND SEEK!']},
  // HUD
  score:              {et:'PUNKTID: ',                en:'SCORE: '},
  help_npc:           {et:'Appi!',                    en:'Help!'},
  meow:               {et:'Mjäu!',                    en:'Meow!'},
  skin_classic:       {et:'Klassikaline',              en:'Classic'},
  skin_truck:         {et:'Monstertruck',              en:'Monster Truck'},
  cat_found:          {et:'Kass leitud!',              en:'Cat found!'},
  // Level complete
  is_safe:            {et:' ON PÄÄSTETUD!',           en:' IS SAFE!'},
  next_world:         {et:'Järgmine maailm...',       en:'Next world...'},
  you_did_it:         {et:'Sa tegid seda!',           en:'You did it!'},
  // Death
  oops:               {et:'Oih!',                     en:'Oops!'},
  // Game over
  game_over:          {et:'MÄNG LÄBI',                en:'GAME OVER'},
  score_label:        {et:'Punktid: ',                en:'Score: '},
  press_retry:        {et:'Vajuta SPACE uuesti proovimiseks', en:'Press SPACE to try again'},
  // Win
  is_saved:           {et:' ON PÄÄSTETUD!',           en:' IS SAVED!'},
  is_the_best:        {et:' on parim!',               en:' is the best!'},
  difficulty_label:   {et:'Raskus: ',                 en:'Difficulty: '},
  final_score:        {et:' | Punktid: ',             en:' | Final Score: '},
  press_play_again:   {et:'Vajuta SPACE uuesti mängimiseks', en:'Press SPACE to play again'},
  // Between-level cutscene
  oh_no:              {et:'OI EI!',                   en:'OH NO!'},
  sib_stolen_again:   {et:' RÖÖVITI JÄLLE!',         en:' WAS STOLEN AGAIN!'},
  keep_going:         {et:'EDASI!',                   en:'KEEP GOING!'},
  boss_taunt:         {et:['SA EI SAA MIND VÕITA!','MINA OLEN BOSS!','HEH HEH HEH!'],
                       en:['YOU CAN\'T BEAT ME!','I AM THE BOSS!','HEH HEH HEH!']},
  boss_defeated:      {et:'BOSS ON VÕIDETUD!',       en:'BOSS DEFEATED!'},
  almost_there:       {et:'Peaaegu kohal...',        en:'Almost there...'},
  final_battle:       {et:'VIIMANE LAHING!',         en:'FINAL BATTLE!'},
  boss_awaits:        {et:'Boss ootab sind...',      en:'The Boss awaits...'},
  boss_intro_phrases: {et:['TULGE SIIA, KUI JULGED!','KEEGI EI PÄÄSTA TEDA!','MINA OLEN KUNINGAS!','HEH HEH HEH...'],
                       en:['COME HERE IF YOU DARE!','NO ONE CAN SAVE THEM!','I AM THE KING!','HEH HEH HEH...']},
  dino_between:       {et:[
    'SA EI SAA MIND KÄTTE!','HEH, LIIGA AEGLANE!','PROOVI UUESTI, PISIKE!','MA OLEN LIIGA KIIRE!','TULE JA PÜÜA MIND!'
  ], en:[
    'YOU CAN\'T CATCH ME!','HEH, TOO SLOW!','TRY AGAIN, LITTLE ONE!','I\'M TOO FAST!','COME AND GET ME!'
  ]},
  // Learn mode's own words. The live game hardcodes them in Estonian inside drawLearn,
  // drawLearnMenu and drawLearnResult (index.html:2890, :2929, :2947-2955, :2983-2985,
  // :3001-3021); here they have both languages.
  // Three are reworded on purpose: words mode builds its word a gate at a time, so it says
  // "Ehita sõna" and "LEIA TÄHED:" where the live game says "Kirjuta sõna" and "KIRJUTA
  // SÕNA:", and the hint takes mode_hint's shape, with the pad's buttons.
  learn_title:        {et:'ÕPIME!',                   en:'LET\'S LEARN!'},
  learn_choose:       {et:'Vali harjutus:',           en:'Choose an exercise:'},
  learn_letters:      {et:'TÄHED',                    en:'LETTERS'},
  learn_letters_d:    {et:'Leia õige täht',           en:'Find the right letter'},
  learn_syllables:    {et:'SILBID',                   en:'SYLLABLES'},
  learn_syllables_d:  {et:'Leia õige silp',           en:'Find the right syllable'},
  learn_words:        {et:'SÕNAD',                    en:'WORDS'},
  learn_words_d:      {et:'Ehita sõna',               en:'Build the word'},
  learn_menu_hint:    {et:'◀ ▶ vali  •  Space / {A} alusta  •  ESC / {B} tagasi',
                       en:'◀ ▶ choose  •  Space / {A} start  •  ESC / {B} back'},
  learn_find_letter:  {et:'LEIA TÄHT:',               en:'FIND THE LETTER:'},
  learn_find_syllable: {et:'LEIA SILP:',              en:'FIND THE SYLLABLE:'},
  learn_find_letters: {et:'LEIA TÄHED:',              en:'FIND THE LETTERS:'},
  learn_speak:        {et:'🔊 X / {X}',               en:'🔊 X / {X}'},
  // The result screen's cheer. The voice says its own Estonian five, one per gate
  // (game/learn/voiceClips.ts's LEARN_CHEERS).
  learn_cheers:       {et:['TUBLI!','VÄGA HEA!','SUPER!','SUUREPÄRANE!','FANTASTILINE!'],
                       en:['WELL DONE!','VERY GOOD!','SUPER!','EXCELLENT!','FANTASTIC!']},
  learn_found:        {et:'Leitud:',                  en:'Found:'},
  learn_result_hint:  {et:'Space / {A} uus torn  •  ESC / {B} menüü',
                       en:'Space / {A} new tower  •  ESC / {B} menu'},
  // Level names
  level_1:            {et:'Nukuaed',                  en:'Doll Garden'},
  level_2:            {et:'Dinosauruse kanjon',       en:'Dinosaur Canyon'},
  level_3:            {et:'Tallinna vanalinn',        en:'Tallinn Old Town'},
  level_4:            {et:'Palermo väljak',           en:'Palermo Piazza'},
  level_5:            {et:'Talvine imedemaa',           en:'Winter Wonderland'},
  level_6:            {et:'Mängulossi',                en:'Toy Castle'},
};

let lang: Lang = 'et';

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
}

/**
 * Placeholders in translated strings, mapped to the ACTION each one means. The live
 * game calls padGlyph('confirm'), not padGlyph('A') — the letters are only how the
 * placeholder is spelled, and the glyph that replaces one depends on the connected
 * pad (Cross on a DualSense, A on an Xbox pad). Keep the action names: a later plan's
 * gamepad code implements the resolver against this contract.
 */
export type GlyphAction = 'confirm' | 'back' | 'shoot' | 'pause';

const GLYPH_ACTIONS: Record<string, GlyphAction> = {
  A: 'confirm',
  B: 'back',
  X: 'shoot',
  P: 'pause',
};

/**
 * Injected rather than imported so this module stays free of input concerns. The
 * default returns the action name, which is what the tests want and is harmless in
 * the menus before a pad is connected.
 */
let glyphFor: (action: GlyphAction) => string = (action) => action;

export function setGlyphResolver(fn: (action: GlyphAction) => string): void {
  glyphFor = fn;
}

/**
 * How every string is shown: in capitals, the letters the children this is for read first
 * (the owner's call; the live game mixes cases). T applies it to everything it returns, and
 * scenes apply it to the little they show that is not a translation (a hero's name, a skin's).
 * The table above keeps the live game's own spelling, so the parity test still compares like
 * with like.
 */
export function capitals(text: string): string {
  return text.toUpperCase();
}

export function T(key: string): Phrase {
  const entry = TRANSLATIONS[key];
  if (!entry) return key;

  const value = entry[lang] ?? entry.en ?? key;

  // Only strings get glyph substitution. A phrase array is never searched for placeholders —
  // indexOf('{') on an array compares whole elements, which is the bug 8354ea0 fixed.
  if (typeof value !== 'string') return value.map(capitals);
  if (value.indexOf('{') < 0) return capitals(value);

  return capitals(value.replace(/\{([ABXP])\}/g, (whole, letter: string) => {
    const action = GLYPH_ACTIONS[letter];
    return action ? glyphFor(action) : whole;
  }));
}

/** Convenience for the common case where the caller knows the value is a string. */
export function TStr(key: string): string {
  const value = T(key);
  return typeof value === 'string' ? value : (value[0] ?? key);
}

/**
 * Difficulty label. The translation keys ARE the difficulty keys — `super_easy`,
 * `easy`, `normal`, `hard` — so this is just T() with a narrower type. The live
 * game routes through an identity map at index.html:289 (`{super_easy:'super_easy',
 * ...}`); it is a no-op indirection and is not reproduced here. Behaviour is the same.
 */
export function TDiff(key: string): string {
  return TStr(key);
}

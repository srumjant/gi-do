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
  // Full-screen button (gfx/fullscreen.ts): its tooltip
  fullscreen_on:      {et:'Täisekraan',               en:'Full screen'},
  fullscreen_off:     {et:'Välju täisekraanist',      en:'Exit full screen'},
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
  level_1_2:          {et:'Aiavärav',                 en:'Garden Gate'},
  level_2_2:          {et:'Kaljusein',                en:'Canyon Wall'},
  level_1_3:          {et:'Nukumaja',                 en:'Doll House'},
  level_2_3:          {et:'Vulkaan',                  en:'Volcano'},
  level_3_2:          {et:'Tornid',                   en:'The Towers'},
  level_3_3:          {et:'Raekoja plats',            en:'Town Hall Square'},
  level_4_2:          {et:'Turg',                     en:'The Market'},
  level_4_3:          {et:'Katedraal',                en:'The Cathedral'},
  level_5_2:          {et:'Jäätunud järv',            en:'The Frozen Lake'},
  level_5_3:          {et:'Jääloss',                  en:'The Ice Palace'},
  level_6_2:          {et:'Lossisaalid',              en:'The Castle Halls'},
  level_6_3:          {et:'Troonisaal',               en:'The Throne Room'},
  // The story (docs/superpowers/specs/2026-11-23-story-and-transitions-design.md). Written in
  // capitals, as every word a child reads is shown. %V a villain, %S the sibling (Estonian
  // adds the partitive's T itself), %N and %W a world's number and name.
  villain_dollQueen:      {et:'NUKUKUNINGANNA',     en:'THE DOLL QUEEN'},
  villain_dollQueen_par:  {et:'NUKUKUNINGANNAT',    en:'THE DOLL QUEEN'},
  villain_pterodactyl:    {et:'PTERODAKTÜL',        en:'THE PTERODACTYL'},
  villain_pterodactyl_par:{et:'PTERODAKTÜLI',       en:'THE PTERODACTYL'},
  villain_vanaToomas:     {et:'VANA TOOMAS',        en:'VANA TOOMAS'},
  villain_vanaToomas_par: {et:'VANA TOOMAST',       en:'VANA TOOMAS'},
  villain_pizzaChef:      {et:'PITSAKOKK',          en:'THE PIZZA CHEF'},
  villain_pizzaChef_par:  {et:'PITSAKOKKA',         en:'THE PIZZA CHEF'},
  villain_yeti:           {et:'JETI',               en:'THE YETI'},
  villain_yeti_par:       {et:'JETIT',              en:'THE YETI'},
  villain_tRex:           {et:'T-REX',              en:'THE T-REX'},
  villain_tRex_par:       {et:'T-REXI',             en:'THE T-REX'},
  world_1:            {et:'NUKUAED',                  en:'THE DOLL GARDEN'},
  world_2:            {et:'DINOSAURUSE KANJON',       en:'DINOSAUR CANYON'},
  world_3:            {et:'TALLINN',                  en:'TALLINN'},
  world_4:            {et:'PALERMO',                  en:'PALERMO'},
  world_5:            {et:'TALVINE IMEDEMAA',         en:'WINTER WONDERLAND'},
  world_6:            {et:'MÄNGULOSS',                en:'THE TOY CASTLE'},
  story_wants:        {et:'T-REX TAHAB %ST!',         en:'THE T-REX WANTS %S!'},
  story_now_me:       {et:'NÜÜD MINA ISE!',           en:'NOW IT\'S MY TURN!'},
  story_sent_me:      {et:'T-REX SAATIS MIND...',     en:'THE T-REX SENT ME...'},
  story_took:         {et:'%V VIIS %S ÄRA!',          en:'%V TOOK %S!'},
  story_follow:       {et:'JÄLITA %V!',               en:'FOLLOW %V!'},
  story_save:         {et:'PÄÄSTA %S!',               en:'SAVE %S!'},
  story_world:        {et:'MAAILM %N: %W',            en:'WORLD %N: %W'},
  story_hooray:       {et:'HURRAA!',                  en:'HOORAY!'},
  story_trex_tiny:    {et:'T-REX ON NÜÜD PISIKE!',    en:'THE T-REX IS TINY NOW!'},
  // The port's own skins' names (data/sprites.ts, `nameKey`).
  skin_ninja:         {et:'NINJA',                    en:'NINJA'},
  skin_cinderella:    {et:'TUHKATRIINU',              en:'CINDERELLA'},
  // The prompts, naming the button on the device last used (input/source.ts): %K confirm,
  // %B back. The live game's own (press_start, mode_hint, ...) name SPACE whatever the device.
  prompt_start:       {et:'VAJUTA %K ALUSTAMISEKS!',  en:'PRESS %K TO START!'},
  prompt_choose:      {et:'◀ ▶ VALI  •  %K KINNITA',  en:'◀ ▶ CHOOSE  •  %K CONFIRM'},
  prompt_next:        {et:'VAJUTA %K...',             en:'PRESS %K...'},
  prompt_retry:       {et:'VAJUTA %K UUESTI PROOVIMISEKS', en:'PRESS %K TO TRY AGAIN'},
  prompt_play_again:  {et:'VAJUTA %K UUESTI MÄNGIMISEKS',  en:'PRESS %K TO PLAY AGAIN'},
  prompt_learn_menu:  {et:'◀ ▶ VALI  •  %K ALUSTA  •  %B TAGASI', en:'◀ ▶ CHOOSE  •  %K START  •  %B BACK'},
  prompt_learn_result:{et:'%K UUS TORN  •  %B MENÜÜ', en:'%K NEW TOWER  •  %B MENU'},
  controls_touch:     {et:'◀ ▶ LIIGU  •  ⤒ HÜPPA  •  🏹 TULISTA', en:'◀ ▶ MOVE  •  ⤒ JUMP  •  🏹 SHOOT'},
  follow_them:        {et:'JÄLITA NEID!',             en:'FOLLOW THEM!'},
  next_level:         {et:'Järgmine tase...',         en:'Next level...'},
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

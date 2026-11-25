// tolère une URL collée avec /rest/v1 à la fin
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

// Le site n'utilise que les fonctions RPC de Supabase (PostgREST) : un simple fetch suffit,
// sans Supabase Auth (l'authentification est gérée par les fonctions fuin_* avec un jeton maison).
// Les nouvelles clés (sb_publishable_…) vont uniquement dans l'en-tête apikey ;
// les anciennes clés "anon" (JWT) sont aussi envoyées en Bearer.
function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = { apikey: key!, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (!/^sb_(publishable|secret)_/.test(key!)) h.Authorization = `Bearer ${key}`;
  return h;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Member {
  id: string;
  prenom: string;
  nom: string;
  display_name: string;
  rank: number;
  is_conclave: boolean;
}

export type PageKind = 'seal' | 'index' | 'doc' | 'memorial';

export type MemorialRank = 'grand_maitre' | 'maitre';
export type MemorialStatus = '' | 'actif' | 'retire' | 'mort' | 'disparu' | 'traitre';

export interface MemorialEntry {
  id: number | null;
  name: string;
  rank: MemorialRank;
  epithet: string;
  status: MemorialStatus;
  origin: string;
  era: string;
  specialty: string;
  story_md: string;
  image: string | null;
  position?: number;
  /** shinobi lié à la fiche (visible du Conclave seulement) */
  member_id?: string | null;
  member_name?: string | null;
  /** la fiche du shinobi connecté */
  mine?: boolean;
  /** Conclave, ou maître qui modifie sa propre fiche */
  can_edit?: boolean;
}

export interface NavPage {
  slug: string;
  title: string;
  nav_title: string;
  kind: PageKind;
  badge: 'mj' | null;
  kanji: string | null;
  hidden: boolean;
  description: string;
  slotted: boolean;
}

export interface NavCategory {
  id: number;
  slug: string;
  name: string;
  glyph: string;
  tagline: string;
  min_rank: number;
  conclave_only: boolean;
  show_on_home: boolean;
  accessible: boolean;
  seal_count: number;
  pages: NavPage[];
}

export interface Bootstrap {
  member: Member;
  requests_pending: number | null;
  suggestions_new?: number | null;
  active_trames: { id: number; title: string }[];
  categories: NavCategory[];
}

export type TrameStatus = 'draft' | 'active' | 'ended';
export type TrameStepKind =
  | 'cipher'
  | 'riddle'
  | 'unseal'
  | 'missing'
  | 'situation'
  | 'choice'
  | 'order'
  | 'match'
  | 'review'
  | 'text'
  | 'dial'
  | 'mastermind'
  | 'path'
  | 'sequence'
  | 'memory'
  | 'intruder'
  | 'substitution';

export interface TrameStepDef {
  kind: TrameStepKind;
  title: string;
  prompt_md: string;
  cipher_text?: string;
  answers?: string[];
  /** essais par joueur pour cette étape seulement */
  max_attempts?: number;
  /** ancien réglage du désenclavement (verrous = cercle du sceau) */
  seal_circle?: number;
  /** désenclavement : verrous à briser (1 à 10) */
  locks?: number;
  /** désenclavement : essais selon le cercle du joueur, ou nombre fixe (max_attempts) */
  attempts_mode?: 'rank' | 'fixed';
  min_rank?: number;
  roll_table?: string;
  seal_svg?: string;
  success_md?: string;
  /** kanjis manquants et ordre des kanjis */
  formula?: string;
  /** kanjis manquants : positions cachées (à partir de 0) */
  missing?: number[];
  /** kanjis manquants : leurres proposés avec les bons kanjis */
  decoys?: string;
  /** montrer les cases justes après un essai raté */
  reveal?: boolean;
  /** associations */
  pairs?: { left: string; right: string }[];
  /** question à choix */
  options?: string[];
  correct?: number[];
  /** mise en situation : le bon sceau (id de fiche) pour chaque situation */
  situations?: { text: string; answers: number[] }[];
  /** mise en situation : sceaux proposés (vide : tous ceux que le joueur peut lire) */
  choices?: number[];
  /** rolls d'étude : sens de chaque kanji (inscription ou formule), dans l'ordre */
  meanings?: string[];
  /** indices révélés un à un par les rolls d'étude */
  hints?: string[];
  /** nombre de rolls d'étude par joueur (0 : désactivé) */
  study_rolls?: number;
  study_table?: string;
  /** verrou à cercles : le bon kanji de chaque cercle et ses leurres */
  rings?: { answer: string; decoys: string }[];
  /** résonance du sceau : kanjis proposés (la formule secrète est dans formula) */
  palette?: string;
  /** flux de chakra : lignes de la grille et tracé (cases numérotées ligne après ligne, à partir de 0) */
  grid?: string[];
  path?: number[];
  /** flux de chakra : montrer la case de départ */
  show_start?: boolean;
  /** suite logique : éléments affichés (« ? » pour la case à trouver) */
  items?: string[];
  /** mémoire du sceau : séquence en signes des mains, durée d'affichage */
  signs?: boolean;
  show_seconds?: number;
  /** code du Conclave : table lettre → kanji, et lettres cachées au joueur */
  key?: { l: string; k: string; hidden?: boolean }[];
}

export interface TrameStudy {
  rolls_used: number;
  rolls_max: number;
  chars: { i: number; kanji: string | null; studiable: boolean; meaning: string | null; misread: boolean }[];
  hints: string[];
  hints_total: number;
  log: { target: number; roll: number; label: string; tone: string; effect: string }[];
}

export interface TrameStudyResult {
  roll: number;
  label: string;
  tone: string;
  effect: string;
  success: boolean;
  meaning: string | null;
  hint: string | null;
  rolls_left: number;
}

export interface TrameDef {
  id: number | null;
  title: string;
  intro_md: string;
  status?: TrameStatus;
  shared: boolean;
  min_rank: number;
  /** vide : ouverte à tous à partir de min_rank ; sinon réservée à ces membres */
  restricted_to?: string[];
  restricted_names?: string[];
  /** trame de test : visible du Conclave seulement */
  test_only?: boolean;
  steps: TrameStepDef[];
  started_at?: string | null;
  ended_at?: string | null;
  updated_at?: string;
}

export interface TrameRow {
  id: number;
  title: string;
  status: TrameStatus;
  shared: boolean;
  min_rank: number;
  steps: number;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string;
  participants: number;
  solves: number;
  restricted_names?: string[];
  test_only?: boolean;
  pending_reviews?: number;
}

export interface TrameAdmin {
  trame: TrameDef;
  progress: { index: number; attempts: number; participants: number; solvers: { name: string; at: string }[] }[];
  studies?: { id: number; step_index: number; target: number; roll: number; label: string; tone: string; success: boolean; created_at: string; member: string; rank: number }[];
  /** réponses libres en attente de validation */
  reviews?: { id: number; step_index: number; member: string; rank: number; text: string; created_at: string }[];
  log: {
    id: number;
    step_index: number;
    kind: TrameStepKind;
    answer: string | null;
    roll: number | null;
    label: string | null;
    tone: string | null;
    effect?: string | null;
    success: boolean;
    created_at: string;
    member: string;
    rank: number;
  }[];
}

export interface TramePlayerStep {
  index: number;
  kind: TrameStepKind;
  title: string;
  prompt_md: string;
  state: 'solved' | 'current';
  cipher_text?: string;
  attempts_used?: number;
  max_attempts?: number;
  seal_circle?: number;
  seal_svg?: string | null;
  fails_total?: number;
  required_rank?: number;
  allowed?: number;
  successes?: number;
  eligible?: boolean;
  rolls?: { roll: number; label: string; tone: string; effect: string }[];
  locks?: number;
  attempts_mode?: 'rank' | 'fixed';
  success_md?: string;
  solved_by?: string | null;
  // nouvelles épreuves
  reveal?: boolean;
  /** dernière réponse du joueur (pour la retrouver après un essai raté) */
  last?: { kanji?: string[]; order?: string[]; picks?: (string | number)[]; text?: string } | null;
  last_correct?: boolean | null;
  /** cases justes du dernier essai raté (si le Conclave l'autorise) */
  feedback?: boolean[] | null;
  slots?: (string | null)[];
  pool?: string[] | null;
  tiles?: string[];
  formula?: string[];
  lefts?: string[];
  rights?: string[];
  pairs?: { left: string; right: string }[];
  options?: string[];
  multiple?: boolean;
  correct?: number[];
  situations?: { text: string }[];
  seals?: { id: number; title: string; kanji: string | null }[];
  answers?: string[];
  submissions?: { text: string; status: 'pending' | 'approved' | 'refused'; note: string | null; at: string }[];
  pending?: boolean;
  /** rolls d'étude de l'étape */
  study?: TrameStudy;
  // mini-jeux
  rings?: { options: string[] }[];
  palette?: string[];
  length?: number;
  history?: { guess: string[]; exact: number; present: number }[];
  grid?: string[][];
  start?: number | null;
  path?: number[];
  items?: string[];
  sequence?: string[];
  signs?: boolean;
  show_seconds?: number;
  key?: { k: string; l: string | null }[];
  solution?: string;
}

export interface TrameSubmitResult {
  correct?: boolean;
  pending?: boolean;
  attempts_left: number;
  right?: number | null;
  total?: number | null;
  feedback?: boolean[] | null;
  /** résonance du sceau : bien placés, mal placés */
  exact?: number | null;
  present?: number | null;
}

export interface TrameView {
  trame: {
    id: number;
    title: string;
    intro_md: string;
    status: TrameStatus;
    shared: boolean;
    started_at: string | null;
    test_only?: boolean;
    restricted_names?: string[];
  };
  steps: TramePlayerStep[];
  total: number;
  remaining: number;
  complete: boolean;
}

export interface UnsealResult {
  roll: number;
  label: string;
  tone: string;
  effect: string;
  gained?: number;
  successes: number;
  needed: number;
  attempts_used: number;
  allowed: number;
  broken: boolean;
}

export type RequestStatus = 'draft' | 'pending' | 'approved' | 'refused';

export interface SealRequest {
  id: number;
  title: string;
  circle: number | null;
  kanji: string;
  description: string;
  content_md: string;
  icon_svg: string | null;
  status: RequestStatus;
  review_note: string;
  /** date d'envoi au Conclave (ou de création pour un brouillon) */
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  member: { id: string; name: string; rank: number; is_conclave: boolean } | null;
}

export type SuggestionKind = 'feature' | 'content' | 'trame' | 'bug' | 'other';
export type SuggestionStatus = 'new' | 'planned' | 'done' | 'refused';

export interface Suggestion {
  id: number;
  kind: SuggestionKind;
  title: string;
  body: string;
  status: SuggestionStatus;
  reply: string;
  replied_at: string | null;
  replied_by: string | null;
  author: string;
  mine: boolean;
  votes: number;
  voted: boolean;
  created_at: string;
  updated_at: string;
}

export interface MasteryPage {
  id: number;
  slug: string;
  title: string;
  kanji: string | null;
  icon_svg: string | null;
  badge: 'mj' | null;
  mastered: boolean;
}

export interface MasteryGroup {
  id: number;
  slug: string;
  name: string;
  glyph: string;
  pages: MasteryPage[];
}

export interface MemberMastery {
  id: number;
  slug: string;
  title: string;
  kanji: string | null;
  category: string;
  glyph: string;
  since: string;
}

export interface SealRequestInput {
  title: string;
  circle: number | null;
  kanji: string;
  description: string;
  content_md: string;
  icon_svg: string | null;
  /** true : la demande est gardée en brouillon au lieu d'être envoyée */
  draft?: boolean;
}

export type RollTone = 'crit-fail' | 'fail' | 'neutral' | 'success' | 'crit-success';

export interface RollTier {
  min: number;
  max: number;
  label: string;
  tone: RollTone;
  effect: string;
}

export interface RollTable {
  id: number | null;
  slug: string;
  name: string;
  description: string;
  tiers: RollTier[];
  position?: number;
  updated_at?: string;
}

export interface CodexPage {
  slug: string;
  title: string;
  kind: PageKind;
  kanji: string | null;
  badge: 'mj' | null;
  category: string;
  content_md: string;
}

export interface SlotVillage {
  village_id: number;
  name: string;
  cap: number;
  taken: number;
  occupants: { id: number; member_id: string; name: string; note: string }[] | null;
}

export interface SlotInfo {
  notes: string | null;
  total_cap: number;
  total_taken: number;
  villages: SlotVillage[];
}

export interface PageData {
  page: {
    id: number;
    slug: string;
    title: string;
    nav_title: string;
    kind: PageKind;
    badge: 'mj' | null;
    kanji: string | null;
    icon_svg: string | null;
    description: string;
    content_md: string;
    hidden: boolean;
    min_rank: number;
    updated_at: string;
    /** le shinobi connecté a coché ce sceau comme maîtrisé */
    mastered?: boolean;
    category: { slug: string; name: string; glyph: string; index_slug: string | null };
  };
  slot: SlotInfo | null;
  /** qui maîtrise ce sceau (Conclave seulement) */
  masters?: { id: string; name: string; rank: number }[] | null;
  children: {
    slug: string;
    title: string;
    description: string;
    badge: 'mj' | null;
    kanji: string | null;
    icon_svg: string | null;
    slotted: boolean;
    hidden: boolean;
    mastered?: boolean;
  }[] | null;
  related: { slug: string; title: string; kanji: string | null }[];
}

export interface AdminMember extends Member {
  active: boolean;
  locked: boolean;
  last_login_at: string | null;
  created_at: string;
  slots: number;
  /** nombre de sceaux maîtrisés */
  masteries?: number;
  is_me: boolean;
}

export interface AuditEntry {
  id: number;
  actor_name: string;
  action: string;
  target: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Overview {
  requests_pending: number;
  members: number;
  conclave: number;
  players: number;
  inactive: number;
  active_week: number;
  by_rank: { rank: number; count: number }[];
  pages: number;
  hidden: number;
  slotted: number;
  slot_taken: number;
  slot_total: number;
  recent: AuditEntry[];
}

export interface Village {
  id: number;
  name: string;
  position: number;
}

export interface AdminSeal {
  page_id: number;
  slug: string;
  title: string;
  badge: 'mj' | null;
  hidden: boolean;
  category: { slug: string; name: string; glyph: string };
  flagged: boolean;
  notes: string;
  caps: { village_id: number; cap: number }[];
  assignments: { id: number; village_id: number; member_id: string; member_name: string; note: string; assigned_at: string }[];
}

export interface AdminSlots {
  villages: Village[];
  members: { id: string; name: string; rank: number; is_conclave: boolean }[];
  seals: AdminSeal[];
}

export interface AdminPageRow {
  id: number;
  slug: string;
  title: string;
  kind: PageKind;
  badge: 'mj' | null;
  kanji: string | null;
  hidden: boolean;
  position: number;
  min_rank: number | null;
  category_id: number;
  category_name: string;
  category_glyph: string;
  slotted: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface EditablePage {
  id: number | null;
  category_id: number;
  slug: string;
  kind: PageKind;
  title: string;
  nav_title: string | null;
  description: string;
  badge: 'mj' | null;
  kanji: string | null;
  icon_svg: string | null;
  content_md: string;
  min_rank: number | null;
  hidden: boolean;
  position: number | null;
  updated_at?: string;
}

export interface AdminCategory {
  id: number | null;
  slug: string;
  name: string;
  glyph: string;
  tagline: string;
  min_rank: number;
  conclave_only: boolean;
  show_on_home: boolean;
  position: number;
  page_count?: number;
}

// ---------------------------------------------------------------------------
// Appels RPC
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  code: string;
  detail: string;
  constructor(code: string, message: string, detail = '') {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

const TOKEN_KEY = 'fuin.session';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible : la session ne survivra pas au rechargement */
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(fn: Listener) {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, withToken = true): Promise<T> {
  if (!isConfigured) throw new ApiError('CONFIG', 'Le site n’est pas encore relié à Supabase.');
  const params = withToken ? { p_token: getToken(), ...args } : args;
  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(params) });
  } catch {
    throw new ApiError('NETWORK', 'Impossible de joindre les archives. Vérifie ta connexion.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string; details?: string | null };
    const code = err.code || `HTTP${res.status}`;
    if (code === 'FU401') unauthorizedListeners.forEach((l) => l());
    let message = err.message || `Erreur ${res.status}.`;
    if (code === 'PGRST202') message = 'Fonction introuvable côté Supabase : as-tu bien exécuté supabase/schema.sql ?';
    if (res.status === 401 && !err.code) message = 'Clé Supabase refusée : vérifie VITE_SUPABASE_ANON_KEY.';
    throw new ApiError(code, message, err.details || '');
  }
  return data as T;
}

export const api = {
  login: (prenom: string, nom: string, password: string) =>
    rpc<{ ok: boolean; error?: string; token?: string; member?: Member }>(
      'fuin_login',
      { p_prenom: prenom, p_nom: nom, p_password: password },
      false,
    ),
  logout: () => rpc<{ ok: boolean }>('fuin_logout'),
  bootstrap: () => rpc<Bootstrap>('fuin_bootstrap'),
  page: (slug: string) => rpc<PageData>('fuin_page', { p_slug: slug }),
  memorial: () => rpc<MemorialEntry[]>('fuin_memorial'),
  memorialSave: (entry: MemorialEntry) => rpc<{ id: number }>('fuin_admin_memorial_save', { p_entry: entry }),
  memorialOwnSave: (entry: MemorialEntry) => rpc<{ id: number }>('fuin_memorial_own_save', { p_entry: entry }),
  memorialDelete: (id: number) => rpc<{ ok: boolean }>('fuin_admin_memorial_delete', { p_id: id }),
  memorialMove: (id: number, dir: -1 | 1) => rpc<{ ok: boolean }>('fuin_admin_memorial_move', { p_id: id, p_dir: dir }),
  changePassword: (oldPw: string, newPw: string) =>
    rpc<{ ok: boolean; error?: string }>('fuin_change_password', { p_old: oldPw, p_new: newPw }),

  // Conclave
  overview: () => rpc<Overview>('fuin_admin_overview'),
  members: () => rpc<AdminMember[]>('fuin_admin_members'),
  memberCreate: (prenom: string, nom: string, rank: number, isConclave: boolean, password: string | null) =>
    rpc<{ member: Member; password: string }>('fuin_admin_member_create', {
      p_prenom: prenom,
      p_nom: nom,
      p_rank: rank,
      p_is_conclave: isConclave,
      p_password: password,
    }),
  memberUpdate: (id: string, prenom: string, nom: string, rank: number, isConclave: boolean) =>
    rpc<Member>('fuin_admin_member_update', {
      p_id: id,
      p_prenom: prenom,
      p_nom: nom,
      p_rank: rank,
      p_is_conclave: isConclave,
    }),
  memberPassword: (id: string, password: string | null) =>
    rpc<{ member: Member; password: string }>('fuin_admin_member_password', { p_id: id, p_password: password }),
  memberDelete: (id: string) => rpc<{ ok: boolean }>('fuin_admin_member_delete', { p_id: id }),

  slots: () => rpc<AdminSlots>('fuin_admin_slots'),
  villageSave: (id: number | null, name: string) => rpc<{ id: number }>('fuin_admin_village_save', { p_id: id, p_name: name }),
  villageDelete: (id: number) => rpc<{ ok: boolean }>('fuin_admin_village_delete', { p_id: id }),
  slotFlag: (pageId: number, flag: boolean) => rpc<{ ok: boolean }>('fuin_admin_slot_flag', { p_page_id: pageId, p_flag: flag }),
  slotCaps: (pageId: number, caps: Record<number, number>) =>
    rpc<{ ok: boolean }>('fuin_admin_slot_caps', { p_page_id: pageId, p_caps: caps }),
  slotNotes: (pageId: number, notes: string) => rpc<{ ok: boolean }>('fuin_admin_slot_notes', { p_page_id: pageId, p_notes: notes }),
  slotAssign: (pageId: number, villageId: number, memberId: string, note: string) =>
    rpc<{ ok: boolean }>('fuin_admin_slot_assign', {
      p_page_id: pageId,
      p_village_id: villageId,
      p_member_id: memberId,
      p_note: note,
    }),
  slotUnassign: (assignmentId: number) => rpc<{ ok: boolean }>('fuin_admin_slot_unassign', { p_assignment_id: assignmentId }),

  pages: () => rpc<AdminPageRow[]>('fuin_admin_pages'),
  pageGet: (id: number) => rpc<EditablePage>('fuin_admin_page', { p_id: id }),
  pageSave: (page: EditablePage) => rpc<{ id: number; slug: string }>('fuin_admin_page_save', { p_page: page }),
  pageDelete: (id: number) => rpc<{ ok: boolean }>('fuin_admin_page_delete', { p_id: id }),

  categories: () => rpc<AdminCategory[]>('fuin_admin_categories'),
  categorySave: (cat: AdminCategory) => rpc<{ id: number }>('fuin_admin_category_save', { p_cat: cat }),
  categoryDelete: (id: number) => rpc<{ ok: boolean }>('fuin_admin_category_delete', { p_id: id }),

  audit: (limit = 200) => rpc<AuditEntry[]>('fuin_admin_audit', { p_limit: limit }),

  // Demandes de création de sceau
  myRequests: () => rpc<SealRequest[]>('fuin_requests_mine'),
  masteries: () => rpc<MasteryGroup[]>('fuin_masteries_mine'),
  // Suggestions pour le site
  suggestions: () => rpc<Suggestion[]>('fuin_suggestions'),
  suggestionSave: (s: { id?: number; kind: SuggestionKind; title: string; body: string }) => rpc<Suggestion>('fuin_suggestion_save', { p_s: s }),
  suggestionDelete: (id: number) => rpc<{ ok: boolean }>('fuin_suggestion_delete', { p_id: id }),
  suggestionVote: (id: number, on: boolean) => rpc<{ votes: number; voted: boolean }>('fuin_suggestion_vote', { p_id: id, p_on: on }),
  suggestionAnswer: (id: number, status: SuggestionStatus, reply: string) =>
    rpc<Suggestion>('fuin_admin_suggestion_answer', { p_id: id, p_status: status, p_reply: reply }),
  masterySet: (pageId: number, on: boolean) => rpc<{ ok: boolean; mastered: boolean; total: number }>('fuin_mastery_set', { p_page_id: pageId, p_on: on }),
  memberMasteries: (memberId: string) => rpc<MemberMastery[]>('fuin_admin_member_masteries', { p_member_id: memberId }),
  requestSubmit: (req: SealRequestInput) => rpc<{ id: number }>('fuin_request_submit', { p_req: req }),
  requestWithdraw: (id: number) => rpc<{ ok: boolean }>('fuin_request_withdraw', { p_id: id }),
  requestUpdate: (id: number, req: SealRequestInput) => rpc<{ ok: boolean; status: RequestStatus }>('fuin_request_update', { p_id: id, p_req: req }),
  requestCancel: (id: number) => rpc<{ ok: boolean }>('fuin_request_cancel', { p_id: id }),
  requestSend: (id: number) => rpc<{ ok: boolean }>('fuin_request_send', { p_id: id }),
  adminRequests: () => rpc<SealRequest[]>('fuin_admin_requests'),
  requestReview: (id: number, decision: 'approved' | 'refused', note: string) =>
    rpc<{ ok: boolean }>('fuin_admin_request_review', { p_id: id, p_decision: decision, p_note: note }),

  // Outils de trame
  codex: () => rpc<CodexPage[]>('fuin_admin_codex'),
  rollTables: () => rpc<RollTable[]>('fuin_admin_roll_tables'),
  rollTableSave: (t: RollTable) => rpc<{ id: number }>('fuin_admin_roll_table_save', { p_table: t }),
  rollTableDelete: (id: number) => rpc<{ ok: boolean }>('fuin_admin_roll_table_delete', { p_id: id }),

  // Trames
  trameView: (id: number) => rpc<TrameView>('fuin_trame_view', { p_id: id }),
  trameAnswer: (id: number, step: number, answer: string) =>
    rpc<{ correct: boolean; attempts_left: number }>('fuin_trame_answer', { p_id: id, p_step: step, p_answer: answer }),
  trameUnseal: (id: number, step: number) => rpc<UnsealResult>('fuin_trame_unseal', { p_id: id, p_step: step }),
  trameSubmit: (id: number, step: number, payload: Record<string, unknown>) =>
    rpc<TrameSubmitResult>('fuin_trame_submit', { p_id: id, p_step: step, p_payload: payload }),
  trameStudy: (id: number, step: number, target: number) =>
    rpc<TrameStudyResult>('fuin_trame_study', { p_id: id, p_step: step, p_target: target }),
  trameReview: (attemptId: number, ok: boolean, note: string) =>
    rpc<{ ok: boolean }>('fuin_admin_trame_review', { p_attempt: attemptId, p_ok: ok, p_note: note }),
  adminTrames: () => rpc<TrameRow[]>('fuin_admin_trames'),
  adminTrame: (id: number) => rpc<TrameAdmin>('fuin_admin_trame', { p_id: id }),
  trameSave: (t: TrameDef) => rpc<{ id: number }>('fuin_admin_trame_save', { p_trame: t }),
  trameStatus: (id: number, action: 'start' | 'end' | 'reset') =>
    rpc<{ ok: boolean }>('fuin_admin_trame_status', { p_id: id, p_action: action }),
  trameDelete: (id: number) => rpc<{ ok: boolean }>('fuin_admin_trame_delete', { p_id: id }),
};

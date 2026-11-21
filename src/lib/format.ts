export const RANKS = [1, 2, 3, 4, 5] as const;

export function circleLabel(rank: number): string {
  return rank === 1 ? '1er cercle' : `${rank}ème cercle`;
}

export function rankTitle(rank: number, isConclave = false): string {
  if (isConclave) return 'Conclave';
  if (rank >= 5) return 'Grand Maître Fuin';
  if (rank === 4) return 'Maître Fuin';
  return circleLabel(rank);
}

export const RANK_KANJI = ['', '一', '二', '三', '四', '五'];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'jamais';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`;
  return formatDate(iso);
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function slugify(s: string): string {
  return normalize(s)
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export const AUDIT_LABELS: Record<string, string> = {
  'member.create': 'a inscrit',
  'member.update': 'a modifié',
  'member.password': 'a régénéré le mot de passe de',
  'member.self_password': 'a changé son mot de passe',
  'member.delete': 'a supprimé',
  'page.create': 'a créé la fiche',
  'page.update': 'a modifié la fiche',
  'page.delete': 'a supprimé la fiche',
  'category.save': 'a modifié la catégorie',
  'category.delete': 'a supprimé la catégorie',
  'village.add': 'a ajouté le village',
  'village.rename': 'a renommé un village en',
  'village.delete': 'a supprimé le village',
  'slot.flag': 'a slotté',
  'slot.unflag': 'a retiré des slots',
  'slot.caps': 'a fixé les places de',
  'slot.assign': 'a attribué un slot de',
  'slot.unassign': 'a libéré un slot de',
  'request.create': 'a proposé le sceau',
  'request.withdraw': 'a retiré sa demande',
  'request.approve': 'a validé la demande',
  'request.refuse': 'a refusé la demande',
  'rolltable.save': 'a modifié la table de roll',
  'rolltable.delete': 'a supprimé la table de roll',
  'trame.save': 'a modifié la trame',
  'trame.start': 'a ouvert la trame',
  'trame.end': 'a terminé la trame',
  'trame.reset': 'a remis à zéro la trame',
  'trame.delete': 'a supprimé la trame',
  'request.draft': 'a gardé en brouillon le sceau',
  'request.update': 'a modifié sa demande',
  'request.cancel': 'a annulé sa demande',
  'memorial.own_update': 'a modifié sa fiche du mémorial',
  'mastery.add': 'maîtrise désormais',
  'mastery.remove': 'ne coche plus',
  'trame.approve': 'a validé une réponse de la trame',
  'trame.refuse': 'a refusé une réponse de la trame',
};

export function canRequest(m: { rank: number; is_conclave: boolean } | null): boolean {
  return !!m && (m.is_conclave || m.rank >= 3);
}

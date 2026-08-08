import type { Article } from './types.js';

export const BACKUP_FORMAT = 'pagefold.backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  articles: Article[];
}

export function makeBackup(articles: readonly Article[], now: number): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    articles: [...articles],
  };
}

export class BackupError extends Error {}

/**
 * Parse a backup file.
 *
 * Everything is validated rather than trusted. The file arrives from the
 * user's disk, so it may be truncated, hand-edited, or a completely different
 * JSON file picked by mistake, and importing junk into the archive is worse
 * than refusing the file with a reason.
 */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not valid JSON.');
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new BackupError('That file does not look like a Pagefold backup.');
  }
  const obj = raw as Record<string, unknown>;

  if (obj.format !== BACKUP_FORMAT) {
    throw new BackupError('That file does not look like a Pagefold backup.');
  }
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    throw new BackupError(
      `That backup was made by a newer version of Pagefold (format ${String(obj.version)}).`
    );
  }
  if (!Array.isArray(obj.articles) || obj.articles.length === 0) {
    throw new BackupError('That backup has no articles in it.');
  }

  const articles: Article[] = [];
  for (const entry of obj.articles) {
    const article = coerceArticle(entry);
    if (article) articles.push(article);
  }

  // Distinct from the empty case above: the file did contain entries, they
  // were just all unreadable. Telling the user which it was is the difference
  // between "wrong file" and "damaged file".
  if (!articles.length) {
    throw new BackupError('None of the articles in that backup could be read.');
  }

  return {
    format: BACKUP_FORMAT,
    version: obj.version,
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : Date.now(),
    articles,
  };
}

/**
 * Accept one entry, or reject it.
 *
 * Skipping a malformed row beats failing the whole import: a backup with one
 * bad entry is usually still worth restoring, and the count shown afterwards
 * tells the user if anything was dropped.
 */
function coerceArticle(entry: unknown): Article | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const o = entry as Record<string, unknown>;

  if (typeof o.id !== 'string' || !o.id) return null;
  if (typeof o.url !== 'string' || !o.url) return null;
  if (!Array.isArray(o.paragraphs)) return null;

  const paragraphs = o.paragraphs.filter((p): p is string => typeof p === 'string');

  return {
    id: o.id,
    url: o.url,
    title: typeof o.title === 'string' && o.title ? o.title : 'Untitled',
    byline: typeof o.byline === 'string' ? o.byline : '',
    site: typeof o.site === 'string' ? o.site : '',
    paragraphs,
    savedAt: typeof o.savedAt === 'number' ? o.savedAt : Date.now(),
    wordCount: typeof o.wordCount === 'number' ? o.wordCount : 0,
    read: o.read === true,
    progress: typeof o.progress === 'number' ? clamp01(o.progress) : 0,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Merge an imported set into what is already saved.
 *
 * Existing entries win on read state and progress, for the same reason a
 * re-save keeps them: that state belongs to the reader. Anything genuinely new
 * is added.
 */
export function mergeImport(
  existing: readonly Article[],
  incoming: readonly Article[]
): { merged: Article[]; added: number; updated: number } {
  const byId = new Map(existing.map((a) => [a.id, a]));
  let added = 0;
  let updated = 0;

  for (const article of incoming) {
    const current = byId.get(article.id);
    if (!current) {
      byId.set(article.id, article);
      added++;
    } else {
      byId.set(article.id, {
        ...article,
        read: current.read || article.read,
        progress: Math.max(current.progress, article.progress),
      });
      updated++;
    }
  }

  return { merged: [...byId.values()], added, updated };
}

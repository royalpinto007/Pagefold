import {
  allArticles,
  deleteArticle,
  putArticle,
  replaceAll,
  clearAll,
  usageBytes,
} from './src/db.js';
import { applyFilters, excerptFor, parseQuery } from './src/search.js';
import { bucketOf, compactCount, formatBytes, readingLabel } from './src/format.js';
import { readingMinutes } from './src/article.js';
import { makeBackup, parseBackup, mergeImport, BackupError } from './src/backup.js';
import type { Article, Filters } from './src/types.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element: ${id}`);
  return el as T;
};

const els = {
  count: $('count'),
  toolbar: $('toolbar'),
  list: $('list'),
  save: $<HTMLButtonElement>('save-btn'),
  search: $<HTMLInputElement>('search'),
  sort: $<HTMLSelectElement>('sort'),
  unreadOnly: $<HTMLInputElement>('unread-only'),
  reader: $('reader'),
  readerBody: $('reader-body'),
  back: $('back-btn'),
  readToggle: $<HTMLButtonElement>('read-toggle'),
  openOriginal: $<HTMLAnchorElement>('open-original'),
  del: $('delete-btn'),
  settings: $('settings'),
  settingsBtn: $('settings-btn'),
  settingsBack: $('settings-back'),
  storageLine: $('storage-line'),
  exportBtn: $('export-btn'),
  importBtn: $('import-btn'),
  importFile: $<HTMLInputElement>('import-file'),
  clearBtn: $('clear-btn'),
  toast: $('toast'),
};

let archive: Article[] = [];
let open: Article | null = null;

const filters: Filters = { query: '', sort: 'newest', unreadOnly: false };

/** Text nodes only. Article text comes from arbitrary pages, so it is never
 *  interpolated into markup: a title containing a tag would otherwise render
 *  as one, inside the extension's own privileged page. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let toastTimer: number | undefined;
function toast(message: string): void {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), 2600);
}

async function refresh(): Promise<void> {
  archive = await allArticles();
  render();
}

function render(): void {
  const rows = applyFilters(archive, filters);
  const terms = parseQuery(filters.query);

  els.count.textContent = archive.length ? compactCount(archive.length) : '';
  els.list.replaceChildren();

  if (!rows.length) {
    const empty = el('div', 'empty');
    empty.append(
      el('strong', undefined, archive.length ? 'Nothing matches' : 'Nothing saved yet'),
      el(
        'span',
        undefined,
        archive.length
          ? 'Try a different word, or clear the search.'
          : 'Open an article and press Save this page. It stays readable with no connection.'
      )
    );
    els.list.append(empty);
    return;
  }

  const now = Date.now();
  let bucket = '';
  for (const article of rows) {
    // Buckets only make sense while the list is in date order.
    if (filters.sort === 'newest' || filters.sort === 'oldest') {
      const next = bucketOf(article.savedAt, now);
      if (next !== bucket) {
        bucket = next;
        els.list.append(el('div', 'bucket', next));
      }
    }
    els.list.append(card(article, terms));
  }
}

function card(article: Article, terms: readonly string[]): HTMLElement {
  const button = el('button', `card${article.read ? '' : ' unread'}`);
  button.append(el('div', 'card-title', article.title));

  const meta = el('div', 'card-meta');
  meta.append(
    el('span', undefined, article.site || 'saved page'),
    el('span', undefined, '·'),
    el('span', undefined, readingLabel(readingMinutes(article.wordCount)))
  );
  if (article.byline) {
    meta.append(el('span', undefined, '·'), el('span', undefined, article.byline));
  }
  button.append(meta);

  const excerpt = excerptFor(article, terms);
  if (excerpt) button.append(el('div', 'card-excerpt', excerpt));

  button.addEventListener('click', () => openReader(article));
  return button;
}

function openReader(article: Article): void {
  open = article;
  els.readerBody.replaceChildren();

  els.readerBody.append(el('h1', undefined, article.title));
  const meta = [article.site, article.byline, readingLabel(readingMinutes(article.wordCount))]
    .filter(Boolean)
    .join(' · ');
  els.readerBody.append(el('div', 'reader-meta', meta));
  for (const paragraph of article.paragraphs) {
    els.readerBody.append(el('p', undefined, paragraph));
  }

  els.openOriginal.href = article.url;
  els.readToggle.textContent = article.read ? 'Mark unread' : 'Mark read';
  els.reader.hidden = false;
  els.readerBody.scrollTop = article.progress * els.readerBody.scrollHeight;
  els.readerBody.focus();
}

function closeReader(): void {
  open = null;
  els.reader.hidden = true;
}

/** Remember roughly where the reader stopped, so reopening lands in place. */
function trackProgress(): void {
  if (!open) return;
  const { scrollTop, scrollHeight, clientHeight } = els.readerBody;
  const max = scrollHeight - clientHeight;
  open.progress = max > 0 ? Math.min(1, scrollTop / max) : 0;
  void putArticle(open);
}

/**
 * activeTab is granted when the user acts on the extension itself: the context
 * menu, the keyboard shortcut, the toolbar icon. A button inside the side
 * panel is not one of those, so saving from here needs host access.
 *
 * It is requested on first use rather than declared at install, so the install
 * prompt stays quiet and anyone who only ever uses the shortcut is never asked
 * at all. The request has to happen in the click handler, because Chrome
 * requires a user gesture.
 */
async function ensurePageAccess(): Promise<boolean> {
  const needed = { origins: ['<all_urls>'] };
  if (await chrome.permissions.contains(needed)) return true;
  try {
    return await chrome.permissions.request(needed);
  } catch {
    return false;
  }
}

async function save(): Promise<void> {
  if (!(await ensurePageAccess())) {
    toast('Pagefold needs permission to read the page. You can also use Alt+Shift+S.');
    return;
  }

  els.save.disabled = true;
  els.save.textContent = 'Saving…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SAVE_ACTIVE_TAB' });
    if (result?.ok) {
      toast(result.updated ? `Updated “${result.title}”` : `Saved “${result.title}”`);
      await refresh();
    } else {
      toast(result?.error ?? 'Could not save this page.');
    }
  } catch {
    toast('Could not reach the extension. Try reloading it.');
  } finally {
    els.save.disabled = false;
    els.save.textContent = 'Save this page';
  }
}

async function showSettings(): Promise<void> {
  els.settings.hidden = false;
  const bytes = await usageBytes();
  els.storageLine.textContent = `${archive.length} article${archive.length === 1 ? '' : 's'} saved, using about ${formatBytes(bytes)}.`;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function wire(): void {
  els.save.addEventListener('click', () => void save());

  els.search.addEventListener('input', () => {
    filters.query = els.search.value;
    render();
  });
  els.sort.addEventListener('change', () => {
    filters.sort = els.sort.value as Filters['sort'];
    render();
  });
  els.unreadOnly.addEventListener('change', () => {
    filters.unreadOnly = els.unreadOnly.checked;
    render();
  });

  els.back.addEventListener('click', closeReader);
  els.readerBody.addEventListener('scroll', trackProgress, { passive: true });

  els.readToggle.addEventListener('click', () => {
    if (!open) return;
    open.read = !open.read;
    els.readToggle.textContent = open.read ? 'Mark unread' : 'Mark read';
    void putArticle(open).then(refresh);
  });

  els.del.addEventListener('click', () => {
    if (!open) return;
    const id = open.id;
    const title = open.title;
    closeReader();
    void deleteArticle(id).then(refresh);
    toast(`Deleted “${title}”`);
  });

  els.settingsBtn.addEventListener('click', () => void showSettings());
  els.settingsBack.addEventListener('click', () => {
    els.settings.hidden = true;
  });

  els.exportBtn.addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`pagefold-${stamp}.json`, JSON.stringify(makeBackup(archive, Date.now()), null, 2));
    toast(`Exported ${archive.length} article${archive.length === 1 ? '' : 's'}`);
  });

  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', async () => {
    const file = els.importFile.files?.[0];
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      const { merged, added, updated } = mergeImport(archive, backup.articles);
      await replaceAll(merged);
      await refresh();
      toast(`Imported ${added} new, updated ${updated}`);
    } catch (error) {
      toast(error instanceof BackupError ? error.message : 'That file could not be imported.');
    } finally {
      // Reset, so choosing the same file again still fires a change event.
      els.importFile.value = '';
    }
  });

  els.clearBtn.addEventListener('click', () => {
    if (!confirm(`Delete all ${archive.length} saved articles? This cannot be undone.`)) return;
    void clearAll().then(refresh);
    toast('Archive cleared');
  });

  // The worker saves when the panel is closed, so refresh when it says so.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'ARCHIVE_CHANGED') void refresh();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!els.settings.hidden) els.settings.hidden = true;
      else if (!els.reader.hidden) closeReader();
    }
  });
}

wire();
void refresh();

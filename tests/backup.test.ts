import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BackupError, makeBackup, mergeImport, parseBackup } from '../src/backup.js';
import type { Article } from '../src/types.js';

function article(over: Partial<Article> = {}): Article {
  return {
    id: over.id ?? 'https://example.com/a',
    url: 'https://example.com/a',
    title: 'A piece',
    byline: '',
    site: 'example.com',
    paragraphs: ['body text'],
    savedAt: 1000,
    wordCount: 2,
    read: false,
    progress: 0,
    ...over,
  };
}

describe('round trip', () => {
  test('exporting and importing preserves the archive', () => {
    const original = [article({ id: 'a' }), article({ id: 'b', read: true, progress: 0.5 })];
    const parsed = parseBackup(JSON.stringify(makeBackup(original, 5000)));
    assert.deepEqual(parsed.articles, original);
  });
});

describe('parseBackup rejects bad input with a reason', () => {
  test('not JSON', () => {
    assert.throws(() => parseBackup('{nope'), BackupError);
  });

  test('valid JSON but a different file', () => {
    assert.throws(() => parseBackup('{"some":"other file"}'), BackupError);
  });

  test('a newer format version, rather than silently mangling it', () => {
    const future = JSON.stringify({
      format: 'pagefold.backup',
      version: 99,
      articles: [article()],
    });
    assert.throws(() => parseBackup(future), /newer version/);
  });

  test('an empty archive', () => {
    const empty = JSON.stringify({ format: 'pagefold.backup', version: 1, articles: [] });
    assert.throws(() => parseBackup(empty), /no articles/);
  });

  test('entries present but all unreadable says so, which is a different problem', () => {
    // "wrong file" and "damaged file" need different messages, or the user
    // cannot tell whether to go looking for a better copy.
    const damaged = JSON.stringify({
      format: 'pagefold.backup',
      version: 1,
      articles: [null, 'nope', { id: '' }],
    });
    assert.throws(() => parseBackup(damaged), /None of the articles/);
  });
});

describe('parseBackup tolerates partial damage', () => {
  test('skips malformed entries but keeps the good ones', () => {
    const mixed = JSON.stringify({
      format: 'pagefold.backup',
      version: 1,
      articles: [
        article({ id: 'good' }),
        { id: '', url: 'https://x.com' }, // no id
        { id: 'x', url: '' }, // no url
        null,
        'not an object',
        { id: 'y', url: 'https://y.com', paragraphs: 'not an array' },
      ],
    });
    const parsed = parseBackup(mixed);
    assert.equal(parsed.articles.length, 1);
    assert.equal(parsed.articles[0]?.id, 'good');
  });

  test('fills in missing optional fields rather than dropping the row', () => {
    const sparse = JSON.stringify({
      format: 'pagefold.backup',
      version: 1,
      articles: [{ id: 'a', url: 'https://a.com', paragraphs: ['x'] }],
    });
    const [only] = parseBackup(sparse).articles;
    assert.equal(only?.title, 'Untitled');
    assert.equal(only?.read, false);
    assert.equal(only?.progress, 0);
  });

  test('clamps a nonsense progress value into range', () => {
    const odd = JSON.stringify({
      format: 'pagefold.backup',
      version: 1,
      articles: [{ id: 'a', url: 'https://a.com', paragraphs: ['x'], progress: 42 }],
    });
    assert.equal(parseBackup(odd).articles[0]?.progress, 1);
  });
});

describe('mergeImport', () => {
  test('adds new articles and reports the counts', () => {
    const result = mergeImport([article({ id: 'a' })], [article({ id: 'b' })]);
    assert.equal(result.added, 1);
    assert.equal(result.updated, 0);
    assert.equal(result.merged.length, 2);
  });

  test('keeps local read state when the imported copy is unread', () => {
    // The reader read it here; a stale backup should not undo that.
    const local = [article({ id: 'a', read: true, progress: 0.8 })];
    const incoming = [article({ id: 'a', read: false, progress: 0 })];
    const { merged, updated } = mergeImport(local, incoming);
    assert.equal(updated, 1);
    assert.equal(merged[0]?.read, true);
    assert.equal(merged[0]?.progress, 0.8);
  });

  test('takes the further progress of the two', () => {
    const local = [article({ id: 'a', progress: 0.2 })];
    const incoming = [article({ id: 'a', progress: 0.7 })];
    assert.equal(mergeImport(local, incoming).merged[0]?.progress, 0.7);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  articleId,
  siteOf,
  countWords,
  readingMinutes,
  toArticle,
  mergeResave,
} from '../src/article.js';

describe('articleId', () => {
  test('strips tracking parameters so a shared link matches a direct visit', () => {
    const direct = articleId('https://example.com/post');
    const shared = articleId('https://example.com/post?utm_source=twitter&utm_medium=social');
    assert.equal(shared, direct);
  });

  test('strips the fragment, so a deep link is the same document', () => {
    assert.equal(
      articleId('https://example.com/post#section-3'),
      articleId('https://example.com/post')
    );
  });

  test('keeps parameters that identify the document', () => {
    // ?id=5 selects which article; dropping it would merge unrelated pages.
    assert.notEqual(
      articleId('https://example.com/read?id=5'),
      articleId('https://example.com/read')
    );
  });

  test('is order independent for query parameters', () => {
    assert.equal(articleId('https://x.com/a?b=2&a=1'), articleId('https://x.com/a?a=1&b=2'));
  });

  test('treats a trailing slash as the same page', () => {
    assert.equal(articleId('https://example.com/post/'), articleId('https://example.com/post'));
  });

  test('falls back to the raw string rather than losing an unparseable save', () => {
    assert.equal(articleId('not a url'), 'not a url');
  });
});

describe('siteOf', () => {
  test('drops www', () => {
    assert.equal(siteOf('https://www.example.com/a'), 'example.com');
  });
  test('returns empty for a non-URL rather than throwing', () => {
    assert.equal(siteOf('nonsense'), '');
  });
});

describe('countWords and readingMinutes', () => {
  test('counts across paragraphs, ignoring blank ones', () => {
    assert.equal(countWords(['one two three', '', '  ', 'four five']), 5);
  });

  test('never reports less than a minute', () => {
    assert.equal(readingMinutes(0), 1);
    assert.equal(readingMinutes(12), 1);
  });

  test('rounds to the nearest minute at 220 words per minute', () => {
    assert.equal(readingMinutes(220), 1);
    assert.equal(readingMinutes(1100), 5);
  });
});

describe('toArticle', () => {
  const extracted = {
    url: 'https://www.example.com/piece?utm_source=rss',
    title: '  A Title  ',
    byline: ' Jane Doe ',
    paragraphs: ['  first para  ', '', 'second para'],
  };

  test('normalises the record it stores', () => {
    const article = toArticle(extracted, 1_700_000_000_000);
    assert.equal(article.title, 'A Title');
    assert.equal(article.byline, 'Jane Doe');
    assert.equal(article.site, 'example.com');
    assert.deepEqual(article.paragraphs, ['first para', 'second para']);
    assert.equal(article.wordCount, 4);
    assert.equal(article.read, false);
    assert.equal(article.progress, 0);
  });

  test('falls back to the site, then Untitled, when there is no title', () => {
    assert.equal(toArticle({ ...extracted, title: '' }, 0).title, 'example.com');
    assert.equal(toArticle({ ...extracted, title: '', url: 'bad' }, 0).title, 'Untitled');
  });
});

describe('mergeResave', () => {
  test('refreshes the document but keeps the reader state', () => {
    const existing = toArticle(
      { url: 'https://e.com/a', title: 'Old', byline: '', paragraphs: ['old body'] },
      100
    );
    existing.read = true;
    existing.progress = 0.62;

    const incoming = toArticle(
      { url: 'https://e.com/a', title: 'New', byline: '', paragraphs: ['new body'] },
      500
    );
    const merged = mergeResave(existing, incoming);

    assert.equal(merged.title, 'New', 'the document should be refreshed');
    assert.deepEqual(merged.paragraphs, ['new body']);
    // Read state belongs to the reader, not the document: silently marking
    // something unread again is worse than a slightly stale flag.
    assert.equal(merged.read, true);
    assert.equal(merged.progress, 0.62);
    assert.equal(merged.savedAt, 100, 'the original save time is when it entered the archive');
  });
});

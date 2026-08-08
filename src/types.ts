/** A saved article, exactly as it is stored on the device. */
export interface Article {
  /** Stable id derived from the URL, so re-saving a page updates rather than duplicates. */
  id: string;
  url: string;
  title: string;
  /** Author or site name when the page declares one. Empty string when it does not. */
  byline: string;
  /** Hostname only, for display and grouping. */
  site: string;
  /** The readable body, as plain-text paragraphs. No markup is stored. */
  paragraphs: string[];
  /** Milliseconds since the epoch. */
  savedAt: number;
  /** Words in the body, computed once at save time. */
  wordCount: number;
  /** Marked read by the user. */
  read: boolean;
  /** 0 to 1. How far down the reader was scrolled when last open. */
  progress: number;
}

/** What the content script hands back before storage fills in the rest. */
export interface Extracted {
  url: string;
  title: string;
  byline: string;
  paragraphs: string[];
}

export type SortOrder = 'newest' | 'oldest' | 'longest' | 'shortest';

export interface Filters {
  query: string;
  sort: SortOrder;
  unreadOnly: boolean;
}

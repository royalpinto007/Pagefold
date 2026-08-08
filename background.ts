import { toArticle, mergeResave } from './src/article.js';
import { getArticle, putArticle } from './src/db.js';
import type { Extracted } from './src/types.js';

/**
 * The service worker owns storage.
 *
 * Saving has to work when the side panel is closed, which it is for the
 * keyboard shortcut and the context menu, so the write cannot live in the
 * panel. MV3 evicts this worker aggressively, so every listener is registered
 * at the top level on each start rather than inside an onInstalled callback.
 */

const SAVE_MENU_ID = 'pagefold-save';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create(
    { id: SAVE_MENU_ID, title: 'Save this page to Pagefold', contexts: ['page', 'selection'] },
    // Re-creating an existing menu id throws; swallowing it keeps a reinstall
    // from leaving the worker in a failed state.
    () => void chrome.runtime.lastError
  );
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === SAVE_MENU_ID && tab?.id !== undefined) void saveTab(tab.id);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'save-page') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const id = tabs[0]?.id;
    if (id !== undefined) void saveTab(id);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SAVE_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs[0]?.id;
      if (id === undefined) {
        sendResponse({ ok: false, error: 'No active tab.' });
        return;
      }
      saveTab(id).then(sendResponse, (error: unknown) =>
        sendResponse({ ok: false, error: describe(error) })
      );
    });
    // Keeps the message channel open for the async response above.
    return true;
  }
  return undefined;
});

export interface SaveResult {
  ok: boolean;
  title?: string;
  updated?: boolean;
  error?: string;
}

/**
 * Read a tab and store it.
 *
 * The extractor is injected rather than declared as a content script, so the
 * extension holds no standing access to any page: it runs only on the tab the
 * user asked to save, at the moment they ask.
 */
async function saveTab(tabId: number): Promise<SaveResult> {
  let extracted: Extracted;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['dist/extract.js'] });
    // Second hop reads what the bundle parked on window and clears it, so the
    // page is left exactly as it was found.
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const result = window.__pagefoldExtracted;
        delete window.__pagefoldExtracted;
        return result;
      },
    });
    extracted = injection?.result as Extracted;
  } catch (error) {
    // Chrome blocks injection into its own pages and the web store.
    return { ok: false, error: `This page cannot be saved (${describe(error)}).` };
  }

  if (!extracted?.paragraphs?.length) {
    return { ok: false, error: 'No readable article was found on this page.' };
  }

  const article = toArticle(extracted, Date.now());
  const existing = await getArticle(article.id);
  await putArticle(existing ? mergeResave(existing, article) : article);

  await notifyPanel();
  return { ok: true, title: article.title, updated: Boolean(existing) };
}

async function notifyPanel(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'ARCHIVE_CHANGED' });
  } catch {
    // Nothing is listening when the panel is closed. That is the normal case.
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { saveTab };

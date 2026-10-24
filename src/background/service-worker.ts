import { handleRequest } from './handlers';
import { ensureStoreVersion } from './lifecycle';
import { onPageNavigation, onTabRemoved } from './navigation';

function report(task: Promise<void>): void {
  task.catch((error: unknown) => {
    // Never log URLs or page content. The error name is enough for debugging.
    console.error('wait-a-moment:', error instanceof Error ? error.name : 'unknown error');
  });
}

// Only the main frame is inspected. Subframes never trigger an interception.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) report(onPageNavigation(details.tabId, details.url, 'before'));
});
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) report(onPageNavigation(details.tabId, details.url, 'commit'));
});
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) report(onPageNavigation(details.tabId, details.url, 'spa'));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  report(onTabRemoved(tabId));
});

chrome.runtime.onInstalled.addListener(() => {
  report(ensureStoreVersion());
});
chrome.runtime.onStartup.addListener(() => {
  report(ensureStoreVersion());
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  void handleRequest(message).then(sendResponse);
  return true;
});

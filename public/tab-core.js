/** Pure tab ordering helpers shared with the Node test suite. */
export function reorderTabsWithinGroup(tabs, source, target, after = false) {
  if (!Array.isArray(tabs) || !source || !target || source === target) return tabs;
  const from = tabs.indexOf(source);
  const targetIndex = tabs.indexOf(target);
  if (from < 0 || targetIndex < 0 || Boolean(source.pinned) !== Boolean(target.pinned)) return tabs;
  const next = [...tabs];
  let to = targetIndex + (after ? 1 : 0);
  next.splice(from, 1);
  if (from < to) to -= 1;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, source);
  return next;
}

export function setTabPinOrder(tabs, tab, pinned) {
  if (!Array.isArray(tabs) || !tab || !tabs.includes(tab)) return tabs;
  tab.pinned = Boolean(pinned);
  const remaining = tabs.filter((item) => item !== tab);
  const pinnedTabs = remaining.filter((item) => item.pinned);
  const unpinnedTabs = remaining.filter((item) => !item.pinned);
  if (tab.pinned) pinnedTabs.push(tab);
  else unpinnedTabs.push(tab);
  return [...pinnedTabs, ...unpinnedTabs];
}

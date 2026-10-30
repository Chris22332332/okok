import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderTabsWithinGroup, setTabPinOrder } from '../public/tab-core.js';

const makeTabs = () => [
  { id: 'a', pinned: true },
  { id: 'd', pinned: true },
  { id: 'b', pinned: false },
  { id: 'c', pinned: false }
];

test('pinning moves a tab into the pinned group at the start', () => {
  const tabs = makeTabs();
  const result = setTabPinOrder(tabs, tabs[2], true);
  assert.deepEqual(result.map((tab) => tab.id), ['a', 'd', 'b', 'c']);
  assert.equal(result[2].pinned, true);
});

test('unpinning moves a tab after the pinned group', () => {
  const tabs = makeTabs();
  const result = setTabPinOrder(tabs, tabs[0], false);
  assert.deepEqual(result.map((tab) => tab.id), ['d', 'b', 'c', 'a']);
  assert.equal(result[1].pinned, false);
});

test('drag reordering works within a pinned or unpinned group', () => {
  const tabs = makeTabs();
  const result = reorderTabsWithinGroup(tabs, tabs[2], tabs[3], true);
  assert.deepEqual(result.map((tab) => tab.id), ['a', 'd', 'c', 'b']);
  const pinnedMove = reorderTabsWithinGroup(tabs, tabs[0], tabs[1], true);
  assert.deepEqual(pinnedMove.map((tab) => tab.id), ['d', 'a', 'b', 'c']);
});

test('dragging cannot move a pinned tab into the unpinned group', () => {
  const tabs = makeTabs();
  assert.equal(reorderTabsWithinGroup(tabs, tabs[0], tabs[2], true), tabs);
});

test('tab ordering leaves input array unchanged when a reordered copy is returned', () => {
  const tabs = makeTabs();
  const result = reorderTabsWithinGroup(tabs, tabs[3], tabs[2], false);
  assert.notEqual(result, tabs);
  assert.deepEqual(tabs.map((tab) => tab.id), ['a', 'd', 'b', 'c']);
});

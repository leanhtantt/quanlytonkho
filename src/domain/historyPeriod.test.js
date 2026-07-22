import { describe, expect, it } from 'vitest';
import { extendHistoryRange, initialHistoryRange } from './historyPeriod';

describe('history period', () => {
  it('starts with the current three calendar months', () => {
    expect(initialHistoryRange(new Date(2026, 6, 22))).toEqual({ from: '2026-05-01', to: '2026-07-31' });
  });

  it('loads three older calendar months without changing the end date', () => {
    expect(extendHistoryRange({ from: '2026-01-01', to: '2026-03-31' })).toEqual({ from: '2025-10-01', to: '2026-03-31' });
  });
});

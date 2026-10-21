import { describe, expect, it } from 'vitest';
import { CIN_PATTERN, checkGstin, gstinChecksumChar, listGstStates, stateNameForCode } from '../../modules/vendors/src/gst';
import { alertEnabled, resolveSettings } from '../../modules/vendors/src/settings-defaults';
import { mergeSettings } from '../../modules/vendors/src/service';
import { alertMatrix, timezoneLabel } from '../../modules/vendors/src/settings-service';
import { replenishmentUnits } from '../../modules/workspace/src/recommendations';
import { actionUrlFor, categoryOfType, TYPE_CATALOG } from '../../modules/notifications/src/catalog';

describe('GST state table', () => {
  it('names every state and union territory code', () => {
    expect(stateNameForCode('27')).toBe('Maharashtra');
    expect(stateNameForCode('29')).toBe('Karnataka');
    expect(stateNameForCode('06')).toBe('Haryana');
    expect(stateNameForCode('07')).toBe('Delhi');
    expect(stateNameForCode('38')).toBe('Ladakh');
    expect(stateNameForCode('99')).toBe('Centre Jurisdiction');
    expect(stateNameForCode('28')).toBeNull(); // old Andhra Pradesh code, no longer issued
    expect(stateNameForCode('00')).toBeNull();
    expect(stateNameForCode('toString')).toBeNull();
    expect(listGstStates().length).toBeGreaterThanOrEqual(38);
  });
});

describe('GSTIN validation', () => {
  it('accepts a real-format GSTIN and extracts state and PAN', () => {
    expect(checkGstin(' 27aapfu0939f1zv ')).toEqual({ valid: true, gstin: '27AAPFU0939F1ZV', stateCode: '27', stateName: 'Maharashtra', pan: 'AAPFU0939F' });
  });
  it('computes the mod-36 check character', () => {
    expect(gstinChecksumChar('27AAPFU0939F1Z')).toBe('V');
    expect(gstinChecksumChar('29AABCN8412P1Z')).toBe('X');
    expect(gstinChecksumChar('06AABCN8412P1Z')).toBe('5');
  });
  it('reports the problem: format, state code, checksum', () => {
    expect(checkGstin('123')).toMatchObject({ valid: false, problem: 'format' });
    expect(checkGstin('27AAPFU0939F1ZA')).toMatchObject({ valid: false, problem: 'checksum', expectedCheckChar: 'V', stateName: 'Maharashtra' });
    expect(checkGstin('00AAPFU0939F1Z0')).toMatchObject({ valid: false, problem: 'state_code' });
    expect(checkGstin('27AAPFU0939F1YV')).toMatchObject({ valid: false, problem: 'format' }); // 14th character must be Z
  });
});

describe('CIN', () => {
  it('matches the 21 character pattern', () => {
    expect(CIN_PATTERN.test('U74999MH2021PTC368942')).toBe(true);
    expect(CIN_PATTERN.test('L17110MH1973PLC019786')).toBe(true);
    expect(CIN_PATTERN.test('X74999MH2021PTC368942')).toBe(false);
    expect(CIN_PATTERN.test('U74999MH2021PTC36894')).toBe(false);
  });
});

describe('settings resolution', () => {
  it('applies defaults to an empty document', () => {
    const s = resolveSettings({});
    expect(s.alerts).toEqual({ dispatchSlaBreach: { enabled: true, thresholdMinutes: 45 }, criticalStockouts: true, tokenRenewals: true, syncFailures: true, returns: true });
    expect(s.numberFormat).toBe('indian');
    expect(s.operations).toMatchObject({ autoAcknowledgeOrders: false, roundPriceToNine: false, defaultInventoryBufferPercent: 0, defaultFulfillmentMethod: null, defaultWarehouseId: null });
    expect(s.lowStockThreshold).toBe(5);
  });
  it('keeps what was set and ignores garbage', () => {
    const s = resolveSettings({ numberFormat: 'international', lowStockThreshold: 15, operations: { roundPriceToNine: true, defaultFulfillmentMethod: 'bogus' }, alerts: { dispatchSlaBreach: { thresholdMinutes: 30 }, returns: false } });
    expect(s.numberFormat).toBe('international');
    expect(s.lowStockThreshold).toBe(15);
    expect(s.operations.roundPriceToNine).toBe(true);
    expect(s.operations.defaultFulfillmentMethod).toBeNull();
    expect(s.alerts.dispatchSlaBreach).toEqual({ enabled: true, thresholdMinutes: 30 });
    expect(s.alerts.returns).toBe(false);
  });
  it('a family is on only when both the legacy switch and the screen flag allow it', () => {
    expect(alertEnabled(resolveSettings({}), 'lowStock')).toBe(true);
    expect(alertEnabled(resolveSettings({ notifications: { lowStock: false } }), 'lowStock')).toBe(false);
    expect(alertEnabled(resolveSettings({ alerts: { criticalStockouts: false } }), 'lowStock')).toBe(false);
    expect(alertEnabled(resolveSettings({ notifications: { syncFailures: false } }), 'syncFailures')).toBe(false);
    expect(alertEnabled(resolveSettings({ alerts: { tokenRenewals: false } }), 'tokenRenewals')).toBe(false);
    expect(alertEnabled(resolveSettings({ notifications: { orderAlerts: false } }), 'orderAlerts')).toBe(false);
    expect(alertEnabled(resolveSettings({ alerts: { dispatchSlaBreach: { enabled: false } } }), 'dispatchSlaBreach')).toBe(false);
  });
  it('merges nested sections without losing siblings', () => {
    const merged = mergeSettings({ alerts: { dispatchSlaBreach: { enabled: true, thresholdMinutes: 60 }, returns: true }, lowStockThreshold: 3 }, { alerts: { dispatchSlaBreach: { enabled: false } } });
    expect(merged).toEqual({ alerts: { dispatchSlaBreach: { enabled: false, thresholdMinutes: 60 }, returns: true }, lowStockThreshold: 3 });
  });
  it('lists five alert rows with the threshold in the SLA text', () => {
    const rows = alertMatrix(resolveSettings({ alerts: { dispatchSlaBreach: { thresholdMinutes: 30 } } }).alerts);
    expect(rows.map((r) => r.key)).toEqual(['dispatchSlaBreach', 'criticalStockouts', 'tokenRenewals', 'syncFailures', 'returns']);
    expect(rows[0]!.description).toContain('30 minutes');
  });
  it('labels the time zone with its offset', () => {
    expect(timezoneLabel('Asia/Kolkata')).toEqual({ label: 'Asia/Kolkata (UTC+05:30)', utcOffset: '+05:30' });
    expect(timezoneLabel('UTC').utcOffset).toBe('+00:00');
  });
});

describe('notification catalog', () => {
  it('gives every type a category and the panel link', () => {
    expect(categoryOfType('order.new')).toBe('order');
    expect(categoryOfType('inventory.low_stock')).toBe('inventory');
    expect(categoryOfType('marketplace.authorization_expired')).toBe('connector');
    expect(categoryOfType('return.requested')).toBe('returns');
    expect(categoryOfType('security.user_invited')).toBe('security');
    expect(categoryOfType('automation.notice')).toBe('system');
    expect(actionUrlFor({ type: 'order.new', entityType: 'order', entityId: 'abc', data: {} })).toBe('/orders/abc');
    expect(actionUrlFor({ type: 'order.new', entityType: 'order', entityId: 'abc', data: { actionUrl: '/x' } })).toBe('/x');
    expect(actionUrlFor({ type: 'automation.notice', entityType: null, entityId: null, data: {} })).toBeNull();
    expect(new Set(TYPE_CATALOG.map((t) => t.type)).size).toBe(TYPE_CATALOG.length);
  });
});

describe('replenishment', () => {
  it('is target days of sales minus available, never negative, null without sales', () => {
    expect(replenishmentUnits({ unitsPerDay: 2, available: 4 })).toBe(24);
    expect(replenishmentUnits({ unitsPerDay: 3, available: 8 })).toBe(34);
    expect(replenishmentUnits({ unitsPerDay: 2, available: 100 })).toBe(0);
    expect(replenishmentUnits({ unitsPerDay: 0, available: 4 })).toBeNull();
    expect(replenishmentUnits({ unitsPerDay: 1.5, available: 4 }, 30)).toBe(41);
  });
});

import { describe, expect, it } from 'vitest';
import {
  addressInput,
  addressSummary,
  barangayId,
  compareBarangayNames,
  haversineKm,
  isInPhilippines,
  isPinInTown,
  parseBarangayCsv,
  roundLatLng,
  slugify,
  townId,
  upsertTownInput,
} from '../src';

describe('geo', () => {
  it('measures straight-line distance', () => {
    // Iloilo City to Roxas City is roughly 117 km in a straight line.
    const d = haversineKm({ lat: 10.7202, lng: 122.5621 }, { lat: 11.5853, lng: 122.7511 });
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(100);
    expect(haversineKm({ lat: 11, lng: 122 }, { lat: 11, lng: 122 })).toBe(0);
  });
  it('knows the Philippines', () => {
    expect(isInPhilippines({ lat: 10.72, lng: 122.56 })).toBe(true);
    expect(isInPhilippines({ lat: 0, lng: 0 })).toBe(false);
    expect(isInPhilippines({ lat: NaN, lng: 122 })).toBe(false);
  });
  it('rounds pins to 6 decimals', () => {
    expect(roundLatLng({ lat: 10.123456789, lng: 122.987654321 })).toEqual({ lat: 10.123457, lng: 122.987654 });
  });
});

describe('ids', () => {
  it('slugifies Filipino place names', () => {
    expect(slugify('Sto. Niño (Pob.)')).toBe('sto-nino-pob');
    expect(slugify('  Barangay 10 ')).toBe('barangay-10');
  });
  it('builds stable town and barangay ids', () => {
    const t = townId('San Roque', 'Demo Province');
    expect(t).toBe('san-roque--demo-province');
    expect(barangayId(t, 'Sto. Niño')).toBe('san-roque--demo-province__sto-nino');
    expect(barangayId(t, 'sto nino')).toBe(barangayId(t, 'Sto. Niño'));
  });
});

describe('isPinInTown', () => {
  const town = { center: { lat: 11.1, lng: 122.64 }, radiusKm: 10 };
  it('accepts pins inside the radius', () => {
    expect(isPinInTown({ lat: 11.12, lng: 122.66 }, town)).toBe(true);
  });
  it('rejects pins outside it', () => {
    expect(isPinInTown({ lat: 11.3, lng: 122.64 }, town)).toBe(false);
  });
});

describe('compareBarangayNames', () => {
  it('sorts numbers naturally', () => {
    expect(['Barangay 10', 'Barangay 2', 'Abaca'].sort(compareBarangayNames)).toEqual([
      'Abaca',
      'Barangay 2',
      'Barangay 10',
    ]);
  });
});

describe('parseBarangayCsv', () => {
  it('parses a clean file with BOM, CRLF and quotes', () => {
    const csv = '﻿Name,Lat,Lng\r\nPoblacion,11.1,122.64\r\n"Sto. Niño, Pob.",11.11,122.65\r\n\r\n';
    const r = parseBarangayCsv(csv);
    expect(r.issues).toEqual([]);
    expect(r.rows.map((x) => x.name)).toEqual(['Poblacion', 'Sto. Niño, Pob.']);
    expect(r.rows[1]).toMatchObject({ lat: 11.11, lng: 122.65, line: 3 });
  });
  it('accepts columns in any order and long header names', () => {
    const r = parseBarangayCsv('longitude,latitude,name\n122.64,11.1,Mabini');
    expect(r.rows).toEqual([{ line: 2, name: 'Mabini', lat: 11.1, lng: 122.64 }]);
  });
  it('reports bad rows but keeps good ones', () => {
    const r = parseBarangayCsv(
      ['name,lat,lng', 'Rizal,11.1,122.6', ',11.1,122.6', 'Far,0,0', 'rizal,11.2,122.6', 'Short,11.1', 'Blank,,'].join('\n'),
    );
    expect(r.rows.map((x) => x.name)).toEqual(['Rizal']);
    expect(r.issues).toEqual([
      { line: 3, code: 'empty_name' },
      { line: 4, code: 'bad_coordinates' },
      { line: 5, code: 'duplicate_name' },
      { line: 6, code: 'bad_columns' },
      { line: 7, code: 'bad_coordinates' },
    ]);
  });
  it('requires a header', () => {
    expect(parseBarangayCsv('Poblacion,11.1,122.6').issues).toEqual([{ line: 1, code: 'missing_header' }]);
    expect(parseBarangayCsv('').issues).toEqual([{ line: 1, code: 'missing_header' }]);
  });
});

describe('addressInput', () => {
  const ok = {
    label: 'Home',
    barangayId: 'b1',
    street: 'Purok 3',
    landmark: 'Blue gate beside the chapel',
    geo: { lat: 11.1, lng: 122.64 },
  };
  it('accepts a normal address', () => {
    expect(addressInput.parse(ok)).toMatchObject({ isDefault: false, street: 'Purok 3' });
  });
  it('requires a landmark', () => {
    const r = addressInput.safeParse({ ...ok, landmark: ' ' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('landmark_required');
  });
  it('requires a pin in the Philippines', () => {
    expect(addressInput.safeParse({ ...ok, geo: { lat: 35, lng: 139 } }).success).toBe(false);
  });
  it('makes street optional', () => {
    const { street: _s, ...noStreet } = ok;
    expect(addressInput.parse(noStreet).street).toBe('');
  });
});

describe('addressSummary', () => {
  it('joins the parts riders need', () => {
    expect(addressSummary({ landmark: 'Near the chapel', street: 'Purok 3' }, 'Mabini')).toBe(
      'Near the chapel, Purok 3, Brgy. Mabini',
    );
    expect(addressSummary({ landmark: 'Green house', street: '' }, 'Rizal')).toBe('Green house, Brgy. Rizal');
  });
});

describe('upsertTownInput', () => {
  it('fills defaults', () => {
    const r = upsertTownInput.parse({ name: 'San Roque', province: 'Demo', center: { lat: 11.1, lng: 122.64 } });
    expect(r).toMatchObject({ tier: 'C', isLive: false, trialEndsOn: null, radiusKm: 15 });
  });
  it('validates the trial date format', () => {
    expect(
      upsertTownInput.safeParse({ name: 'X Town', province: 'Demo', center: { lat: 11, lng: 122 }, trialEndsOn: '1/2/2027' })
        .success,
    ).toBe(false);
  });
});

import { endOfManilaDay, manilaDateString } from '../src';

describe('Manila dates', () => {
  it('ends the day at Manila midnight', () => {
    expect(endOfManilaDay('2027-01-31').toISOString()).toBe('2027-01-31T15:59:59.999Z');
  });
  it('round-trips', () => {
    expect(manilaDateString(endOfManilaDay('2027-01-31'))).toBe('2027-01-31');
    // 20:00 UTC on Jan 31 is already Feb 1 in Manila
    expect(manilaDateString(new Date('2027-01-31T20:00:00Z'))).toBe('2027-02-01');
  });
});

/** Demo riders for San Roque: four verified with different pricing styles, one waiting for verification. */
import type { RateCard, VehicleType } from '@hatod/shared';

export interface SeedRider {
  uid: string;
  name: string;
  phone: string;
  vehicleType: VehicleType;
  vehicleDesc: string;
  plateNo: string;
  verified: boolean;
  online: boolean;
  maxKm: number;
  /** Barangay names served; empty = all. */
  serves: string[];
  rateCard: Omit<RateCard, 'fixedFares'> & { fixedFares: { from: string; to: string; fee: number }[] };
  ratingAvg: number;
  ratingCount: number;
  completedCount: number;
  /** Where the rider waits when online (rounded to about 1 km when stored). */
  near?: { lat: number; lng: number };
}

export const SEED_RIDERS: SeedRider[] = [
  {
    uid: 'demo-rider',
    name: 'Ramon Rider',
    phone: '+639170000004',
    vehicleType: 'motorcycle',
    vehicleDesc: 'Honda XRM 125, red',
    plateNo: '123 ABC',
    verified: true,
    online: true,
    maxKm: 10,
    serves: [],
    // the plan's example card: base 30, ₱10/km, minimum 40
    rateCard: { base: 30, perKm: 10, minimum: 40, fixedFares: [], surcharges: { night: { fromHour: 21, untilHour: 5, amount: 15 }, rain: 10, extraStop: 0 } },
    ratingAvg: 4.8,
    ratingCount: 52,
    completedCount: 61,
    near: { lat: 11.1049, lng: 122.6436 },
  },
  {
    uid: 'demo-shop-rider',
    name: 'Sonny Shop-Rider',
    phone: '+639170000006',
    vehicleType: 'motorcycle',
    vehicleDesc: 'Yamaha Mio, blue',
    plateNo: '456 DEF',
    verified: true,
    online: true,
    maxKm: 6,
    serves: ['Poblacion', 'Bagumbayan', 'Santa Cruz', 'Ilaya', 'Baybay'],
    // low base, higher per km: cheap for short trips
    rateCard: { base: 20, perKm: 12, minimum: 35, fixedFares: [], surcharges: { night: null, rain: 0, extraStop: 0 } },
    ratingAvg: 4.5,
    ratingCount: 14,
    completedCount: 18,
    near: { lat: 11.1187, lng: 122.6427 },
  },
  {
    uid: 'demo-rider-2',
    name: 'Jojo Habal-Habal',
    phone: '+639170000021',
    vehicleType: 'motorcycle',
    vehicleDesc: 'Suzuki Raider, black',
    plateNo: '789 GHI',
    verified: true,
    online: true,
    maxKm: 12,
    serves: [],
    // fixed fares from the poblacion, like local habal-habal
    rateCard: {
      base: 35,
      perKm: 9,
      minimum: 45,
      fixedFares: [
        { from: 'Poblacion', to: 'Mabini', fee: 50 },
        { from: 'Poblacion', to: 'Rizal', fee: 55 },
        { from: 'Poblacion', to: 'Tabuc', fee: 60 },
      ],
      surcharges: { night: { fromHour: 20, untilHour: 4, amount: 20 }, rain: 15, extraStop: 20 },
    },
    ratingAvg: 4.9,
    ratingCount: 88,
    completedCount: 102,
    near: { lat: 11.0912, lng: 122.6476 },
  },
  {
    uid: 'demo-rider-3',
    name: 'Bea Bisikleta',
    phone: '+639170000022',
    vehicleType: 'bicycle',
    vehicleDesc: 'Mountain bike with basket, green',
    plateNo: '',
    verified: true,
    online: false,
    maxKm: 3,
    serves: ['Poblacion', 'Mabini', 'Bagumbayan', 'Sto. Niño'],
    rateCard: { base: 25, perKm: 8, minimum: 30, fixedFares: [], surcharges: { night: null, rain: 0, extraStop: 0 } },
    ratingAvg: 5,
    ratingCount: 6,
    completedCount: 7,
  },
  {
    uid: 'demo-rider-4',
    name: 'Nonoy Newbie',
    phone: '+639170000023',
    vehicleType: 'tricycle',
    vehicleDesc: 'Kawasaki Barako tricycle, yellow sidecar',
    plateNo: '012 JKL',
    verified: false,
    online: false,
    maxKm: 8,
    serves: [],
    rateCard: { base: 30, perKm: 10, minimum: 40, fixedFares: [], surcharges: { night: null, rain: 0, extraStop: 0 } },
    ratingAvg: 0,
    ratingCount: 0,
    completedCount: 0,
  },
];

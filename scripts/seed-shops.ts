/** Demo shops for San Roque. Five are verified and listed; one is waiting for verification. */
import type { WeeklyHours } from '@hatod/shared';

type Item = { name: string; price: number; category: string; description?: string; variants?: { name: string; price: number }[]; addOns?: { name: string; price: number }[]; available?: boolean };

export interface SeedShop {
  id: string;
  ownerUid: string;
  ownerName: string;
  ownerPhone: string;
  name: string;
  category: 'meals' | 'snacks' | 'drinks' | 'bakery' | 'groceries';
  description: string;
  barangay: string;
  landmark: string;
  street: string;
  geo: { lat: number; lng: number };
  hours: WeeklyHours;
  paymentMethods: ('cash' | 'gcash' | 'maya')[];
  hasOwnRider: boolean;
  selfDeliveryFee: number;
  prepMinutes: number;
  verified: boolean;
  menuCategories: string[];
  items: Item[];
}

const daily = (open: string, close: string, days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) =>
  Object.fromEntries(days.map((d) => [d, [{ open, close }]])) as WeeklyHours;

const RICE = { name: 'Extra rice', price: 15 };
const EGG = { name: 'Egg', price: 12 };

export const SEED_SHOPS: SeedShop[] = [
  {
    id: 'demo-shop-susan',
    ownerUid: 'demo-shop',
    ownerName: 'Susan Shop',
    ownerPhone: '+639170000003',
    name: "Aling Susan's Carinderia",
    category: 'meals',
    description: 'Home-cooked ulam every day. Order before 11 for lunch.',
    barangay: 'Poblacion',
    landmark: 'Beside the public market, blue tarp',
    street: 'Rizal St.',
    geo: { lat: 11.1049, lng: 122.6436 },
    hours: {
      ...daily('06:00', '14:00', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']),
      mon: [{ open: '06:00', close: '14:00' }, { open: '16:00', close: '20:00' }],
      fri: [{ open: '06:00', close: '14:00' }, { open: '16:00', close: '20:00' }],
    },
    paymentMethods: ['cash', 'gcash'],
    hasOwnRider: false,
    selfDeliveryFee: 0,
    prepMinutes: 15,
    verified: true,
    menuCategories: ['Ulam', 'Silog', 'Drinks'],
    items: [
      { category: 'Ulam', name: 'Pork Adobo with rice', price: 85, addOns: [RICE, EGG] },
      { category: 'Ulam', name: 'Chicken Tinola with rice', price: 90, addOns: [RICE] },
      { category: 'Ulam', name: 'Pinakbet with rice', price: 70, addOns: [RICE] },
      { category: 'Ulam', name: 'Sinigang na Baboy', price: 0, variants: [{ name: 'Solo', price: 95 }, { name: 'Family (good for 4)', price: 320 }], addOns: [RICE] },
      { category: 'Silog', name: 'Tapsilog', price: 0, variants: [{ name: 'Regular', price: 80 }, { name: 'Large', price: 100 }], addOns: [RICE, EGG] },
      { category: 'Silog', name: 'Longsilog', price: 75, addOns: [RICE, EGG] },
      { category: 'Drinks', name: 'Iced tea', price: 20 },
      { category: 'Drinks', name: 'Bottled water', price: 15 },
    ],
  },
  {
    id: 'demo-shop-panaderia',
    ownerUid: 'demo-owner-1',
    ownerName: 'Pedro Panadero',
    ownerPhone: '+639170000011',
    name: 'Panaderia de San Roque',
    category: 'bakery',
    description: 'Pandesal fresh at 5 AM and 3 PM.',
    barangay: 'Santa Cruz',
    landmark: 'Across the elementary school gate',
    street: '',
    geo: { lat: 11.1185, lng: 122.6429 },
    hours: daily('05:00', '19:00'),
    paymentMethods: ['cash'],
    hasOwnRider: false,
    selfDeliveryFee: 0,
    prepMinutes: 5,
    verified: true,
    menuCategories: ['Bread', 'Cakes'],
    items: [
      { category: 'Bread', name: 'Pandesal (10 pcs)', price: 30 },
      { category: 'Bread', name: 'Spanish bread (5 pcs)', price: 40 },
      { category: 'Bread', name: 'Ensaymada', price: 0, variants: [{ name: 'Classic', price: 25 }, { name: 'Ube', price: 30 }] },
      { category: 'Cakes', name: 'Mamon', price: 20 },
      { category: 'Cakes', name: 'Ube roll', price: 180, available: false },
    ],
  },
  {
    id: 'demo-shop-lechon',
    ownerUid: 'demo-owner-2',
    ownerName: 'Benjie Lechonero',
    ownerPhone: '+639170000012',
    name: "Kuya Ben's Lechon Manok",
    category: 'meals',
    description: 'Charcoal-roasted chicken with liver sauce.',
    barangay: 'Mabini',
    landmark: 'Green smoke stand near the barangay hall',
    street: 'Mabini St.',
    geo: { lat: 11.0997, lng: 122.6493 },
    hours: daily('10:00', '20:00'),
    paymentMethods: ['cash', 'gcash', 'maya'],
    hasOwnRider: true,
    selfDeliveryFee: 40,
    prepMinutes: 10,
    verified: true,
    menuCategories: ['Lechon Manok', 'Sides'],
    items: [
      { category: 'Lechon Manok', name: 'Lechon manok', price: 0, variants: [{ name: 'Half', price: 190 }, { name: 'Whole', price: 360 }], addOns: [{ name: 'Extra sauce', price: 10 }] },
      { category: 'Lechon Manok', name: 'Liempo (per 1/4 kg)', price: 120 },
      { category: 'Sides', name: 'Java rice', price: 25 },
      { category: 'Sides', name: 'Atchara', price: 20 },
    ],
  },
  {
    id: 'demo-shop-bbq',
    ownerUid: 'demo-owner-3',
    ownerName: 'Tomas Ihawan',
    ownerPhone: '+639170000013',
    name: 'Mang Tomas Ihaw-Ihaw',
    category: 'snacks',
    description: 'Street BBQ every night until 1 AM.',
    barangay: 'Rizal',
    landmark: 'Corner of the basketball court',
    street: 'Purok 2',
    geo: { lat: 11.1133, lng: 122.6505 },
    hours: daily('16:00', '01:00'),
    paymentMethods: ['cash', 'gcash'],
    hasOwnRider: false,
    selfDeliveryFee: 0,
    prepMinutes: 20,
    verified: true,
    menuCategories: ['Ihaw', 'Rice'],
    items: [
      { category: 'Ihaw', name: 'Pork BBQ stick', price: 25 },
      { category: 'Ihaw', name: 'Chicken isaw (3 sticks)', price: 20 },
      { category: 'Ihaw', name: 'Betamax', price: 10 },
      { category: 'Ihaw', name: 'Chicken inasal', price: 0, variants: [{ name: 'Paa', price: 110 }, { name: 'Pecho', price: 120 }], addOns: [RICE] },
      { category: 'Rice', name: 'Puso (hanging rice)', price: 8 },
    ],
  },
  {
    id: 'demo-shop-rosa',
    ownerUid: 'demo-owner-4',
    ownerName: 'Rosa Tindera',
    ownerPhone: '+639170000014',
    name: 'Tindahan ni Aling Rosa',
    category: 'groceries',
    description: 'Sari-sari store: load, drinks, basic groceries.',
    barangay: 'San Jose',
    landmark: 'Yellow store beside the chapel',
    street: '',
    geo: { lat: 11.0953, lng: 122.6383 },
    hours: daily('06:00', '21:00'),
    paymentMethods: ['cash', 'gcash'],
    hasOwnRider: false,
    selfDeliveryFee: 0,
    prepMinutes: 5,
    verified: true,
    menuCategories: ['Drinks', 'Pantry'],
    items: [
      { category: 'Drinks', name: 'Coke 1.5 L', price: 85 },
      { category: 'Drinks', name: 'Ice (1 bag)', price: 10 },
      { category: 'Pantry', name: 'Rice (1 kg)', price: 55 },
      { category: 'Pantry', name: 'Eggs (6 pcs)', price: 54 },
      { category: 'Pantry', name: 'Instant noodles', price: 15 },
    ],
  },
  {
    id: 'demo-shop-milktea',
    ownerUid: 'demo-shop-rider',
    ownerName: 'Sonny Shop-Rider',
    ownerPhone: '+639170000006',
    name: "Sonny's Milk Tea",
    category: 'drinks',
    description: '',
    barangay: 'Bagumbayan',
    landmark: 'Pink kiosk in front of the gas station',
    street: '',
    geo: { lat: 11.1103, lng: 122.6376 },
    hours: daily('10:00', '21:00'),
    paymentMethods: ['cash', 'gcash'],
    hasOwnRider: true,
    selfDeliveryFee: 30,
    prepMinutes: 10,
    verified: false,
    menuCategories: ['Milk tea'],
    items: [
      { category: 'Milk tea', name: 'Classic milk tea', price: 0, variants: [{ name: 'Medium', price: 59 }, { name: 'Large', price: 69 }], addOns: [{ name: 'Pearls', price: 10 }, { name: 'Nata', price: 10 }] },
      { category: 'Milk tea', name: 'Wintermelon', price: 0, variants: [{ name: 'Medium', price: 59 }, { name: 'Large', price: 69 }], addOns: [{ name: 'Pearls', price: 10 }] },
    ],
  },
];

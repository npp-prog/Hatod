import type { LatLng } from '../geo';
import type { WeeklyHours } from '../hours';
import type { AddOn, Variant } from '../menu';
import type { MenuSummary } from '../browse';
import type { PaymentMethod, ShopCategory, VerificationStatus } from '../shops';
import type { Timestamp } from './user';

/**
 * shops/{shopId}: the public listing. The owner edits the profile, menu and
 * hours fields directly (rules list exactly which); verification, plan,
 * ratings and status are written by Cloud Functions only.
 */
export interface ShopDoc {
  ownerId: string;
  townId: string;
  name: string;
  category: ShopCategory;
  description: string;
  contactPhone: string;
  photos: string[];
  barangayId: string;
  barangayName: string;
  street: string;
  landmark: string;
  geo: LatLng;
  hours: WeeklyHours;
  /** "Closed today" switch: the Manila date it applies to, or null. */
  closedOn: string | null;
  prepMinutes: number;
  busyMinutes: number;
  paymentMethods: PaymentMethod[];
  gcashQrUrl: string | null;
  mayaQrUrl: string | null;
  hasOwnRider: boolean;
  selfDeliveryFee: number;
  menuCategories: string[];
  verified: boolean;
  verificationStatus: VerificationStatus;
  status: 'active' | 'suspended';
  planId: string | null;
  ratingAvg: number;
  ratingCount: number;
  /** Written by a Cloud Function whenever the menu changes. */
  menuSummary?: MenuSummary | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** shops/{shopId}/private/info: owner, coordinators and admins only. */
export interface ShopPrivateDoc {
  ownerName: string;
  ownerPhone: string;
  permitPath: string | null;
  updatedAt: Timestamp;
}

/** shops/{shopId}/menuItems/{itemId} */
export interface MenuItemDoc {
  name: string;
  description: string;
  category: string;
  price: number;
  photoUrl: string | null;
  variants: Variant[];
  addOns: AddOn[];
  available: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

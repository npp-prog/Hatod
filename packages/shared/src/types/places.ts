import type { LatLng } from '../geo';
import type { TownTier } from '../towns';
import type { Timestamp } from './user';

/** towns/{townId}. Written by admin callables only. */
export interface TownDoc {
  name: string;
  province: string;
  tier: TownTier;
  isLive: boolean;
  acceptingSignups?: boolean;
  trialEndsAt: Timestamp | null;
  coordinatorIds: string[];
  center: LatLng;
  radiusKm: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** barangays/{barangayId}. Public, used for address dropdowns and fixed fares. */
export interface BarangayDoc {
  townId: string;
  name: string;
  centroid: LatLng;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** addresses/{id}. A customer's saved delivery address; the customer writes it directly. */
export interface AddressDoc {
  userId: string;
  townId: string;
  label: string;
  barangayId: string;
  /** Copied from the barangay at save time (rules check it) so lists need no extra reads. */
  barangayName: string;
  street: string;
  landmark: string;
  geo: LatLng;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

import type { RateCard } from '../fees';
import type { RiderDocKey, VehicleType } from '../riders';
import type { VerificationStatus } from '../shops';
import type { PlanCode, SubStatus } from '../subscriptions';
import type { Timestamp } from './user';

/**
 * riders/{uid} (doc id = the rider's user id). Public once verified: customers
 * see name, photo, vehicle, plate, rating and rate card when choosing a rider.
 * The rate card and service area change only through Cloud Functions.
 */
export interface RiderDoc {
  userId: string;
  townId: string;
  name: string;
  photoUrl: string | null;
  vehicleType: VehicleType;
  vehicleDesc: string;
  plateNo: string;
  verified: boolean;
  verificationStatus: VerificationStatus;
  status: 'active' | 'suspended' | 'banned';
  online: boolean;
  /** The rider's "it's raining" switch, which turns on their rain surcharge. */
  rainOn: boolean;
  lastActiveAt: Timestamp | null;
  /** Rounded to about 1 km, set while online, cleared when offline. For "nearest" sorting only. */
  approxLocation?: { lat: number; lng: number } | null;
  servedBarangayIds: string[];
  maxKm: number;
  rateCard: RateCard;
  rateUpdatedAt: Timestamp | null;
  planId: string | null;
  /** Copied from the rider's subscription by Cloud Functions. */
  planCode?: PlanCode | null;
  subscriptionStatus?: SubStatus | null;
  ratingAvg: number;
  ratingCount: number;
  completedCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

/** riders/{uid}/private/info: the rider, their town coordinators and admins. */
export interface RiderPrivateDoc {
  legalName: string;
  phone: string;
  emergencyContact: EmergencyContact;
  docs: Record<RiderDocKey, string | null>;
  updatedAt: Timestamp;
}

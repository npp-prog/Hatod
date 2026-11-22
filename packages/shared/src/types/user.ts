import type { Role } from '../roles';

export type UserStatus = 'active' | 'suspended' | 'banned';

/** A timestamp as stored in Firestore; shared code treats it opaquely. */
export type Timestamp = { toMillis(): number } | Date;

export interface Consent {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: Timestamp;
}

/** users/{uid}. Written only by Cloud Functions. */
export interface UserDoc {
  uid: string;
  name: string;
  phone: string;
  roles: Role[];
  defaultTownId: string | null;
  status: UserStatus;
  strikes: { reportId: string; at: Timestamp }[];
  consent: Consent;
  locale: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

import type { OrderActor } from '../orders';
import type { ReportCategory, TargetType } from '../trust';
import type { Timestamp } from './user';

/** ratings/{orderId}_{fromUserId}_{toType}: one per side per order. Written by Cloud Functions. */
export interface RatingDoc {
  orderId: string;
  townId: string;
  fromUserId: string;
  fromRole: 'customer' | 'shop' | 'rider';
  toType: TargetType;
  /** shopId for shops, uid for riders and customers. */
  toId: string;
  stars: number;
  tags: string[];
  comment: string;
  createdAt: Timestamp;
}

/** reports/{orderId}_{reporterId}_{targetType}: the trust and safety queue. */
export interface ReportDoc {
  orderId: string;
  orderCode: string;
  townId: string;
  reporterId: string;
  reporterRole: OrderActor;
  targetType: TargetType;
  targetId: string;
  targetName: string;
  category: ReportCategory;
  details: string;
  urgent: boolean;
  status: 'open' | 'resolved';
  resolution: 'confirmed' | 'dismissed' | null;
  note: string | null;
  handledBy: string | null;
  createdAt: Timestamp;
  resolvedAt: Timestamp | null;
}

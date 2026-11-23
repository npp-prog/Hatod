import type { FeeBreakdown } from '../fees';
import type { LatLng } from '../geo';
import type { CancelReason, DeclineReason, OrderActor, OrderStatus } from '../orders';
import type { PaymentMethod } from '../shops';
import type { Timestamp } from './user';

export interface OrderItem {
  itemId: string;
  name: string;
  variant: string | null;
  addOns: string[];
  qty: number;
  note: string;
  /** Server-computed from the menu at placement; never taken from the client. */
  unitPrice: number;
}

/**
 * orders/{orderId}. Written only by Cloud Functions. Readable by the
 * customer, the shop owner, the assigned rider, that town's coordinators and
 * admins. Snapshots (items, addresses, names) keep history correct when
 * menus, rates or profiles change later.
 */
export interface OrderDoc {
  requestId: string;
  townId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  shopId: string;
  shopOwnerId: string;
  shopName: string;
  shopPhone: string;
  pickup: { geo: LatLng; landmark: string; barangayName: string };
  dropoff: { label: string; barangayId: string; barangayName: string; street: string; landmark: string; geo: LatLng };
  items: OrderItem[];
  itemsTotal: number;
  paymentMethod: PaymentMethod;
  selfDelivery: boolean;
  /** Customer's current rider choice (null while they need to pick another). */
  chosenRiderId: string | null;
  riderId: string | null;
  rider: { name: string; phone: string; plateNo: string; vehicleDesc: string; photoUrl: string | null } | null;
  /** Riders who declined or let an offer expire; the customer cannot pick them again for this order. */
  declinedRiderIds: string[];
  /** Current pending offer, if any. */
  offerId: string | null;
  distanceKm: number;
  distanceEstimate: boolean;
  /** Fee quoted for the current choice; becomes final at rider acceptance. */
  deliveryFee: number | null;
  feeBreakdown: FeeBreakdown | null;
  feeLocked: boolean;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: Timestamp; by: OrderActor }[];
  declineReason: DeclineReason | null;
  cancelReason: CancelReason | null;
  cancelledBy: OrderActor | null;
  readyAt: Timestamp | null;
  ready: boolean;
  shopPaid: boolean;
  riderPaid: boolean;
  /** uids allowed to read the order: customer, shop owner, rider once assigned. */
  participants: string[];
  /** When the current waiting step times out (shop answer). */
  expiresAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  /**
   * Which ratings were given after completion, keyed "{fromRole}_{toType}" (e.g. customer_shop).
   * Only a flag: the order is readable by every party, and nobody should see the stars they got.
   */
  ratings?: Record<string, boolean>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** riderOffers/{offerId}: what a rider sees before accepting (no customer phone). */
export interface RiderOfferDoc {
  orderId: string;
  riderId: string;
  townId: string;
  shopName: string;
  pickup: { landmark: string; barangayName: string; geo: LatLng };
  dropoff: { barangayName: string; landmark: string; geo: LatLng };
  distanceKm: number;
  fee: number;
  feeBreakdown: FeeBreakdown;
  itemCount: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  expiresAt: Timestamp;
  createdAt: Timestamp;
  respondedAt: Timestamp | null;
}

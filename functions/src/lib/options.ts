import { setGlobalOptions } from 'firebase-functions/v2';

/** Singapore is the closest Cloud Functions region to the Philippines. */
export const REGION = 'asia-southeast1';

setGlobalOptions({ region: REGION, maxInstances: 10 });

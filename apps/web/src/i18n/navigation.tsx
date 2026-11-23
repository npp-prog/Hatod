import { createNavigation } from 'next-intl/navigation';
import type { ComponentProps } from 'react';
import { routing } from './routing';

const nav = createNavigation(routing);
export const { redirect, usePathname, useRouter, getPathname } = nav;

/**
 * Locale-aware link that does NOT prefetch by default. Prefetching every
 * visible link costs mobile data and competes with the page itself on slow
 * 3G; pages load on tap instead. Pass prefetch to opt in.
 */
export function Link({ prefetch = false, ...props }: ComponentProps<typeof nav.Link>) {
  return <nav.Link prefetch={prefetch} {...props} />;
}

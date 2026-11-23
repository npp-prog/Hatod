'use client';

import { deleteObject, ref } from 'firebase/storage';
import { firebase } from '@/lib/firebase/client';

/** Best-effort delete of a file we no longer reference (by download URL or path). */
export async function deleteStorageFile(urlOrPath: string) {
  try {
    await deleteObject(ref(firebase().storage, urlOrPath));
  } catch {
    /* already gone or not ours */
  }
}

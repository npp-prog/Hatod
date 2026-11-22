import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-hatod-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: host!, port: Number(port) },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'), { name: 'Alice', roles: ['customer'] });
    await setDoc(doc(ctx.firestore(), 'users/bob'), { name: 'Bob', roles: ['customer', 'rider'] });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string, roles: string[]) => env.authenticatedContext(uid, { roles }).firestore();

describe('users', () => {
  it('a user reads their own profile', async () => {
    await assertSucceeds(getDoc(doc(as('alice', ['customer']), 'users/alice')));
  });
  it('a user cannot read someone else', async () => {
    await assertFails(getDoc(doc(as('alice', ['customer']), 'users/bob')));
  });
  it('signed-out visitors cannot read users', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice')));
  });
  it('admins read any profile', async () => {
    await assertSucceeds(getDoc(doc(as('root', ['customer', 'admin']), 'users/bob')));
  });
  it('nobody writes users from the client, not even to grant themselves admin', async () => {
    await assertFails(updateDoc(doc(as('alice', ['customer']), 'users/alice'), { roles: ['admin'] }));
    await assertFails(setDoc(doc(as('carol', ['customer']), 'users/carol'), { roles: ['customer'] }));
    await assertFails(updateDoc(doc(as('root', ['admin']), 'users/bob'), { roles: ['customer'] }));
  });
  it('a forged roles claim that is not a list grants nothing', async () => {
    const ctx = env.authenticatedContext('mallory', { roles: 'admin' }).firestore();
    await assertFails(getDoc(doc(ctx, 'users/alice')));
  });
});

describe('default deny', () => {
  it('blocks unknown collections', async () => {
    await assertFails(getDoc(doc(as('alice', ['customer', 'admin']), 'anything/x')));
    await assertFails(setDoc(doc(as('alice', ['customer', 'admin']), 'orders/x'), { a: 1 }));
  });
});

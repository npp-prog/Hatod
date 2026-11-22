import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/**', 'public/sw.js', 'public/swe-worker-*.js', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // All user-facing text comes from messages/*.json (en, fil). No literal text in JSX.
      'react/jsx-no-literals': [
        'error',
        { noStrings: false, ignoreProps: true, allowedStrings: ['·', '—', '•', '/', '+63', '₱', '*'] },
      ],
    },
  },
];

export default config;

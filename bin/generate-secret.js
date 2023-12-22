#!/usr/bin/env node
const crypto = require('node:crypto');

crypto.randomBytes(30, (err, buffer) => {
  if (err) throw err;

  const secret = buffer
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

  console.log(`import { buildCursorSecret } from 'sql-cursor-pagination';

const secret = buildCursorSecret(${JSON.stringify(secret)});`);
});

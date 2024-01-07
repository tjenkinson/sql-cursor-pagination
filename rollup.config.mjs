import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import fs from 'node:fs';

const packageJson = JSON.parse(
  fs.readFileSync('./package.json', { encoding: 'utf8' }),
);

function replaceCryptoImportWithRequire() {
  let found;

  return {
    name: 'replace-import-with-require',
    buildStart() {
      found = false;
    },
    transform(code, id) {
      if (id.endsWith('/src/crypto.ts')) {
        const updated = code.replace(
          `const { default: crypto } = await import('node:crypto');`,
          `const crypto = require('node:crypto');`,
        );
        if (updated === code) {
          throw new Error('Replacement failed');
        }
        found = true;
        return updated;
      }
    },
    buildEnd() {
      if (!found) {
        throw new Error('Crypto import not found');
      }
    },
  };
}

function buildConfig(format) {
  return {
    input: 'src/index.ts',
    onLog: (level, log, handler) => {
      if (level === 'warn') {
        // treat warnings as errors
        handler('error', log);
      } else {
        handler(level, log);
      }
    },
    output: {
      file: format === 'commonjs' ? 'dist/cjs/index.js' : 'dist/esm/index.mjs',
      format,
    },
    external: Object.keys(packageJson.dependencies),
    plugins: [
      format === 'commonjs' && replaceCryptoImportWithRequire(),
      typescript(),
      resolve(),
      commonjs(),
    ].filter(Boolean),
  };
}

export default [buildConfig('commonjs'), buildConfig('esm')];

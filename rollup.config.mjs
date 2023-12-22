import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import fs from 'node:fs';

const packageJson = JSON.parse(
  fs.readFileSync('./package.json', { encoding: 'utf8' }),
);

export default {
  input: 'src/index.ts',
  onLog: (level, log, handler) => {
    if (level === 'warn') {
      // treat warnings as errors
      handler('error', log);
    } else {
      handler(level, log);
    }
  },
  output: [
    {
      file: 'dist/cjs/index.js',
      format: 'commonjs',
    },
    {
      file: 'dist/esm/index.mjs',
      format: 'esm',
    },
  ],
  external: Object.keys(packageJson.dependencies),
  plugins: [typescript(), resolve(), commonjs()],
};

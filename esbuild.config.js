const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');
const isProd = process.env.NODE_ENV === 'production';

const buildOptions = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: './dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: !isProd,
  minify: isProd,
  logLevel: 'info',
};

if (isWatch) {
  esbuild.context(buildOptions).then(ctx => {
    ctx.watch();
    console.log('Watching extension host...');
  });
} else {
  esbuild.build(buildOptions).catch(() => process.exit(1));
}

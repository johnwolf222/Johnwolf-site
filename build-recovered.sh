#!/bin/sh
set -eu
npm ci --no-audit --no-fund
(
  cd about-experience-src
  npm install --no-audit --no-fund
  npm run test
  npm run build
)
npm run build
# The main Vite build must copy public/about-experience into dist/about-experience.
test -s dist/about-experience/index.html
test -s dist/about-experience/head-interactive.glb
test -s dist/about-experience/source_meshopt.glb
echo 'Verified: portfolio and 3D About model assets are included.'

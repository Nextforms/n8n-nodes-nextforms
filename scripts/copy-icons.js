'use strict';

// n8n loads a node's icon from beside its compiled file; tsc copies nothing but code.
const fs = require('node:fs');
const path = require('node:path');

const from = path.join(__dirname, '..', 'nodes', 'Nextforms', 'nextforms.svg');
const to = path.join(
    __dirname,
    '..',
    'dist',
    'nodes',
    'Nextforms',
    'nextforms.svg',
);
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);

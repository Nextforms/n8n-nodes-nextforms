'use strict';

// n8n loads an icon from beside the compiled file that names it; tsc copies nothing but
// code. The node and the credential both use the Nextforms icon, light and dark.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const icons = ['nextforms.svg', 'nextforms.dark.svg'];
for (const dir of [
    path.join('dist', 'nodes', 'Nextforms'),
    path.join('dist', 'credentials'),
]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const icon of icons) {
        fs.copyFileSync(
            path.join(root, 'nodes', 'Nextforms', icon),
            path.join(root, dir, icon),
        );
    }
}

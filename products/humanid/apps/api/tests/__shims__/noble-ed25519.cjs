/**
 * CJS shim for @noble/ed25519 v3 (pure ESM package).
 *
 * Jest 29 refuses to require() files inside "type": "module" packages.
 * This shim reads the source, strips the ESM export statement, wraps it
 * in a function scope, and evaluates it to produce CJS-compatible exports.
 *
 * This file is ONLY used during Jest test runs via moduleNameMapper.
 * Production code imports the real ESM package normally.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '../../node_modules/@noble/ed25519/index.js');
let src = fs.readFileSync(srcPath, 'utf8');

// Replace the ESM export statement with assignments to a shared object
// Original: export { etc, getPublicKey, ... };
src = src.replace(
  /^export\s*\{([^}]+)\}\s*;?\s*$/m,
  (_, names) => {
    const ids = names.split(',').map(n => n.trim()).filter(Boolean);
    return ids.map(id => `__exports.${id} = ${id};`).join('\n');
  }
);

const __exports = {};
const script = new vm.Script(`(function(module, exports, require, __exports) {\n${src}\n})`);
const fn = script.runInThisContext();
fn(module, exports, require, __exports);

module.exports = __exports;

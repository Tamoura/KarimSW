/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      diagnostics: false,
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // @noble/ed25519 v3 is pure ESM ("type": "module"). Jest 29 refuses
    // to require() files inside ESM packages. This maps the import to a
    // CJS shim that loads the source via vm.Script, bypassing the check.
    '^@noble/ed25519$': '<rootDir>/tests/__shims__/noble-ed25519.cjs',
    // snarkjs ships ESM-first but includes a CJS build.
    '^snarkjs$': '<rootDir>/node_modules/snarkjs/build/main.cjs',
  },
  transformIgnorePatterns: [
    'node_modules/(?!@noble/ed25519/)',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  // json-summary is required for the CI coverage threshold check script.
  coverageReporters: ['text', 'lcov', 'json-summary'],
  testTimeout: 10000,
  maxWorkers: 1,
};

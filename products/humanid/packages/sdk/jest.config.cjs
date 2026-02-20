module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
  },
  testMatch: ['**/tests/**/*.test.ts'],
  testTimeout: 30000,
};

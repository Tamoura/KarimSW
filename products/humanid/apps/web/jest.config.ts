import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/layout.tsx',   // layout files are just structural, no logic
    '!src/**/page.tsx',     // page files tested via component tests or e2e
  ],
  coverageThreshold: {
    global: {
      lines: 50,
      branches: 40,
      functions: 50,
      statements: 50,
    },
  },
};

export default createJestConfig(config);

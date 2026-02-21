// Re-export everything from backend and frontend sub-packages.
// For tree-shaking, prefer importing from '@karimsw/auth/backend' or '@karimsw/auth/frontend'.
export * from './backend/index.js';
export * from './frontend/index.js';

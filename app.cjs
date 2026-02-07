// CommonJS wrapper for Plesk Passenger compatibility
// Passenger uses require() which doesn't work with ES modules
// This file uses .cjs extension to force CommonJS mode,
// then dynamically imports the ES module server

(async () => {
  try {
    await import('./server/index.js');
  } catch (error) {
    console.error('=== SERVER STARTUP FAILED ===');
    console.error(error);
    process.exit(1);
  }
})();

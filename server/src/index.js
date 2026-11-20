import { config } from './config.js';
import { createApp } from './app.js';
import { oltp, dw } from './db.js';

const server = createApp().listen(config.port, () => {
  console.log(`Kost-DW berjalan di http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  await Promise.allSettled([oltp.end(), dw.end()]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

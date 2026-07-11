import 'dotenv/config';
import express from 'express';
import { migrate } from './db/migrate.js';
import { productsRouter } from './routes/products.js';
import { miscRouter } from './routes/misc.js';
import { startScheduler } from './services/scheduler.js';

migrate();

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/products', productsRouter);
app.use('/api', miscRouter);

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  const { cronExpr } = startScheduler();
  console.log(`[server] listening on http://localhost:${port} (fetch cron: ${cronExpr})`);
});

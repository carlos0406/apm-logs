import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import apmInit from 'elastic-apm-node';

const apm = apmInit.start({
  serviceName: 'express-api2',
  serverUrl: 'http://apm-server:8200',
  environment: 'development',
  secretToken: '', 
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const LOG_PATH = path.join(__dirname, '../logs/app.log');

app.use(express.json());

app.use((req, res, next) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    msg: `Request to ${req.originalUrl}`,
    level: 'info',
  };
  fs.appendFile(LOG_PATH, JSON.stringify(logEntry) + '\n', err => {
    if (err) console.error('Erro ao escrever log:', err);
  });
  next();
});

app.use((req, res, next) => {
  if (apm.currentTransaction) {
    apm.currentTransaction.addLabels({
      req_body: JSON.stringify(req.body),
      req_url: req.originalUrl,
      req_method: req.method,
    });
  }
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'app2', time: new Date().toISOString() });
});

app.post('/echo', (req, res) => {
  res.json({ received: req.body });
});

app.get('/error', (req, res) => {
  throw new Error('This is a test error');
}
);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Express app2 rodando na porta ${PORT}`);
});

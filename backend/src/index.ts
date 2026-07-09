import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes';
import { requireAuth } from './middlewares/authMiddleware';

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'https://tanle-dev-lynstore.web.app'] }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Use the API router for all /api routes
app.use('/api', requireAuth, apiRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

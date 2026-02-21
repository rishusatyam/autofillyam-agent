import 'dotenv/config';
import { createApp } from './app';

const PORT = process.env.PORT ?? 4000;

const app = createApp();

app.listen(PORT, () => {
  console.log(`[Mapper] Server running on http://localhost:${PORT}`);
});

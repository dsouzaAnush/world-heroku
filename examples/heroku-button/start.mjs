import { createServer } from 'node:http';
import { middleware } from './.output/server/index.mjs';

const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const port = Number.isNaN(parsedPort) ? 3000 : parsedPort;
const host = process.env.HOST || '0.0.0.0';

const server = createServer(middleware);

server.listen(port, host, () => {
  console.log(`Listening on http://${host}:${port}`);
});

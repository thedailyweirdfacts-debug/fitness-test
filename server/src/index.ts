import { createProvider, resolveVisionConfig } from "./config";
import { loadEnvFile } from "./env";
import { createServer } from "./server";

loadEnvFile();

const config = resolveVisionConfig(process.env);
const provider = createProvider(config);
const server = createServer({
  provider,
  providerId: config.providerId,
  model: config.model,
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, "0.0.0.0", () => {
  const keyState = config.apiKey ? "key configured" : "no key set, estimates will fail until you add one";
  console.log(`Plateful vision server listening on http://0.0.0.0:${port}`);
  console.log(`Provider ${config.providerId} · model ${config.model} · ${keyState}`);
});

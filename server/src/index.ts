import { loadEnvFile } from "./env";
import { runtimeOptions } from "./runtime";
import { createServer } from "./server";

loadEnvFile();

const options = runtimeOptions();
const server = createServer(options);

const port = Number(process.env.PORT ?? 8787);
server.listen(port, "0.0.0.0", () => {
  const keyState = options.provider ? "key configured" : "no key set, estimates will fail until you add one";
  const secretState = options.appSecret ? "app secret set" : "APP_SECRET missing, estimates will be refused";
  console.log(`Plateful vision server listening on http://0.0.0.0:${port}`);
  console.log(`Provider ${options.providerId} · model ${options.model} · ${keyState} · ${secretState}`);
});

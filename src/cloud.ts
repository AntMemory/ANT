#!/usr/bin/env node
import { startCloudServer } from "./cloudServer";

startCloudServer().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

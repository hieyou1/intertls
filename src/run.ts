#!/usr/bin/env node

import { InterTLS, InterTLSConfiguration } from "./index.js";
import { readFile } from "fs/promises";

await (new InterTLS(JSON.parse(await readFile(process.env.INTERHTTPS_CONFIG ?? "./config.json", "utf-8")) as InterTLSConfiguration)).listen();
console.log("Listening");
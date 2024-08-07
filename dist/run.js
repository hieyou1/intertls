#!/usr/bin/env node
var _a;
import { InterTLS } from "./index.js";
import { readFile } from "fs/promises";
await (new InterTLS(JSON.parse(await readFile((_a = process.env.INTERHTTPS_CONFIG) !== null && _a !== void 0 ? _a : "./config.json", "utf-8")))).listen();
console.log("Listening");
//# sourceMappingURL=run.js.map
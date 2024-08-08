import { createSecureContext, createServer as tls } from 'tls';
import { createServer as tcp } from 'net';
import { fork } from 'child_process';
import { readFile } from "fs/promises";
import { ChildToParentMessageType, ParentToChildMessageType } from "./ipc.js";
import { AlreadyListeningError, UnrecognizedMessageError } from './errors.js';
import { nanoid } from "nanoid";
class InterTLSServer {
    send(...msg) {
        if (this.shouldIpcLog)
            this.itls.trylog("ipc", "->", msg);
        return this.proc.send(msg);
    }
    dynamicTLS(id, opts) {
        this.sniMap.get(id)(opts);
        this.sniMap.delete(id);
    }
    data(id, data) {
        this.sockMap.get(id).write(Buffer.from(data, this.itls.encoding));
    }
    end(id) {
        var _a;
        (_a = this.sockMap.get(id)) === null || _a === void 0 ? void 0 : _a.end();
        this.sockMap.delete(id);
    }
    genId(sock) {
        let id;
        while (true) {
            id = nanoid();
            if (!(sock ? this.sockMap : this.sniMap).has(id))
                return id;
        }
    }
    sni(host) {
        if (!this.dynamic)
            return;
        let sniId = this.genId(false);
        let retSni;
        let prom = new Promise((resolve) => retSni = resolve);
        this.sniMap.set(sniId, retSni);
        this.send(ParentToChildMessageType.DYNAMIC_TLS, sniId, host);
        return prom;
    }
    async newSock(sock, encrypted, dataEvents = []) {
        let sockId = this.genId(true);
        this.sockMap.set(sockId, sock);
        this.send(ParentToChildMessageType.OPEN, sockId, encrypted, ((encrypted) ? this.itls.tlsPort : this.itls.tcpPort), sock.remoteAddress, sock.remotePort);
        sock.on("data", (chunk) => {
            this.send(ParentToChildMessageType.DATA, sockId, chunk.toString(this.itls.encoding));
        });
        sock.on("end", () => {
            this.send(ParentToChildMessageType.END, sockId);
            this.sockMap.delete(sockId);
        });
        while (dataEvents.length > 0) {
            this.send(ParentToChildMessageType.DATA, sockId, dataEvents.shift().toString(this.itls.encoding));
        }
        sock.resume();
    }
    async init() {
        let readyResolve;
        let ready = new Promise((resolve) => readyResolve = resolve);
        this.proc.on("message", async (msg) => {
            if (this.shouldIpcLog)
                this.itls.trylog("ipc", "<-", msg);
            switch (msg.shift()) {
                case ChildToParentMessageType.READY: {
                    readyResolve();
                    await this.itls.listenPromise;
                    this.send(ParentToChildMessageType.HELLO, this.itls.encoding, this.itls.localAddress, this.shouldHandlerLog);
                    break;
                }
                case ChildToParentMessageType.DYNAMIC_TLS: {
                    this.dynamicTLS(...msg);
                    break;
                }
                case ChildToParentMessageType.DATA: {
                    this.data(...msg);
                    break;
                }
                case ChildToParentMessageType.END: {
                    this.end(...msg);
                    break;
                }
                case ChildToParentMessageType.LOG: {
                    this.itls.trylog("handler", ...msg);
                    break;
                }
                default: {
                    throw new UnrecognizedMessageError(msg);
                }
            }
        });
        await ready;
    }
    constructor(itls, proc, shouldIpcLog, shouldHandlerLog, dynamic) {
        this.itls = itls;
        this.proc = proc;
        this.sockMap = new Map();
        this.shouldIpcLog = shouldIpcLog;
        this.shouldHandlerLog = shouldHandlerLog;
        this.dynamic = dynamic;
        if (dynamic)
            this.sniMap = new Map();
    }
}
export class InterTLS {
    constructor(config) {
        var _a;
        this.config = config;
        this.encoding = (_a = config.encoding) !== null && _a !== void 0 ? _a : "base64";
        this.configMap = new Map();
        this.serverMap = new Map();
        this.listenPromise = new Promise((resolve) => this.listenResolver = resolve);
        this.listening = false;
        this.inited = false;
    }
    async trylog(type, ...args) {
        if (!this.config.log)
            return;
        if (this.config.log === true || this.config.log.includes(type))
            console.log(`${type} at ${new Date().toISOString()}:`, ...args);
    }
    sni(serverName, cb) {
        (new Promise(async (resolve, reject) => {
            this.trylog("sni", "SNI for", serverName);
            let host = serverName;
            if (!this.serverMap.has(host))
                host = "default";
            if (!this.serverMap.has(host)) {
                this.trylog("sni", "Unknown host:", serverName);
                return reject("Invalid serverName");
            }
            let config = this.configMap.get(host);
            this.trylog("sni", host, "found");
            let opts;
            if (config.tls.dynamic == true) {
                this.trylog("sni", host, "is dynamic");
                opts = await this.serverMap.get(host).sni(host);
            }
            else {
                opts = Object.assign(Object.assign({}, config.tls), { cert: await readFile(config.tls.cert, "utf8"), key: await readFile(config.tls.key, "utf8") });
                if (config.tls.ca)
                    opts.ca = await readFile(config.tls.ca);
                this.trylog("sni", "Sending cert", opts.cert);
                this.trylog("sni", "Key exists?:", opts.key != "");
                this.trylog("sni", "CA exists?:", opts.ca != "");
            }
            resolve(createSecureContext(opts));
        })).then((ctx) => cb(null, ctx), (err) => cb(err));
    }
    async init() {
        var _a, _b;
        if (this.inited)
            return;
        this.inited = true;
        this.trylog("init", "Begin init");
        let ready = [];
        let shouldIpcLog = this.config.log === true || (Array.isArray(this.config.log) && this.config.log.includes("ipc"));
        let shouldHandlerLog = this.config.log === true || (Array.isArray(this.config.log) && this.config.log.includes("handler"));
        for (let i of this.config.servers) {
            if (Array.isArray(i.host)) {
                for (let j of i.host)
                    this.configMap.set(j, i);
            }
            else {
                this.configMap.set(i.host, i);
            }
            this.trylog("init", i.host, "config set");
            let server = new InterTLSServer(this, fork(i.process.main, {
                "cwd": i.process.cwd,
                "uid": i.process.uid,
                "gid": i.process.gid,
                "env": (_a = i.process.env) !== null && _a !== void 0 ? _a : {},
                "execArgv": [],
                "silent": !(this.config.log === true || (Array.isArray(this.config.log) && this.config.log.includes("child_procs")))
            }), shouldIpcLog, shouldHandlerLog, ((_b = i.tls) === null || _b === void 0 ? void 0 : _b.dynamic) === true);
            ready.push(server.init());
            if (Array.isArray(i.host)) {
                for (let j of i.host)
                    this.serverMap.set(j, server);
            }
            else {
                this.serverMap.set(i.host, server);
            }
            this.trylog("init", i.host, "forked");
        }
        this.trylog("init", "Configmap made:", this.configMap);
        await Promise.all(ready);
        this.trylog("init", "All ready");
        let tlsOpts = {
            pauseOnConnect: true,
            "SNICallback": this.sni.bind(this)
        };
        if (this.config.ipFallback) {
            tlsOpts = Object.assign(Object.assign({}, tlsOpts), this.config.ipFallback);
            tlsOpts.cert = await readFile(this.config.ipFallback.cert, "utf-8");
            tlsOpts.key = await readFile(this.config.ipFallback.key, "utf-8");
            if (tlsOpts.ca)
                tlsOpts.ca = await readFile(this.config.ipFallback.ca, "utf-8");
        }
        this.tlsServer = tls(tlsOpts, (sock) => {
            this.trylog("newsock", "New TLS socket");
            let host = sock.servername;
            if (!this.serverMap.has(host))
                host = "default";
            if (!this.serverMap.has(host)) {
                this.trylog("newsock", "Unknown host:", sock.servername);
                sock.destroy();
                return;
            }
            this.serverMap.get(host).newSock(sock, true);
        });
        this.trylog("init", "TLS server up");
        if (this.config.tcpFallback) {
            this.tcpServer = tcp({
                pauseOnConnect: true
            }, (sock) => {
                this.trylog("newsock", "New TCP socket");
                let dataEvents = [];
                let hostDetermined = false;
                sock.on('data', (chunk) => {
                    if (hostDetermined)
                        return;
                    dataEvents.push(chunk);
                    const match = chunk.toString().match(/Host: ([^\r\n]*)/i);
                    if (match) {
                        sock.pause();
                        hostDetermined = true;
                        let host = match[1];
                        if (!this.serverMap.has(host))
                            host = "default";
                        if (!this.serverMap.has(host)) {
                            this.trylog("newsock", "Unknown host:", match[1]);
                            sock.destroy();
                            return;
                        }
                        this.serverMap.get(host).newSock(sock, false, dataEvents);
                    }
                });
                sock.resume();
            });
            this.trylog("init", "TCP server up");
        }
        this.trylog("init", "init complete");
    }
    async listen() {
        if (this.listening)
            throw new AlreadyListeningError();
        this.listening = true;
        await this.init();
        await new Promise((resolve) => this.tlsServer.listen(this.config.port, resolve));
        if (this.config.tcpFallback)
            await new Promise((resolve) => this.tcpServer.listen(this.config.tcpPort, resolve));
        let { address, port } = this.tlsServer.address();
        this.localAddress = address;
        this.tlsPort = port;
        if (this.config.tcpFallback)
            this.tcpPort = this.tcpServer.address().port;
        this.listenResolver();
    }
}
//# sourceMappingURL=index.js.map
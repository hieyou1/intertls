import { createSecureContext, createServer as tls } from 'tls';
import { createServer as tcp } from 'net';
import { fork } from 'child_process';
import { readFile } from "fs/promises";
import { ChildToParentMessageType, ParentToChildMessageType } from "./ipc.js";
import { AlreadyListeningError, UnrecognizedMessageError } from './errors.js';
import { nanoid } from "nanoid";
class InterTLSServer {
    data(id, data) {
        this.sockMap.get(id).write(Buffer.from(data, this.itls.encoding));
    }
    end(id) {
        var _a;
        (_a = this.sockMap.get(id)) === null || _a === void 0 ? void 0 : _a.end();
    }
    async newSock(sock, encrypted, dataEvents = []) {
        let sockId;
        while (true) {
            sockId = nanoid();
            if (!this.sockMap.has(sockId)) {
                this.sockMap.set(sockId, sock);
                break;
            }
        }
        this.proc.send([ParentToChildMessageType.OPEN, sockId, encrypted, ((encrypted) ? this.itls.tlsPort : this.itls.tcpPort), sock.remoteAddress, sock.remotePort]);
        sock.on("data", (chunk) => {
            this.proc.send([ParentToChildMessageType.DATA, sockId, chunk.toString(this.itls.encoding)]);
        });
        sock.on("end", () => {
            this.proc.send([ParentToChildMessageType.END, sockId]);
        });
        while (dataEvents.length > 0) {
            this.proc.send([ParentToChildMessageType.DATA, sockId, dataEvents.shift().toString(this.itls.encoding)]);
        }
        sock.resume();
    }
    async init() {
        let readyResolve;
        let ready = new Promise((resolve) => readyResolve = resolve);
        this.proc.on("message", async (msg) => {
            console.log("<-", msg);
            switch (msg.shift()) {
                case ChildToParentMessageType.READY: {
                    readyResolve();
                    await this.itls.listenPromise;
                    this.proc.send([ParentToChildMessageType.HELLO, this.itls.encoding, this.itls.localAddress]);
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
                default: {
                    throw new UnrecognizedMessageError(msg);
                }
            }
        });
        await ready;
    }
    constructor(itls, proc) {
        this.itls = itls;
        this.proc = proc;
        this.sockMap = new Map();
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
    sni(serverName, cb) {
        (new Promise(async (resolve, reject) => {
            console.log("SNI for", serverName);
            console.log("S: configMap:", this.configMap);
            let server = this.configMap.get(serverName);
            if (!server)
                reject("Invalid serverName");
            console.log("S:", serverName, "found");
            let opts = Object.assign(Object.assign({}, server.tls), { cert: await readFile(server.tls.cert, "utf8"), key: await readFile(server.tls.key, "utf8") });
            if (server.tls.ca)
                opts.ca = await readFile(server.tls.ca);
            console.log("S: Sending back (cert only)", opts.cert);
            console.log("S: Key exists?:", opts.key != "");
            console.log("S: CA exists?: ", opts.ca != "");
            resolve(createSecureContext(opts));
        })).then((ctx) => cb(null, ctx), (err) => cb(err));
    }
    async init() {
        var _a;
        if (this.inited)
            return;
        this.inited = true;
        console.log("I: Begin init()");
        let ready = [];
        for (let i of this.config.servers) {
            this.configMap.set(i.host, i);
            console.log("I:", i.host, "config set");
            let tlsOpts = Object.assign({}, i.tls);
            if (tlsOpts.ca)
                tlsOpts.ca = await readFile(tlsOpts.ca, "utf-8");
            tlsOpts.cert = await readFile(tlsOpts.cert, "utf-8");
            tlsOpts.key = await readFile(tlsOpts.key, "utf-8");
            let server = new InterTLSServer(this, fork(i.process.main, {
                "cwd": i.process.cwd,
                "uid": i.process.uid,
                "gid": i.process.gid,
                "env": (_a = i.process.env) !== null && _a !== void 0 ? _a : {},
                "execArgv": [],
                "silent": false
            }));
            ready.push(server.init());
            this.serverMap.set(i.host, server);
            console.log("I:", i.host, "forked");
        }
        console.log("I: Configmap made:", this.configMap);
        await Promise.all(ready);
        console.log("I: All ready");
        this.tlsServer = tls({
            pauseOnConnect: true,
            "SNICallback": this.sni.bind(this)
        }, (sock) => {
            console.log("New TLS socket!");
            let host = sock.servername;
            if (!this.serverMap.has(host))
                host = "default";
            if (!this.serverMap.has(host)) {
                console.log("Unknown host:", host);
                sock.destroy();
            }
            this.serverMap.get(host).newSock(sock, true);
        });
        console.log("I: TLS Server up");
        if (this.config.tcpFallback)
            this.tcpServer = tcp({
                pauseOnConnect: true
            }, (sock) => {
                console.log("New TCP socket!");
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
                            console.log("Unknown host:", host);
                            sock.destroy();
                        }
                        this.serverMap.get(host).newSock(sock, false, dataEvents);
                    }
                });
                sock.resume();
            });
        console.log("I: TCP Server up");
        console.log("init() complete");
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
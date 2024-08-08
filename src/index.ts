import { createSecureContext, SecureContext, SecureContextOptions, TLSSocket, createServer as tls, Server as TLSServer } from 'tls';
import { Socket as TCPSocket, Server as TCPServer, createServer as tcp } from 'net';
import { ChildProcess, fork } from 'child_process';
import { readFile } from "fs/promises";
import { ChildToParentMessage, ChildToParentMessageType, ParentToChildMessage, ParentToChildMessageType } from "./ipc.js";
import { AlreadyListeningError, UnrecognizedMessageError } from './errors.js';
import { AddressInfo } from 'net';
import { nanoid } from "nanoid";

export type LogType = "newsock" | "sni" | "ipc" | "child_procs" | "init" | "handler";

export interface ServerConfiguration {
    host: string;
    tls: {
        dynamic: true;
    } | {
        dynamic?: false;
        ca?: string;
        cert: string;
        key: string;
        requestCert: boolean;
        rejectUnauthorized?: boolean;
    };
    process: {
        main: string;
        cwd: string;
        uid?: number;
        gid?: number;
        env?: { [envVar: string]: string; };
    };
}

export interface InterTLSConfiguration {
    $schema?: string;
    encoding?: BufferEncoding;
    port: string | number;
    tcpFallback?: boolean;
    tcpPort?: string | number;
    servers: ServerConfiguration[];
    log?: boolean | LogType[];
}

class InterTLSServer {
    private itls: InterTLS;
    private sniMap: Map<string, ((opts: SecureContextOptions) => void)>;
    private sockMap: Map<string, TLSSocket | TCPSocket>;
    private dynamic: boolean;
    private shouldIpcLog: boolean;
    private shouldHandlerLog: boolean;

    proc: ChildProcess;
    tlsOpts: ServerConfiguration["tls"];

    private send(...msg: ParentToChildMessage): boolean {
        if (this.shouldIpcLog) this.itls.trylog("ipc", "->", msg);
        return this.proc.send(msg);
    }

    private dynamicTLS(id: string, opts: SecureContextOptions) {
        this.sniMap.get(id)(opts);
        this.sniMap.delete(id);
    }

    private data(id: string, data: string) {
        this.sockMap.get(id).write(Buffer.from(data, this.itls.encoding));
    }

    private end(id: string) {
        this.sockMap.get(id)?.end();
        this.sockMap.delete(id);
    }

    private genId(sock: boolean) {
        let id;
        while (true) {
            id = nanoid();
            if (!(sock ? this.sockMap : this.sniMap).has(id)) return id;
        }
    }

    sni(host: string): Promise<SecureContextOptions> {
        if (!this.dynamic) return;
        let sniId = this.genId(false);
        let retSni: (opts: SecureContextOptions) => void;
        let prom = new Promise<SecureContextOptions>((resolve) => retSni = resolve);
        this.sniMap.set(sniId, retSni);

        this.send(ParentToChildMessageType.DYNAMIC_TLS, sniId, host);

        return prom;
    }

    async newSock(sock: TLSSocket, encrypted: true): Promise<void>
    async newSock(sock: TCPSocket, encrypted: false, dataEvents: Buffer[]): Promise<void>
    async newSock(sock: TLSSocket | TCPSocket, encrypted: boolean, dataEvents: Buffer[] = []): Promise<void> {
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

        // For any events captured while TCP host detection was incomplete
        while (dataEvents.length > 0) {
            this.send(ParentToChildMessageType.DATA, sockId, dataEvents.shift().toString(this.itls.encoding));
        }

        sock.resume();
    }

    async init(): Promise<void> {
        let readyResolve: () => void;
        let ready = new Promise<void>((resolve) => readyResolve = resolve);
        this.proc.on("message", async (msg: ChildToParentMessage) => {
            if (this.shouldIpcLog) this.itls.trylog("ipc", "<-", msg);
            switch (msg.shift()) {
                case ChildToParentMessageType.READY: {
                    readyResolve();
                    await this.itls.listenPromise;
                    this.send(ParentToChildMessageType.HELLO, this.itls.encoding, this.itls.localAddress, this.shouldHandlerLog);
                    break;
                }
                case ChildToParentMessageType.DYNAMIC_TLS: {
                    // @ts-ignore
                    this.dynamicTLS(...msg);
                    break;
                }
                case ChildToParentMessageType.DATA: {
                    // @ts-ignore
                    this.data(...msg);
                    break;
                }
                case ChildToParentMessageType.END: {
                    // @ts-ignore
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

    constructor(itls: InterTLS, proc: ChildProcess, shouldIpcLog: boolean, shouldHandlerLog: boolean, dynamic: boolean) {
        this.itls = itls;
        this.proc = proc;
        this.sockMap = new Map();
        this.shouldIpcLog = shouldIpcLog;
        this.shouldHandlerLog = shouldHandlerLog;
        this.dynamic = dynamic;
        if (dynamic) this.sniMap = new Map();
    }
}

export class InterTLS {
    private config: InterTLSConfiguration;
    private configMap: Map<string, ServerConfiguration>;
    private serverMap: Map<string, InterTLSServer>;

    private listenResolver: () => void;
    listenPromise: Promise<void>;

    encoding: BufferEncoding;
    inited: boolean;
    listening: boolean;
    tcpServer: TCPServer;
    tlsServer?: TLSServer;
    localAddress?: string;
    tlsPort?: number;
    tcpPort?: number;

    constructor(config: InterTLSConfiguration) {
        this.config = config;
        this.encoding = config.encoding ?? "base64";
        this.configMap = new Map();
        this.serverMap = new Map();
        this.listenPromise = new Promise<void>((resolve) => this.listenResolver = resolve);
        this.listening = false;
        this.inited = false;
    }

    async trylog(type: LogType, ...args: any): Promise<void> {
        if (!this.config.log) return;
        if (this.config.log === true || (this.config.log as LogType[]).includes(type))
            console.log(`${type} at ${new Date().toISOString()}:`, ...args);
    }

    private sni(serverName: string, cb: (err: Error | null, ctx?: SecureContext) => void) {
        (new Promise<SecureContext>(async (resolve, reject) => {
            this.trylog("sni", "SNI for", serverName);

            let host = serverName;
            if (!this.serverMap.has(host)) host = "default";
            if (!this.serverMap.has(host)) {
                this.trylog("sni", "Unknown host:", serverName);
                return reject("Invalid serverName");
            }

            let config = this.configMap.get(host);
            this.trylog("sni", host, "found");

            let opts: Partial<SecureContextOptions>;

            if (config.tls.dynamic == true) {
                this.trylog("sni", host, "is dynamic");
                opts = await this.serverMap.get(host).sni(host);
            } else {
                opts = {
                    ...config.tls,
                    cert: await readFile(config.tls.cert, "utf8"),
                    key: await readFile(config.tls.key, "utf8")
                };
                if (config.tls.ca) opts.ca = await readFile(config.tls.ca);

                this.trylog("sni", "Sending cert", opts.cert);
                this.trylog("sni", "Key exists?:", opts.key != "");
                this.trylog("sni", "CA exists?:", opts.ca != "");
            }

            resolve(createSecureContext(opts));
        })).then((ctx) => cb(null, ctx), (err) => cb(err));
    }

    async init(): Promise<void> {
        if (this.inited) return;
        this.inited = true;
        this.trylog("init", "Begin init");
        let ready: Promise<void>[] = [];
        let shouldIpcLog = this.config.log === true || (Array.isArray(this.config.log) && (this.config.log as LogType[]).includes("ipc"));
        let shouldHandlerLog = this.config.log === true || (Array.isArray(this.config.log) && (this.config.log as LogType[]).includes("handler"));
        for (let i of this.config.servers) {
            this.configMap.set(i.host, i);
            this.trylog("init", i.host, "config set");

            let server = new InterTLSServer(this, fork(i.process.main, {
                "cwd": i.process.cwd,
                "uid": i.process.uid,
                "gid": i.process.gid,
                "env": i.process.env ?? {},
                "execArgv": [],
                "silent": this.config.log === true || (Array.isArray(this.config.log) && (this.config.log as LogType[]).includes("child_procs"))
            }), shouldIpcLog, shouldHandlerLog, i.tls?.dynamic === true);
            ready.push(server.init());
            this.serverMap.set(i.host, server);
            this.trylog("init", i.host, "forked");
        }
        this.trylog("init", "Configmap made:", this.configMap);
        await Promise.all(ready);
        this.trylog("init", "All ready");
        this.tlsServer = tls({
            pauseOnConnect: true,
            "SNICallback": this.sni.bind(this)
        }, (sock) => {
            this.trylog("newsock", "New TLS socket");
            // @ts-ignore
            let host = sock.servername;
            if (!this.serverMap.has(host)) host = "default";
            if (!this.serverMap.has(host)) {
                // @ts-ignore
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
                    if (hostDetermined) return;
                    dataEvents.push(chunk);

                    const match = chunk.toString().match(/Host: ([^\r\n]*)/i);
                    if (match) {
                        sock.pause();
                        hostDetermined = true;

                        let host = match[1];
                        if (!this.serverMap.has(host)) host = "default";
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
        if (this.listening) throw new AlreadyListeningError();
        this.listening = true;
        await this.init();
        await new Promise<void>((resolve) => this.tlsServer.listen(this.config.port, resolve));
        if (this.config.tcpFallback) await new Promise<void>((resolve) => this.tcpServer.listen(this.config.tcpPort, resolve));
        let { address, port } = this.tlsServer.address() as AddressInfo;
        this.localAddress = address;
        this.tlsPort = port;
        if (this.config.tcpFallback) this.tcpPort = (this.tcpServer.address() as AddressInfo).port;
        this.listenResolver();
    }
}
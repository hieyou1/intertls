import { createSecureContext, SecureContext, SecureContextOptions, TLSSocket, createServer as tls, Server as TLSServer } from 'tls';
import { Socket as TCPSocket, Server as TCPServer, createServer as tcp } from 'net';
import { ChildProcess, fork } from 'child_process';
import { readFile } from "fs/promises";
import { ChildToParentMessage, ChildToParentMessageType, ParentToChildMessage, ParentToChildMessageType } from "./ipc.js";
import { AlreadyListeningError, UnrecognizedMessageError } from './errors.js';
import { AddressInfo } from 'net';
import { nanoid } from "nanoid";

export interface ServerConfiguration {
    host: string;
    tls: {
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
}

class InterTLSServer {
    private itls: InterTLS;
    private sockMap: Map<string, TLSSocket | TCPSocket>;

    proc: ChildProcess;
    tlsOpts: ServerConfiguration["tls"];

    private data(id: string, data: string) {
        this.sockMap.get(id).write(Buffer.from(data, this.itls.encoding));
    }

    private end(id: string) {
        this.sockMap.get(id)?.end();
    }


    async newSock(sock: TLSSocket, encrypted: true): Promise<void>
    async newSock(sock: TCPSocket, encrypted: false, dataEvents: Buffer[]): Promise<void>
    async newSock(sock: TLSSocket | TCPSocket, encrypted: boolean, dataEvents: Buffer[] = []): Promise<void> {
        let sockId;
        while (true) {
            sockId = nanoid();
            if (!this.sockMap.has(sockId)) {
                this.sockMap.set(sockId, sock);
                break;
            }
        }

        this.proc.send([ParentToChildMessageType.OPEN, sockId, encrypted, ((encrypted) ? this.itls.tlsPort : this.itls.tcpPort), sock.remoteAddress, sock.remotePort] as ParentToChildMessage);

        sock.on("data", (chunk) => {
            this.proc.send([ParentToChildMessageType.DATA, sockId, chunk.toString(this.itls.encoding)] as ParentToChildMessage);
        });

        sock.on("end", () => {
            this.proc.send([ParentToChildMessageType.END, sockId] as ParentToChildMessage);
        });

        // For any events captured while TCP host detection was incomplete
        while (dataEvents.length > 0) {
            this.proc.send([ParentToChildMessageType.DATA, sockId, dataEvents.shift().toString(this.itls.encoding)] as ParentToChildMessage);
        }

        sock.resume();
    }

    async init(): Promise<void> {
        let readyResolve: () => void;
        let ready = new Promise<void>((resolve) => readyResolve = resolve);
        this.proc.on("message", async (msg: ChildToParentMessage) => {
            console.log("<-", msg);
            switch (msg.shift()) {
                case ChildToParentMessageType.READY: {
                    readyResolve();
                    await this.itls.listenPromise;
                    this.proc.send([ParentToChildMessageType.HELLO, this.itls.encoding, this.itls.localAddress] as ParentToChildMessage);
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
                default: {
                    throw new UnrecognizedMessageError(msg);
                }
            }
        });
        await ready;
    }

    constructor(itls: InterTLS, proc: ChildProcess) {
        this.itls = itls;
        this.proc = proc;
        this.sockMap = new Map();
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

    private sni(serverName: string, cb: (err: Error | null, ctx?: SecureContext) => void) {
        (new Promise<SecureContext>(async (resolve, reject) => {
            console.log("SNI for", serverName);
            console.log("S: configMap:", this.configMap);
            let server = this.configMap.get(serverName);

            if (!server) reject("Invalid serverName");
            console.log("S:", serverName, "found");

            let opts = {
                ...server.tls,
                cert: await readFile(server.tls.cert, "utf8"),
                key: await readFile(server.tls.key, "utf8")
            } as Partial<SecureContextOptions>;
            if (server.tls.ca) opts.ca = await readFile(server.tls.ca);

            console.log("S: Sending back (cert only)", opts.cert);
            console.log("S: Key exists?:", opts.key != "");
            console.log("S: CA exists?: ", opts.ca != "");
            resolve(createSecureContext(opts));
        })).then((ctx) => cb(null, ctx), (err) => cb(err));
    }

    async init(): Promise<void> {
        if (this.inited) return;
        this.inited = true;
        console.log("I: Begin init()");
        let ready: Promise<void>[] = [];
        for (let i of this.config.servers) {
            this.configMap.set(i.host, i);
            console.log("I:", i.host, "config set");
            let tlsOpts = { ...i.tls };
            if (tlsOpts.ca) tlsOpts.ca = await readFile(tlsOpts.ca, "utf-8");
            tlsOpts.cert = await readFile(tlsOpts.cert, "utf-8");
            tlsOpts.key = await readFile(tlsOpts.key, "utf-8");

            let server = new InterTLSServer(this, fork(i.process.main, {
                "cwd": i.process.cwd,
                "uid": i.process.uid,
                "gid": i.process.gid,
                "env": i.process.env ?? {},
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
            // @ts-ignore
            this.serverMap.get(sock.servername).newSock(sock, true);
        });
        console.log("I: TLS Server up");
        if (this.config.tcpFallback) this.tcpServer = tcp({
            pauseOnConnect: true
        }, (sock) => {
            console.log("New TCP socket!");
            let dataEvents = [];
            let hostDetermined = false;
            sock.on('data', (chunk) => {
                if (hostDetermined) return;
                dataEvents.push(chunk);

                const match = chunk.toString().match(/Host: ([^\r\n]*)/i);
                if (match) {
                    sock.pause();
                    hostDetermined = true;
                    this.serverMap.get(match[1]).newSock(sock, false, dataEvents);
                }
            });
            sock.resume();
        });
        console.log("I: TCP Server up");
        console.log("init() complete");
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
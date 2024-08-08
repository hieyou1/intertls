import { Duplex, DuplexOptions } from "stream";
import { ParentToChildMessage, ChildToParentMessage, ParentToChildMessageType, ChildToParentMessageType } from "./ipc.js";
import { UnrecognizedMessageError, AlreadyListeningError } from "./errors.js";
import { Server } from "http";
import { SecureContextOptions } from "tls";

class MockTcp extends Duplex {
    id: string;
    encrypted: boolean;
    encoding: BufferEncoding;

    private buffer: any[];
    private reading: boolean;

    remoteAddress?: string;
    remotePort?: number;
    localAddress?: string;
    localPort?: number;


    constructor(opts: {
        id: string,
        encrypted: boolean,
        encoding: BufferEncoding,
        localAddress?: string,
        localPort?: number,
        remoteAddress?: string,
        remotePort?: number,
        duplex?: DuplexOptions
    }) {
        if (opts.duplex) super(opts.duplex); else super();
        this.id = opts.id;
        this.encoding = opts.encoding;
        this.encrypted = opts.encrypted;
        this.remoteAddress = opts.remoteAddress;
        this.remotePort = opts.remotePort;

        this.buffer = [];
        this.reading = false;
    }

    _read(size?: number) {
        if (size === undefined) size = this.readableHighWaterMark;

        if (this.reading) return;
        this.reading = true;

        while (this.buffer.length > 0 && size > 0) {
            const chunk = this.buffer.shift();
            const toPush = chunk.slice(0, size);
            this.push(toPush);
            size -= toPush.length;

            if (chunk.length > toPush.length) {
                this.buffer.unshift(chunk.slice(toPush.length));
            }
        }

        this.reading = false;
    }

    writeAsClient(chunk: Buffer) {
        this.buffer.push(chunk);
        this._read();
    }

    _write(chunk: any, encoding: BufferEncoding, callback: (err: Error | null) => void): void {
        process.send([ChildToParentMessageType.DATA, this.id, (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)).toString(this.encoding)] as ChildToParentMessage, callback);
    }
}

export interface InterTLSHandlerOptions {
    dynamicTLS?: (host: string) => Promise<SecureContextOptions>;
    autoListen?: boolean;
    override?: {
        localAddress?: string;
        localPort?: number;
    }
}

export class InterTLSHandler {
    private opts: InterTLSHandlerOptions;

    server: Server;
    listening: boolean;

    encoding: BufferEncoding;
    localAddress: string;

    streamMap: Map<string, MockTcp>;


    private hello(encoding: BufferEncoding, localAddress: string, localPort: number) {
        this.encoding = encoding;
        if (!this.opts.override.localAddress) this.localAddress = localAddress;
    }

    private async dynamicTLS(id: string, host: string) {
        process.send([ChildToParentMessageType.DYNAMIC_TLS, id, await this.opts.dynamicTLS(host)] as ChildToParentMessage);
    }

    private open(id: string, encrypted: boolean, localPort: number, remoteAddress: string, remotePort: number) {
        let stream = new MockTcp({
            id,
            remoteAddress,
            "encoding": this.encoding,
            remotePort,
            encrypted,
            "localAddress": this.localAddress,
            localPort
        });
        stream.pause();
        this.streamMap.set(id, stream);
        stream.on("end", () => process.send([ChildToParentMessageType.END, id] as ChildToParentMessage));
        stream.on("close", () => this.streamMap.delete(id));
        this.server.emit("connection", stream);
        stream.resume();
    }

    private data(id: string, data: string) {
        this.streamMap.get(id).writeAsClient(Buffer.from(data, this.encoding));
    }

    private end(id: string) {
        this.streamMap.get(id)?.end();
    }


    listen(): Server {
        if (this.listening) throw new AlreadyListeningError();
        this.listening = true;
        process.on("message", async (msg: ParentToChildMessage) => {
            switch (msg.shift()) {
                case ParentToChildMessageType.HELLO: {
                    // @ts-ignore
                    this.hello(...msg);
                    break;
                }
                case ParentToChildMessageType.DYNAMIC_TLS: {
                    // @ts-ignore
                    this.dynamicTLS(...msg);
                    break;
                }
                case ParentToChildMessageType.OPEN: {
                    // @ts-ignore
                    this.open(...msg);
                    break;
                }
                case ParentToChildMessageType.DATA: {
                    // @ts-ignore
                    this.data(...msg);
                    break;
                }
                case ParentToChildMessageType.END: {
                    // @ts-ignore
                    this.end(...msg);
                    break;
                }
                default: {
                    throw new UnrecognizedMessageError(msg);
                }
            }
        });
        process.send([ChildToParentMessageType.READY] as ChildToParentMessage);
        return this.server;
    }

    constructor(server: Server, options?: InterTLSHandlerOptions) {
        if (!options) options = {};
        if (!options.override) options.override = {};
        this.opts = options;

        if (options.override.localAddress) this.localAddress = options.override.localAddress;

        this.server = server;
        this.streamMap = new Map();

        if (options.autoListen !== false) this.listen();
    }
}

export default function interTLS(server: Server, options?: InterTLSHandlerOptions) {
    if (!process.send) throw new Error("InterTLS supervisor not present");
    return new InterTLSHandler(server, options);
};
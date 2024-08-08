import { Duplex } from "stream";
import { ParentToChildMessageType, ChildToParentMessageType } from "./ipc.js";
import { UnrecognizedMessageError, AlreadyListeningError } from "./errors.js";
class MockTcp extends Duplex {
    constructor(opts) {
        if (opts.duplex)
            super(opts.duplex);
        else
            super();
        this.id = opts.id;
        this.encoding = opts.encoding;
        this.encrypted = opts.encrypted;
        this.remoteAddress = opts.remoteAddress;
        this.remotePort = opts.remotePort;
        this.buffer = [];
        this.reading = false;
    }
    _read(size) {
        if (size === undefined)
            size = this.readableHighWaterMark;
        if (this.reading)
            return;
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
    writeAsClient(chunk) {
        this.buffer.push(chunk);
        this._read();
    }
    _write(chunk, encoding, callback) {
        process.send([ChildToParentMessageType.DATA, this.id, (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)).toString(this.encoding)], callback);
    }
}
export class InterTLSHandler {
    log(...args) {
        if (this.shouldHandlerLog)
            process.send([ChildToParentMessageType.LOG, ...args]);
    }
    hello(encoding, localAddress, shouldHandlerLog) {
        this.encoding = encoding;
        this.shouldHandlerLog = shouldHandlerLog;
        if (!this.opts.override.localAddress)
            this.localAddress = localAddress;
    }
    async dynamicTLS(id, host) {
        process.send([ChildToParentMessageType.DYNAMIC_TLS, id, await this.opts.dynamicTLS(host)]);
    }
    open(id, encrypted, localPort, remoteAddress, remotePort) {
        this.log(id, "start open");
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
        stream.on("end", () => process.send([ChildToParentMessageType.END, id]));
        stream.on("close", () => this.streamMap.delete(id));
        this.server.emit("connection", stream);
        stream.resume();
        this.log(id, "opened");
    }
    data(id, data) {
        this.log(id, "data");
        this.streamMap.get(id).writeAsClient(Buffer.from(data, this.encoding));
    }
    end(id) {
        var _a;
        this.log(id, "end");
        (_a = this.streamMap.get(id)) === null || _a === void 0 ? void 0 : _a.end();
    }
    listen() {
        if (this.listening)
            throw new AlreadyListeningError();
        this.listening = true;
        process.on("message", async (msg) => {
            switch (msg.shift()) {
                case ParentToChildMessageType.HELLO: {
                    this.hello(...msg);
                    break;
                }
                case ParentToChildMessageType.DYNAMIC_TLS: {
                    this.dynamicTLS(...msg);
                    break;
                }
                case ParentToChildMessageType.OPEN: {
                    this.open(...msg);
                    break;
                }
                case ParentToChildMessageType.DATA: {
                    this.data(...msg);
                    break;
                }
                case ParentToChildMessageType.END: {
                    this.end(...msg);
                    break;
                }
                default: {
                    throw new UnrecognizedMessageError(msg);
                }
            }
        });
        process.send([ChildToParentMessageType.READY]);
        return this.server;
    }
    constructor(server, options) {
        if (!options)
            options = {};
        if (!options.override)
            options.override = {};
        this.opts = options;
        if (options.override.localAddress)
            this.localAddress = options.override.localAddress;
        this.server = server;
        this.streamMap = new Map();
        if (options.autoListen !== false)
            this.listen();
    }
}
export default function interTLS(server, options) {
    if (!process.send)
        throw new Error("InterTLS supervisor not present");
    return new InterTLSHandler(server, options);
}
;
//# sourceMappingURL=handler.js.map
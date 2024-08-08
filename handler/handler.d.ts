import { Duplex, DuplexOptions } from "stream";
import { Server } from "http";
import { SecureContextOptions } from "tls";
declare class MockTcp extends Duplex {
    id: string;
    encrypted: boolean;
    encoding: BufferEncoding;
    private buffer;
    private reading;
    remoteAddress?: string;
    remotePort?: number;
    localAddress?: string;
    localPort?: number;
    constructor(opts: {
        id: string;
        encrypted: boolean;
        encoding: BufferEncoding;
        localAddress?: string;
        localPort?: number;
        remoteAddress?: string;
        remotePort?: number;
        duplex?: DuplexOptions;
    });
    _read(size?: number): void;
    writeAsClient(chunk: Buffer): void;
    _write(chunk: any, encoding: BufferEncoding, callback: (err: Error | null) => void): void;
}
export interface InterTLSHandlerOptions {
    dynamicTLS?: (host: string) => Promise<SecureContextOptions>;
    autoListen?: boolean;
    override?: {
        localAddress?: string;
        localPort?: number;
    };
}
export declare class InterTLSHandler {
    private opts;
    server: Server;
    listening: boolean;
    encoding: BufferEncoding;
    localAddress: string;
    streamMap: Map<string, MockTcp>;
    private hello;
    private dynamicTLS;
    private open;
    private data;
    private end;
    listen(): Server;
    constructor(server: Server, options?: InterTLSHandlerOptions);
}
export default function interTLS(server: Server, options?: InterTLSHandlerOptions): InterTLSHandler;
export {};
//# sourceMappingURL=handler.d.ts.map
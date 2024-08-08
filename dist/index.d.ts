import { Server as TLSServer } from 'tls';
import { Server as TCPServer } from 'net';
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
        env?: {
            [envVar: string]: string;
        };
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
export declare class InterTLS {
    private config;
    private configMap;
    private serverMap;
    private listenResolver;
    listenPromise: Promise<void>;
    encoding: BufferEncoding;
    inited: boolean;
    listening: boolean;
    tcpServer: TCPServer;
    tlsServer?: TLSServer;
    localAddress?: string;
    tlsPort?: number;
    tcpPort?: number;
    constructor(config: InterTLSConfiguration);
    trylog(type: LogType, ...args: any): Promise<void>;
    private sni;
    init(): Promise<void>;
    listen(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map
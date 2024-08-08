import { SecureContextOptions } from "tls";

export enum ParentToChildMessageType {
    HELLO,
    DYNAMIC_TLS,
    OPEN,
    DATA,
    END
}

export type SockId = string;

export type ParentToChildMessage =
    // HELLO, encoding, localAddress
    [ParentToChildMessageType.HELLO, BufferEncoding, string] |
    // DYNAMIC_TLS, id, host
    [ParentToChildMessageType.DYNAMIC_TLS, string, string] |
    // OPEN, id, encrypted, localPort, remoteAddress, remotePort
    [ParentToChildMessageType.OPEN, SockId, boolean, number, string, number] |
    // DATA, id, data (encoded)
    [ParentToChildMessageType.DATA, SockId, string] |
    // END, id
    [ParentToChildMessageType.END, SockId];

export enum ChildToParentMessageType {
    READY,
    DYNAMIC_TLS,
    DATA,
    END
}

export type ChildToParentMessage =
    // READY
    [ChildToParentMessageType.READY] |
    // DYNAMIC_TLS, id, SecureContextOptions
    [ChildToParentMessageType.DYNAMIC_TLS, string, SecureContextOptions] |
    // DATA, id, data (encoded)
    [ChildToParentMessageType.DATA, SockId, string] |
    // END, id
    [ChildToParentMessageType.END, SockId];
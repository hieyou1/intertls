export enum ParentToChildMessageType {
    HELLO,
    OPEN,
    DATA,
    END
}

export type SockId = string;

export type ParentToChildMessage =
    // HELLO, encoding, localAddress
    [ParentToChildMessageType.HELLO, BufferEncoding, string] |
    // OPEN, id, encrypted, localPort, remoteAddress, remotePort
    [ParentToChildMessageType.OPEN, SockId, boolean, number, string, number] |
    // DATA, id, data (encoded)
    [ParentToChildMessageType.DATA, SockId, string] |
    // END, id
    [ParentToChildMessageType.END, SockId];

export enum ChildToParentMessageType {
    READY,
    DATA,
    END
}

export type ChildToParentMessage =
    // READY
    [ChildToParentMessageType.READY] |
    // DATA, id, data (encoded)
    [ChildToParentMessageType.DATA, SockId, string] |
    // END, id
    [ChildToParentMessageType.END, SockId];
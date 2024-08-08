import { SecureContextOptions } from "tls";
export declare enum ParentToChildMessageType {
    HELLO = 0,
    DYNAMIC_TLS = 1,
    OPEN = 2,
    DATA = 3,
    END = 4
}
export type SockId = string;
export type ParentToChildMessage = [
    ParentToChildMessageType.HELLO,
    BufferEncoding,
    string
] | [
    ParentToChildMessageType.DYNAMIC_TLS,
    string,
    string
] | [
    ParentToChildMessageType.OPEN,
    SockId,
    boolean,
    number,
    string,
    number
] | [
    ParentToChildMessageType.DATA,
    SockId,
    string
] | [
    ParentToChildMessageType.END,
    SockId
];
export declare enum ChildToParentMessageType {
    READY = 0,
    DYNAMIC_TLS = 1,
    DATA = 2,
    END = 3
}
export type ChildToParentMessage = [
    ChildToParentMessageType.READY
] | [
    ChildToParentMessageType.DYNAMIC_TLS,
    string,
    SecureContextOptions
] | [
    ChildToParentMessageType.DATA,
    SockId,
    string
] | [
    ChildToParentMessageType.END,
    SockId
];
//# sourceMappingURL=ipc.d.ts.map
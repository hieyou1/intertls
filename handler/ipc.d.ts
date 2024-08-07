export declare enum ParentToChildMessageType {
    HELLO = 0,
    OPEN = 1,
    DATA = 2,
    END = 3
}
export type SockId = string;
export type ParentToChildMessage = [
    ParentToChildMessageType.HELLO,
    BufferEncoding,
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
    DATA = 1,
    END = 2
}
export type ChildToParentMessage = [
    ChildToParentMessageType.READY
] | [
    ChildToParentMessageType.DATA,
    SockId,
    string
] | [
    ChildToParentMessageType.END,
    SockId
];
//# sourceMappingURL=ipc.d.ts.map
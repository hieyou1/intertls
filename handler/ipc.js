export var ParentToChildMessageType;
(function (ParentToChildMessageType) {
    ParentToChildMessageType[ParentToChildMessageType["HELLO"] = 0] = "HELLO";
    ParentToChildMessageType[ParentToChildMessageType["DYNAMIC_TLS"] = 1] = "DYNAMIC_TLS";
    ParentToChildMessageType[ParentToChildMessageType["OPEN"] = 2] = "OPEN";
    ParentToChildMessageType[ParentToChildMessageType["DATA"] = 3] = "DATA";
    ParentToChildMessageType[ParentToChildMessageType["END"] = 4] = "END";
})(ParentToChildMessageType || (ParentToChildMessageType = {}));
export var ChildToParentMessageType;
(function (ChildToParentMessageType) {
    ChildToParentMessageType[ChildToParentMessageType["READY"] = 0] = "READY";
    ChildToParentMessageType[ChildToParentMessageType["DYNAMIC_TLS"] = 1] = "DYNAMIC_TLS";
    ChildToParentMessageType[ChildToParentMessageType["DATA"] = 2] = "DATA";
    ChildToParentMessageType[ChildToParentMessageType["END"] = 3] = "END";
})(ChildToParentMessageType || (ChildToParentMessageType = {}));
//# sourceMappingURL=ipc.js.map
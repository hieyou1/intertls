export var ParentToChildMessageType;
(function (ParentToChildMessageType) {
    ParentToChildMessageType[ParentToChildMessageType["HELLO"] = 0] = "HELLO";
    ParentToChildMessageType[ParentToChildMessageType["OPEN"] = 1] = "OPEN";
    ParentToChildMessageType[ParentToChildMessageType["DATA"] = 2] = "DATA";
    ParentToChildMessageType[ParentToChildMessageType["END"] = 3] = "END";
})(ParentToChildMessageType || (ParentToChildMessageType = {}));
export var ChildToParentMessageType;
(function (ChildToParentMessageType) {
    ChildToParentMessageType[ChildToParentMessageType["READY"] = 0] = "READY";
    ChildToParentMessageType[ChildToParentMessageType["DATA"] = 1] = "DATA";
    ChildToParentMessageType[ChildToParentMessageType["END"] = 2] = "END";
})(ChildToParentMessageType || (ChildToParentMessageType = {}));
//# sourceMappingURL=ipc.js.map
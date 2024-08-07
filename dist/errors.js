export class UnrecognizedMessageError extends Error {
    constructor(message) {
        super(`Unrecognized message: ${JSON.stringify(message)}`);
    }
}
export class AlreadyListeningError extends Error {
    constructor() {
        super();
        this.code = "ERR_SERVER_ALREADY_LISTEN";
    }
}
//# sourceMappingURL=errors.js.map
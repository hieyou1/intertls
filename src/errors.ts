export class UnrecognizedMessageError extends Error {
    constructor(message: any) {
        super(`Unrecognized message: ${JSON.stringify(message)}`);
    }
}

export class AlreadyListeningError extends Error {
    code: "ERR_SERVER_ALREADY_LISTEN";

    constructor() {
        super();
        this.code = "ERR_SERVER_ALREADY_LISTEN";
    }
}
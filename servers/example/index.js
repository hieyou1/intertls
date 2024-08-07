import interTLS from "../../handler/handler.js";
import { createServer as createHTTPServer } from "http";
import Express from "express";

const app = Express();

app.get("/", (req, res) => {
    res.status(200).type("text").send(process.env.HELLO_INTERTLS);
});

let server = createHTTPServer(app);

server.listen();

interTLS(server);
# intertls

Manage multiple secure Node servers with one tool.

## Warning

This project is in beta. There are lots of debug logs that have been left in.

The project has not been fully vetted for security vulnerabilities, and should not be used in production.

## Features

- Run and maintain multiple Node servers with one tool, each with its own process (and optionally its own user, group, working directory, and environment variables)
- TLS SNI (think [vhost](https://github.com/expressjs/vhost), but for TLS)
  - Different certificates for each host
  - Distinct Mutual TLS (mTLS) settings for each host
- Optional plaintext HTTP fallback

## Intro

This project started out of a need to host multiple Node HTTPS servers on the same machine with some requiring mTLS and some not. My options were to either require mTLS on all endpoints and only enforce validation on some, which would create issues with UX, or use renegotiation and forgo the security benefits from the latest TLS version. So, I decided to build my own tool. Because I also needed to manage these servers, I decided to turn this tool into one that would automatically spawn these Node servers as well. It's still a work-in-progress, but most things should work.

## Prerequisites

- Recent version of Node
- Recent version of TypeScript (one that supports project references)

## Usage

1. Install and configure the server.
2. Create a server using Node.
3. Pass the server (with options, if necessary) to the handler.
4. Run InterTLS!

## Installation

Tested on Ubuntu Server:

```bash
# clone the repo
git clone https://github.com/hieyou1/intertls.git
# cd into the repo
cd intertls-main
# use your text editor of choice; see "Configuration" for details
nano config.json
# install packages
npm i
# build
npm run build
# run intertls
./dist/run.js
# install intertls as a service (for systems that use systemctl)
  # fix path to intertls and create intertls.service
  sed "s|/PATH/TO/intertls|$(pwd)|g" SAMPLE_intertls.service > intertls.service
  # copy service to systemctl
  sudo cp intertls.service /etc/systemd/system
  # start service
  sudo systemctl start intertls.service
  # (optional) enable service on boot
  sudo systemctl enable intertls.service
```

## Configuration

- `$schema`: For a full JSON schema, see [config.schema.json](https://github.com/hieyou1/intertls/blob/main/config.schema.json).
- `log`: Centralized logging. Either a list of `LogType`s (`newsock` (high-level information about creation [and potential forced destruction] of new sockets), `sni`, `ipc`, `child_procs` (console logs from your servers), `handler` (logs from the InterTLS handler itself), `init`) or a `boolean` to enable/disable logging as a whole.
- `port`: Main port InterTLS should listen on. Usually 443.
- `encoding`: `BufferEncoding` InterTLS should use when transferring data in string format to and from its child processes (servers). utf8 is good for logging purposes, otherwise, base64 is probably a good bet.
- `tcpFallback`: Set to true to enable the plaintext TCP & HTTP fallback; be sure to also set `tcpPort`.
- `tcpPort`: Port InterTLS should listen on for `tcpFallback`. InterTLS expects plaintext HTTP traffic on this port. Usually 80. Ignored when `tcpFallback` is set to false.
- `servers`: Array of servers for InterTLS to run, manage, and forward traffic to.
  - `host`: String or string array specifying hostname(s) of this server. Should match the server name that clients pass in for SNI and the HTTP `Host` header if using TCP fallback.
  - `tls`: TLS options for this server. Set to `{"dynamic": true}` to dynamically handle TLS, otherwise `cert`, `key`, and `requestCert` are required. `ca` and `rejectUnauthorized` are the two other options that have been tested and are explicitly defined in the schema, and YMMV with other [SecureContextOptions](https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions), but feel free to try them and PR!
  - `process`: Node options for this server.
    - `main`: Node entrypoint of the server.
    - `cwd`: Working directory of the server.
    - `env` (optional): Object with environment variables to pass to the server. Defaults to {}.
    - `uid` (optional): User ID for the process. Defaults to the user of the process running InterTLS (which is probably not what you want!)
    - `gid` (optional): Group ID for the process. Defaults to the group of the process running InterTLS (which is probably not what you want!)
- `ipFallback`: TLS configuration (see `servers.tls` above) for those accessing the server that bypass SNI by connecting directly to its IP.

## Handler options

- `dynamicTLS`: If using Dynamic TLS, this should be a function that takes in a `host` as a string and returns a `Promise` with the [SecureContextOptions](https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions) to use for it.
- `autoListen`: Set to `false` to prevent the InterTLS handler from automatically listening for IPC messages from the parent. Useful if there is additional logic to be done after invoking the handler.
- `override`: If needed, declaratively override the `localAddress` and `localPort` attributes of the `MockTcp` streams that are emitted to the server.

## License

This project is [licensed under GPLv3](https://github.com/hieyou1/intertls/blob/main/LICENSE).

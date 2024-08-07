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
- `port`: Main port InterTLS should listen on. Usually 443.
- `encoding`: `BufferEncoding` InterTLS should use when transferring data in string format to and from its child processes (servers). utf8 is good for logging purposes, otherwise, base64 is probably a good bet.
- `tcpFallback`: Set to true to enable the plaintext TCP & HTTP fallback; be sure to also set `tcpPort`.
- `tcpPort`: Port InterTLS should listen on for `tcpFallback`. InterTLS expects plaintext HTTP traffic on this port. Usually 80. Ignored when `tcpFallback` is set to false.
- `servers`: Array of servers for InterTLS to run, manage, and forward traffic to.
  - `host`: Hostname of this server. Should match the server name that clients pass in for SNI, and (if using TCP fallback) the HTTP `Host` header.
  - `tls`: TLS options for this server. `cert`, `key`, and `requestCert` are required. `ca` and `rejectUnauthorized` are the two other options that have been tested and are explicitly defined in the schema, and YMMV with other [SecureContextOptions](https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions), but feel free to try them and PR!
  - `process`: Node options for this server.
    - `main`: Node entrypoint of the server.
    - `cwd`: Working directory of the server.
    - `env` (optional): Object with environment variables to pass to the server. Defaults to {}.
    - `uid` (optional): User ID for the process. Defaults to the user of the process running InterTLS (which is probably not what you want!)
    - `gid` (optional): Group ID for the process. Defaults to the group of the process running InterTLS (which is probably not what you want!)

## License

This project is [licensed under GPLv3](https://github.com/hieyou1/intertls/blob/main/LICENSE).

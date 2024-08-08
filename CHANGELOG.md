# Changelog

## v0.0.5

- Add `ipFallback` to enable a default TLS configuration for those accessing the server that bypass SNI by connecting directly to its IP
- Fix `child_procs` log type
- Add option to serve more than one `host` per child process using an array
- README enhancements

## v0.0.4

- Add `handler` log type

## v0.0.3

- Add logging configuration (`log`)
- Added support for dynamic TLS settings- especially helpful for "default" hosts!
- README enhancements

## v0.0.2

- Added "default" host option: If people access your InterTLS server via a host that hasn't been set up yet, you can use this as a catch-all!
  - Fixed crash when a client attempts to connect with an invalid host via TCP

## v0.0.1

- First commit; welcome to InterTLS!

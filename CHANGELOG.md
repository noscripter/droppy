*For patch-level releases, see the commit log*

#### Version 3.8.0 - 1/4/2016

- Docker image is now available as silverwind/droppy.
- Fixed a erron on startup when in a NODE_ENV=production environment.

#### Version 3.7.0 - 12/19/2015

- Client data is now precompiled and published to npm, resulting in drastically reduced startup time after installing a new version.

#### Version 3.6.0 - 11/10/2015

- Node.js 0.10 is again supported

#### Version 3.5.0 - 10/12/2015

- Fixed a semi-critical CSFR vulnerabilty which allowed a attacker to use an authenticated user's session.
- Increased site security by enabling CSP and making cookies inaccessible for scripts.

#### Version 3.4.0 - 10/11/2015

- Added `pollingInterval` option and disabled file system polling by default. This reduces CPU usage to practically zero when idle. If you notice issues with files getting out of sync, you enable this option by setting a timeout of a few seconds.
- Increased minimum node.js version to 0.12.0, which was necessary for unicode normalization.

#### Version 3.3.0 - 10/11/2015

- File uploads can now take longer than 2 minutes. Proxy-specific timeouts may still apply. See the [`nginx.conf` template](https://github.com/silverwind/droppy/wiki/Nginx-reverse-proxy) for a suitable nginx configuration.

#### Version 3.2.0 - 9/21/2015

- Fix a security issue, all users are adviced to upgrade.

#### Version 3.1.0 - 9/13/2015

- Fixed a bug where configuration could get lost when the server shuts down during a save operation.
- Extended the default self-signed certificate validity to 100 years.
- Prime generation for Perfect Forward Secrecy is now supported cross-platform.

#### Version 3.0.0 - 9/2/2015

- Deprecated `--home` option in favor of `--configdir` and `--filesdir`. The old option is still supported, but files in `<configdir>/config` will be migrated to `<configdir>`. If `--filesdir` is not given, it will default to `<configdir>/files`.
- The module API has been changed to not take a `home` option anymore. Instead, `options` now takes additional `configdir` and `filesdir`.
- Added `log` option to module API, which defines a log file.
- Empty directory and files in uploads are no longer supported because browsers and `busboy` were exhibiting all kinds of weird bugs when these were involved. They might return at a later stage, but for now, it's too much of a hack to keep supporting them.

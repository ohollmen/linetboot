# Installing "npm" without "npm" (or yarn)

## Corepack method

node.js from https://nodejs.org/ includes a utility named corepack
(e.g. `/usr/local/node-v18.12.0-linux-x64/bin/corepack`), which can be used to
install npm (I

if you have node from (e.g.) Debian/Ubuntu package `nodejs` (with e.g. libnode109 as dependency), the corepack utility is **not present**.

## Install by node.js only

Installing npm purely with node:
```
mkdir /tmp/npm && pushd /tmp/npm
curl -s https://registry.npmjs.org/npm/latest | grep tarball
curl -L "https://registry.npmjs.org/npm/-/npm-11.6.2.tgz" -o npm.tgz
# Unpack, creates subdir "package/" (as of npm 11.6.2)
tar -zxvf npm.tgz
cd package/
# Must run w. sudo. In case of OS provided node, the npm is in /usr/bin/npm
sudo node bin/npm-cli.js install -g .
# After-install Sanity checks
which npm && npm --version
```

Note: The npm may be too new for your current node.js causing errors like:
```
node bin/npm-cli.js install -g .
npm warn cli npm v11.6.2 does not support Node.js v18.19.1. This version of npm supports the following node versions: `^20.17.0 || >=22.9.0`. You can find the latest version at https://nodejs.org/.
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: 'npm@11.6.2',
npm warn EBADENGINE   required: { node: '^20.17.0 || >=22.9.0' },
npm warn EBADENGINE   current: { node: 'v18.19.1', npm: '11.6.2' }
npm warn EBADENGINE }
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: 'npm@11.6.2',
npm warn EBADENGINE   required: { node: '^20.17.0 || >=22.9.0' },
npm warn EBADENGINE   current: { node: 'v18.19.1', npm: '11.6.2' }
npm warn EBADENGINE }
npm error code EACCES
npm error syscall mkdir
npm error path /usr/lib/node_modules
npm error errno -13
npm error [Error: EACCES: permission denied, mkdir '/usr/lib/node_modules'] {
npm error   errno: -13,
npm error   code: 'EACCES',
npm error   syscall: 'mkdir',
npm error   path: '/usr/lib/node_modules'
npm error }
npm error
npm error The operation was rejected by your operating system.
npm error It is likely you do not have the permissions to access this file as the current user
npm error
npm error If you believe this might be a permissions issue, please double-check the
npm error permissions of the file and its containing directories, or try running
npm error the command again as root/Administrator.
npm error A complete log of this run can be found in: /home/ohollmen/.npm/_logs/2025-10-14T16_14_22_202Z-debug-0.log
```

In this case you must find out the npm version supporting your node version,
e.g. by consulting AI:
```
Using the Option 1, the npm downloaded and unpacked seems to be too new per erro messages. Can you recommend the newest version that supports node v18.19.1 ?
```
The recommnedation for v18.19.1:
```
...
curl -L https://registry.npmjs.org/npm/-/npm-10.2.3.tgz -o npm-10.2.3.tgz
...
```

## The preferred global package directory for node.js

- OS Provided Node: /usr/lib/node_modules
- nodejs.org provided Node: /usr/local/lib/node_modules/

Seems the npm still drives the choice of global `node_modules` path.

## Using .npmrc

.npmrc can configure e.g. NPM registry URL:
```
registry=https://your.intranet.registry/
# @myorg:registry=https://npm.intranet.local/
# Other
# Token based auth
//npm.intranet.local/:_authToken=YOUR_TOKEN_HERE
# Legacy (Use echo -n 'yourpassword' | base64)
//npm.intranet.local/:username=youruser
//npm.intranet.local/:_password=base64-encoded-password
//npm.intranet.local/:email=you@example.com
```
.npmrc is looked up from: /etc/npmrc, $HOME/.npmrc, $proj_root/.npmrc
.npmrc location can also be given by env. var. NPM_CONFIG_USERCONFIG.

## Listing/Modding NPM Config

```
# Short
npm config list
# Long
npm config list -l
# Mod
npm config set registry https://npm.intranet.local/
```

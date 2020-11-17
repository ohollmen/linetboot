# Linet.js - Operating Installations from Command line

linet.js is a lightweight utility to allow operating bootstraps and installs of a large number of hosts from command line.

It supports operations via subcommands (followed by main command linet.js):

- listos - List OS:s available for install (and other boot items)
- listhosts - List Hosts in Inventory
- info - Get info on host passed by -h 
- setpxe - Set next boot to be PXE on host passed by -h 
- install - Request Boot or Install of a host with (one of valid) bootlbl. Use params: -h host -b bootlbl.
- boot - Boot host(s) passed by -h.
- help - Produce a small help guide

This listing is also available by not giving any subcommand (or "help" subcommand).

linet.js will operate via Linetboot REST API and needs to know the URL of it, set to environment variable (e.g.):
```
LINETBOOT_URL=http://linet.comp.com:3000
```

linet.js will make an effort to discover your linetboot main config and suggest
Linetboot URL from there, but it can also operate without main config,
allowing utility to be installed in distributed / remote locations.

If you want to install linet.js in remote locations, refer to file
package.linetjs.json for dependencies. This file can be renamed (or symlinked as) package.json in the remote location to do a usual NPM dependency install:

<!--
scp package.linetjs.json me@other-01:/opt/linetjs/package.json
scp linet.js me@other-01:/opt/linetjs/
ssh me@other-01
# On the host other-01, assume we already have npm
cd /opt/linetjs
chmod a+x linet.js
npm install
# Place this to one of the login files (e.g. ~/.bashrc)
export LINETBOOT_URL=http://linet.comp.com:3000
./linet.js listos
# ...
-->

## Example of installing 5 hosts with Ubuntu 18.04

All operations use -h (host) option issued multiple times to carry out ops
on multiple hosts.

### Set PXE boot target

Set boot target to be an automated Ubuntu 18.04 Install (`-l ubuntu1804`)
whenever host is booted in PXE boot mode:
```
./linet.js install -l ubuntu1804 bitcoin-03.comp.com -h bitcoin-04.comp.com -h bitcoin-05.comp.com -h bitcoin-06.comp.com -h bitcoin-07.comp.com
```
This boot target is in effect till cancelled (currently only available in web gui). Linetboot stores the info abot boot target in TFTP directories.

### Set Next Boot to PXE

Set next boot to be carried out as PXE network boot:
```
./linet.js setpxe -h bitcoin-03.comp.com -h bitcoin-04.comp.com -h bitcoin-05.comp.com -h bitcoin-06.comp.com -h bitcoin-07.comp.com
```
This is effectively the same as selecting "Boot" => "PXE" in BMC Virtual console.

### Boot - To Execxute Install

Boot Machines. As a result of setting boot target and setting next boot mode to be PXE earlier, a full OS installation will be carried out.
```
./linet.js boot -h bitcoin-03.comp.com -h bitcoin-04.comp.com -h bitcoin-05.comp.com -h bitcoin-06.comp.com -h bitcoin-07.comp.com
```

## The Above flow in a Bash Script

Note: This example is given without great sophistication or parametrization, but demonstrates a usable flow.

```
#!/bin/bash
# List of hosts
HOSTS="host-01 host-02 host-03"
# Formulate "-h " prefixed names usable on CL into $HOSTOPTS
HOSTOPTS=""
# Boot target
BOOTTGT="ubuntu1804"
for HOST in $HOSTS; do HOSTOPTS="$HOSTOPTS -h $HOST"; done
# Formulate commands and run
for OP in install setpxe boot; do
  CMD="/path/to/linet.js $OP $HOSTOPTS"
  if [ "$OP" = "install" ]; then CMD="$CMD -l $BOOTTGT"; fi
  echo "Run: $CMD"
  # Actually Run !
  #$CMD
done

```

## Example of memory-testing 2 suspect machines

More condensed and less verbosely explained flow (assumes you understood):

```
./linet.js install -l memtest -h bitcoin-11.comp.com -h bitcoin-12.comp.com
./linet.js setpxe -h bitcoin-11.comp.com -h bitcoin-12.comp.com
./linet.js boot -h bitcoin-11.comp.com -h bitcoin-12.comp.com
# Let Run for e.g. 12 hours

```

## TODO

Provide boot reset / cancel operation ('reset' ?).


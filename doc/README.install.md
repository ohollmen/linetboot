# Installing Linetboot

Example manual installation explained here installs Linetboot under users
home directory in directories explained in this document.
This install guide aims at getting web based inventory up and running quickly.

## Pre-requisites checklist

Minimum install must-haves (See doc/README.prereq.md for more details):

- Linux or Mac Operating system to install Linetboot onto
- SSH Client and git on linetboot machine
- Ansible on lineboot machine
  - SSH Server on and python on remote machines
- Full Node.js environment with NPM (Node package manager).

## Getting Lineboot Sourcecode

Clone Linetboot code
```
# Change to home directory
cd ~
# Create config directory (under homedir)
mkdir ~/.linetboot
# Create host facts directory
mkdir ~/hostinfo
# Clone
git clone https://github.com/ohollmen/linetboot.git
# Change to lineboot to copy configs
cd linetboot
# Copy configs as "template" for your personal env config
# in "~/.lineboot". See Makefile, target dotlinetboot for all
# that is copied here. Add requested env variables to ~/.bashrc
# (or to a file sourced from there).
make dotlinetboot
# Source (environment variable) changes in ~/.bashrc into current shell
. ~/.bashrc
# Install NPM (Node.js) linetboot server dependencies
npm install
# Install web GUI dependencies (must use yarn installed in prev. step)
cd web
../node_modules/yarn/bin/yarn install
cd ..

```

## Populate Hostnames

Even small linetboot environment has a requirement for lineboot host knowing
the hosts by names. Use either /etc/hosts as a "wannabe" hostname resolution
mechanism, or settle for a "real" DNS, where open source package "dnsmasq" would be a good lightweight DNS solution. If you are installing lineboot in a company environment, you likely already have a DNS and do not need to do anything.

Add all inventoried hosts into file `~/.lineboot/hosts` (A stub for this should already exist after `make dotlineboot`, see above). Example contents:

```
ws-001.comp.com
ws-002.comp.com
intranet.comp.com
database.comp.com
fileserver.comp.com
reports.comp.com
```

Hashmark ("`#`") is treated as comment. You can start with a small subset
of hosts and expand the set later.
If some of the hosts are Windows hosts, please read Ansible documentation
on recording facts (ans using ansible more generally) with Windows hosts.
Set full path of this file into `~/.linetboot/global.config.json`.

# Recording (Ansible collected) Host Facts

Having host facts is mandatory for both web GUI based inventory as well as
PXE based host installation. With this (simplified) install guide, you must
have single account with synchronized password on all hosts as well as SSH keys
copied onto that remote account. Copying SSH keys can be accomplished by:

    ssh-copy-id remoteuser@ws-001.comp.com
    
Do this for all the machines (If you did not have SSH key to start with, generate it with `ssh-keygen -t rsa -b 4096`, use no passphrase).

Record facts (for all hosts in sinle step) by running command:

    ansible -i ~/.linetboot/hosts  -b -m setup --tree ~/hostinfo \
       --extra-vars "ansible_sudo_pass=$ANSIBLE_PASS"

Use `ansible_user=remoteuser` in --extra-vars if your current user is not
the same as remote user. key=val pairs in --extra-vars are separated by space.

# Gathering package information

This is an optional step for minimal installation, but you can collect
OS install packages to get statistics chart on it in "Packages" tab in Web GUI.
Example of manual package extraction commands (for DEB and RPM based distros):

    # Debian/Ubuntu Host
    ssh remoteuser@ws-001.comp.com dpkg --get-selections > ~/hostpkginfo/ws-001.comp.com
    # 
    ssh remoteuser@ws-002.comp.com yum list installed > ~/hostpkginfo/ws-002.comp.com

NOTE: There should be a supporting ansible playbook for doing this.

# Misc config adjustments

Main configuration (global.conf.json).
- Change `maindocroot` to an existing directory or create `/var/www/html/` (The
  maindocroot must be an existing directory).
- Change `hostsfile` to name your hostsfile (e.g. /home/mrsmith/.linetboot/hosts)

# Start Linetboot Server

Lineboot runs as non-root user:

    # Start purely by node
    $ node linetboot.js
    # Run "safely" by pm2
    $ node_modules/pm2/bin/pm2 start linetboot.js

Check with browser (Assume localhost as install host here) `http://localhost:3000/web/` .

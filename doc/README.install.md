# Installing Lineboot

Example manual installation explained here installs Lineboot under users
home directory in directories explained in this document.
This install guide aims at getting web based inventory up and running quickly.

## Pre-requisites checklist

Minimum install must-haves (See doc/README.prereq.md for more details):

- Linux or Mac Operating system to install Linetboot onto
- SSH Client on lineboot machine
- Ansible on lineboot machine
  - SSH Server on and python on remote machines
- Full Node.js environment with NPM (Node package manager).

## Getting Lineboot Sourcecode

Clone Linetboot code
```
# Change to home directory
cd ~
# Create config directory (under homedir)
mkdir ~/.lineboot
# Create host facts directory
mkdir ~/hostinfo
# Clone
git clone https://github.com/ohollmen/linetboot.git
# Change to lineboot to copy configs
cd linetboot
# Copy configs as "template" for your personal env config
# in "~/.lineboot". See Makefile, target dotlinetboot for all
# that is copied here.
make dotlinetboot
# Install NPM (Node.js) linetboot server dependencies
npm install
# Install web GUI dependencies (must use yarn installed in prev. step)
cd web
../node_modules/yarn/bin/yarn install

```

## Populate Hostnames

Even small linetboot environment has a requirement for lineboot host knowing
the hosts by names. Use either /etc/hosts as a "wannabe" hostname resolution
mechanism, or settle for a "real" DNS, where open source package "dnsmasq" would be a good lightweight DNS solution. If you are installing lineboot in a company environment, you likely already have a DNS and do not need to do anything.

Add all inventoried hosts into file ~/.lineboot/hosts (A stub for this should already exist after `make dotlineboot`, see above). Example contents:

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

# Recording (Ansible collected) Host Facts

Having host facts is mandatory for both web GUI based inventory as well as
PXE based host installation. With this (simplified) install guide, you must
have single account with synchronized password on all hosts as well as SSH keys
copied onto that remote account. Copying SSH keys can be accomplished by:

    ssh-copy-id remoteuser@ws-001.comp.com
    
Do this for all the machines.

Record facts (for all hosts in sinle step) by running command:

    ansible -i ~/.linetboot/hosts  -b -m setup --tree ~/hostinfo \
       --extra-vars "ansible_sudo_pass=$ANSIBLE_PASS"

# Start Linetboot server

Lineboot runs as non-root user:

    # Start purely by node
    $ node lineboot.js
    # Run "safely" by pm2
    $ node_modules/pm2/bin/pm2 start lineboot.js

Check with browser (Assume localhost as install host here) http://localhost:3000/web/ .

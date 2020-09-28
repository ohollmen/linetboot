# Installing Linetboot

Example manual installation explained here installs Linetboot under users
home directory in directories explained in this document.
**Stage 1** install guide aims at getting web based inventory visibility up and running quickly.
** Stage 2** install guide aims to get you ready to actually PXE boot your hosts and get you installing Operating systems.

## Pre-requisites checklist

Minimum (Stage 1) install must-haves (See doc/README.prereq.md for more details):

- Linux or Mac Operating system to install Linetboot onto
- SSH Client and git on linetboot machine
- Ansible on linetboot machine
  - SSH Server on and python on remote machines
- Full Node.js environment with NPM (Node package manager).

Full (Stage 2) install should additionally have:

- DHCP Server
- TFTP Server

Refer to document "Prerequisites" (`README.prereq.md`) for installation details of each dependency / prerequisite.

## Getting Linetboot Sourcecode

Clone Linetboot code and install (NPM and Yarn) dependencies:
```
# Change to home directory
cd ~
# Clone source code
git clone https://github.com/ohollmen/linetboot.git
# cd to git created install dir
cd linetboot
# Install NPM (Node.js) linetboot server dependencies
npm install
# Install web GUI dependencies (must use yarn installed in prev. step)
cd web
../node_modules/yarn/bin/yarn install
cd ..
```
## Stage 1 Installation - Get Host inventory Ready

Run prep-steps:

```
# Create boot media dirs with root (sudo) rights
# If you want to keep this step non-root, run: mkdir ~/isomnt and
# change main config "core.maindocroot" to match that value.
sudo mkdir /isomnt
# Change to home directory
cd ~
# Create config directory (under homedir)
mkdir ~/.linetboot
# Create host facts directory
mkdir ~/hostinfo
# Create OS packages list directory
mkdir ~/hostpkginfo

# Change to linetboot to copy configs
cd linetboot
# Copy configs as "template" for your personal env config
# in "~/.linetboot". See Makefile, target dotlinetboot for all
# that is copied here. Add requested env variables to ~/.bashrc
# (or to a file sourced from there).
make dotlinetboot
# Source (environment variable) changes in ~/.bashrc into current shell
. ~/.bashrc


```

### Populate Hostnames

Even small linetboot environment has a requirement for linetboot host knowing
the hosts by names to connecto to them over the network. Use either /etc/hosts as a "wannabe" hostname resolution
mechanism, or settle for a "real" DNS, where open source package "dnsmasq" would be a good lightweight DNS solution.
If you are installing linetboot in a company environment, you likely already have a DNS and do not need to do anything.
When filling in names to the inventory, Linetboot prefers fully qualified hostnames to be used. If you are in a home network
with no domain suffix, the bare hostnames will work. In a large network with multiple domans fully qualified names should always be used.

Add all inventoried hosts into file `~/.linetboot/hosts` (A stub for this should already exist after `make dotlinetboot`, see above).
If you already have an ansible inventory file, try using it as-is. Linetboot will always access inventory file read-only.
Example contents:

```
ws-001.comp.com
ws-002.comp.com
intranet.comp.com
database.comp.com
fileserver.comp.com
# Comments are allowed
# Fancy example: key=value pairs follwing hostname
reports.comp.com nis=west use=Reporting+Server
```

Hashmark ("`#`") is treated as comment. You can start with a small subset
of hosts and expand the set later.
If some of the hosts are Windows hosts, please read Ansible documentation
on recording facts (and using ansible more generally) with Windows hosts.
Set full path of this file into preoperty `hostsfile` in `~/.linetboot/global.config.json`.

### Recording (Ansible collected) Host Facts

Having host facts is mandatory for both web GUI based inventory as well as
PXE based host installation. With this (simplified) install guide, you must
have single account with synchronized password on all hosts as well as SSH keys
copied onto that remote account. Copying SSH keys can be accomplished by:

    ssh-copy-id remoteuser@ws-001.comp.com
    
Do this for all the machines (If you did not have SSH key to start with, generate it with `ssh-keygen -t rsa -b 4096`, use no passphrase).

Record facts (for all hosts in single step) by running command:

    ansible all -i ~/.linetboot/hosts  -b -m setup --tree ~/hostinfo \
       --extra-vars "ansible_sudo_pass=$ANSIBLE_PASS"

Use `ansible_user=remoteuser` in --extra-vars if your current user is not
the same as remote user. key=val pairs in --extra-vars are separated by space.

### Gathering package information

This is an optional step for minimal installation, but you can collect
OS install packages to get statistics chart on it in "Packages" tab in Web GUI.
Example of manual package extraction commands (for DEB and RPM based distros):

    # Debian/Ubuntu Host
    ssh remoteuser@ws-001.comp.com dpkg --get-selections > ~/hostpkginfo/ws-001.comp.com
    # RedHat/Centos Host
    ssh remoteuser@ws-002.comp.com yum list installed > ~/hostpkginfo/ws-002.comp.com

NOTE: There should be a supporting ansible playbook for doing this.

### Misc. Config Adjustments

Main configuration (global.conf.json).
- Change `maindocroot` to an existing directory (possibly create `/isomnt/`, this is where your boot media goes) - The
  maindocroot must exist or the server exits with an error.
- Change `hostsfile` to name your host inventory file (e.g. /home/mrsmith/.linetboot/hosts). The default value ~/.linetboot/hosts
  will likely work if you followed the default installation.

### Starting Linetboot Server

Linetboot runs as non-root user:

    # Start purely by node (on the shell foreground)
    $ node linetboot.js
    # Run "safely" by pm2 (goes to shell background and gets a process watchdog features from PM2 - https://pm2.keymetrics.io )
    $ node_modules/pm2/bin/pm2 start linetboot.js

Check Linetboot Web GUI with your browser (Assume localhost as install host here): `http://localhost:3000/web/` .

## Stage 2 Installation - Get TFTP Dirs and OS Media services running

Stage 2 installation expects install of Stage 1 to be completed successfully.
Store your OS ISO Images (*.iso) in a path location of your choice. For prep examples we'll use location `/usr/local/iso`.
We provide examples for 2 linux distros. Note: This step requires super user rights for many steps (e.g. mounting, creating directories).

### Mounting Boot Media

Get the OS boot media directories ready. The OS install media from these directories will be delivered by linetboot server via http.
(with linetboot *only* the bootloader is loaded via TFTP). In special installations (not supporting http based install) these
may also get shared via NFS or SMB. The path '/isomnt' (used here and in default installation) has been already made to be
"core.maindocroot" in Stage 1 install. 

```
###### ISO Media ######
# Create (if not already created) media mount "root" directory for ISO image loop mounts
sudo mkdir /isomnt
# Make a lot of individual ISO sub dirs (by Makefile example)
#make mkmediadir
# Create dirs for Ubuntu and Centos Server Install ISO:s within media root
sudo mkdir /isomnt/centos7 /isomnt/ubuntu18
# Mount ISO:s. These 2 OS Distros are known to boot and install directly from their
# loopmount directories, read-only, no changes.
sudo mount -o loop /usr/local/iso/ubuntu-18.04.1-server-amd64.iso   /isomnt/ubuntu18/
sudo mount -o loop /usr/local/iso/CentOS-7-x86_64-Minimal-1810.iso  /isomnt/centos7/
# Check that you have Main config "core.maindocroot" set to "/isomnt/"
```
Important note on media directories and their connection to boot menu (pxelinux.cfg/default)
- The main config core.maindocroot points to boot media "root" directory (default: /isomnt) and this is where kernel:s and initrd:s
get delivered from (by http) by lineboot
- As an example the mountpoint directory /isomnt/ubuntu18/ (with loop-mounted ISO) would appear in http URL: http://linetboothost:3000/ubuntu18/
- The kernel:s and initrd:s are configured in boot menu file in "kernel" and "initrd" (or append initrd=...) directives respectively.
  The mountpoint directory name must exactly match the name in URL for kernel and initrd loading to work. 

### Notes about TFTP and DHCP changes

Sharing the traditionally root owned dirs to a "normal" group is potential security risk and you have to evaluate
the security constraints of your environment. Both changes are same in nature: Allow lineboot user (via group sharing)
to write (config and other) files to system areas. Bothe TFTP and DHCPD setup steps are partially assisted by lineboot
install script `hostsetup.js`.

### Setting up TFTP

With Linetboot *only* the bootloader (and boot menus) get delivered from TFTP server, which is mandated by DHCP standards.
Setup TFTP Directory structure (dir structure, bootloader menu and binaries):
```
###### TFTP DIRS ######
# Create mock-up dir (in de-facto location). If already exists there will br no errors because of -p
sudo mkdir -p /var/lib/tftpboot/
# Change TFTP accessible to Linetboot user
sudo chmod -R g+w /var/lib/tftpboot/
sudo chgrp -R $LINETBOOT_USER_GROUP /var/lib/tftpboot/
# Create menu and mac address based symlinks.
# To dry run and only preview menu: node hostsetup.js tftpsetup --dryrun | less
node hostsetup.js tftpsetup
# Ubuntu Only:
# Install various OS packages (see prerequisite docs) containing PXE bootloader binaries.
# Populate bootloader binaries from installed packages under tftp root.
# (Currently installs in temp directory, directory name is echoed at the end of operation)
node hostsetup.js bootbins

```
If you have older Debian/Ubuntu/Raspian, you can change legacy tftp root dir `/srv/tftp` to match the concurrent
standard path (`/var/lib/tftpboot`, to be aligned with linetboot default config and documentation examples) by:
```
sudo perl -pi -e "s/^TFTP_DIRECTORY=.+$/TFTP_DIRECTORY=\"\/var\/lib\/tftpboot\"/;" /etc/default/tftpd-hpa
```


### Setting up Mock-up DHCP config

This is optional step, but allows to mock up (ISC) dhcpd config event if you are not running DHCP on linetboot host.
On a typical linux system (that has group for each user) you can 
```
###### DHCP(D) CONFIG ##############
# Create mock-up dir (in de-facto location). If already exists there will br no errors because of -p
sudo mkdir -p /etc/dhcp/
# Share dir with linetboot user (preview current state w. ls -al /etc/dhcp)
sudo chmod g+w /etc/dhcp/
# Change group to be shared (likely: sudo chgrp $USER /etc/dhcp/)
sudo chgrp $LINETBOOT_USER_GROUP /etc/dhcp/
# Generate dhcpd config (/etc/dhcp/dhcpd.conf)
node hostsetup.js dhcpconf
```

<!--

# Run make target "gendefault" to generate Default Menu into file /tmp/default. Review it.
# make gendefault
# If you are ready to produce final output, save into actual TFTP directories (Under /pxelinux.cfg/).
# make default
-->

## Stage 3 Installation - Get Package Info, SSH Keys and Remote management Info

To use some of the more sophisticated automated Boot and OS Installation features we must have connectivity to BMC - The Baseboard
management controller (also called just MC) which is able to control host by booting it, setting boot type (e.g. PXE), etc.
The "Remote Management" info is extracted with an open-source tool "ipmitool", which is able to inquire the BMC info from within host
(although this requires root rights and thus "become: yes" Ansible feature).

Collecting OS package information is a nice-to have feature, whose usefulness depends on what the lifetime of OS composition on the
host is. If host is going to be re-imaged with different OS:s every few hours or every few days (e.g in testing), tracking OS packages
is not very useful. If OS composition is going to stay for weeks or e.g. 2 years (with packages possibly being added and removed), keeping
track of makages maybe very useful.

All these steps are very fit to be run with Ansible playbooks that are contained with lineboot:
```
# Gather Remote management (IPMI) Info from BMC
ansible-playbook  -i ~/.linetboot/hosts ipmiinfo.yaml --extra-vars "ansible_sudo_pass=... host=all destpath=$HOME/hostrmgmt"
# Gather SSH Keys 
ansible-playbook  -i ~/.linetboot/hosts sshkeyarch.yaml --extra-vars "ansible_sudo_pass=... host=all keyarchpath="
```


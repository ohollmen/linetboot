# Installation Prerequisites

List of prerequisites for a functional linetboot system:

- pxelinux - Provides network bootloaders (pxelinux0, lpxelinux.0, with latter supporting http)
- syslinux-efi - Network bootloader for UEFI (Not widely proven in linetboot)
- TFTP server - to store PXELinux binaries and menus on (Debian/Ubuntu: tftpd, tftpd-hpa, dnsmasq or atftpd, Redhat/CentOS: tftp-server)
- nodejs and npm - The linetboot system is written in Node.js and thus needs this 
- ansible - to extract and record host facts form inventoried machines (Ansible also depends on Python)

Additionally you need download OS/Distro Intallation CD/DVD ISO Images, e.g:
- Ubuntu Install ISO:s (from  https://cdimage.ubuntu.com )
- Gparted Live ISO/CD Image (from https://gparted.org/download.php )
- Centos Install ISO:s (from https://wiki.centos.org/Download )
<!-- Package archive: http://archive.ubuntu.com/ubuntu/dists/ -->
<!-- Optional (Development): - devscripts - Tools to explore remote Ubuntu/Debian mirrors (e.g. rmadison linux-generic) -->

## PXELinux Bootloader

Ubuntu/Debian Install:

    # Pulls in syslinux-common as "recommended", contains: gpxelinux.0 lpxelinux.0 and pxelinux.0
    sudo apt-get install pxelinux
    # Also install this if you want to boot load-into-memory ISO images (w. memdisk chained bootloader)
    # This is strongly recommended package.
    sudo apt-get install syslinux-common

Centos/RHEL does not seem to have lpxelinux.0 at all, but syslinux w. can be installed:

    # See also: syslinux syslinux-devel syslinux-extlinux syslinux-perl syslinux-tftpboot
    sudo yum install syslinux

pxelinux has bootloader `lpxelinux.0` with HTTP support and HTTP is what this system is largely all about (RedHat / CentOS version that I checked did not have `lpxelinux.0` at all).
Files that are needed from `pxelinux` package come from directories:
- /usr/lib/PXELINUX/*pxelinux.0 - 3 possible `*pxelinux.0` bootloaders, but we linetboot mandates the `lpxelinux.0` with HTTP support
- /usr/lib/syslinux/modules/bios/*.c32 pxelinux bootloader modules (from `syslinux-common`)

If you run linetboot on RH/Centos, try to "borrow" bootloader binaries from a Debian/Ubuntu machine (These are simple monolithic
boot-stage binaries running "raw on CPU", not dependent on anything so they do not have a dependency to particular distro type).

## TFTP Server

Debian/Ubuntu (Default TFTP Server data/content root in older Ubuntu/Debian: `/srv/tftp`, More recent: `/var/lib/tftpboot`).
TFTP Server on Linux (mainly because of it's simplicity)"just works" with no config customizations needed.

    # Default TFTP root /var/lib/tftpboot  (or /srv/tftp on older Debian/Ubuntu).
    # However this TFTP server package tftpd named does not support TFTP "options" (See RFC 2347).
    # Some X86_64 UEFI BIOSes require options for PXE Boot TFTP phase.
    # Older server (and client) package tftpd, not recommended.
    # sudo apt-get install tftp tftpd
    # Recommended server (and client) package tftpd-hpa for TFTP protocol "options" support (RFC 2347,2349) 
    sudo apt-get install tftpd-hpa tftp-hpa

In Debian/Ubuntu follow log `/var/log/syslog` for TFTP daemon messages.

RedHat/Centos (Default TFTP Server data/content root: **/var/lib/tftpboot**).

    # See if you already got tftp-server or tftp
    yum list installed | grep tftp
    # Prefer having both tftp.x86_64 (client) and tftp-server.x86_64
    # Client is used for diagnosing/testing/troubleshooting. Will be used for testing below.
    sudo yum install tftp-server tftp
    # Edit and change disable to 'no'
    # For logging verbosity add -v,--verbose to server_args (-s,--secure = chroot server root,
    # -v may be added multiple times)
    sudo vi /etc/xinetd.d/tftp

Test and Verify:

    grep disable /etc/xinetd.d/tftp
    disable = no
    sudo service xinetd restart
    # Testing
    # Copy dummy to /var/lib/tftpboot and try get
    echo "Hello" | sudo tee  /var/lib/tftpboot/dummy.txt
    # test getting the test file by TFTP (client)
    tftp localhost -c get dummy.txt
    cat dummy.txt

in Centos follow the system log file `/var/log/messages` for TFTP daemon messages.

MacOS has a built-in TFTP server, with default tftproot in '/private/tftpboot' that can be activated by (tested to work):
```
sudo launchctl load -F /System/Library/LaunchDaemons/tftp.plist
sudo launchctl start com.apple.tftpd
```
MacOS also comes with tftp client (named "tftp"), by which you can test the server.
In MacOS you would set the main config tftp.root to "/private/tftpboot" accordingly.


### Setting up TFTP Server directories for PXE Booting

From the package `pxelinux` on your (recent) Ubuntu / Debian distribution, install the pxelinux and pxelinux modules (*.c32) by rsync or scp to TFTP server root directory (cp will do if tftpd is running on the same host).

Content needed on TFTP Server (relative to TFTP server root):

    # The PXELinux (HTTP capable) bootloader (Note 'l' at the beginning)
    lpxelinux.0
    # bootloader for UEFI based boots (Needs to be in subdir for differentiation of
    # *.c32 modules below, found in package "syslinux-efi")
    # This is not tested by the default boot menu template. However some rare mainboard/BIOS
    # combinations insist on PXE-booting with EFI bootloader.
    efi64/syslinux.efi
    efi64/ldlinux.e64
    efi64/syslx64.cfg
    # Same for UEFI 32 bit
    efi32/syslinux.efi
    # syslinux (apt:"syslinux-common") modules that (l)pxelinux.0 will use
    ldlinux.c32
    libutil.c32
    menu.c32
    vesamenu.c32
    libcom32.c32
    # Memdisk kernel (from syslinux-common) for loading ISO:s and raw images.
    # For example booting FreeBSD and Windows PE uses this.
    memdisk
    # Bootmenu is located in in a subdir named "pxelinux.cfg", file "default"
    # There can also be per-client differentiated boot menus by MAC address
    # (e.g. symlinks)
    pxelinux.cfg/
    pxelinux.cfg/default

All the components must be for intel X86 cpu architecture (Booting ARM has not been tested yet).
  
TFTP server default content root directory locations:
- Debian/Ubuntu: `/var/lib/tftpboot` (Older: `/srv/tftp`)
- Centos/RHEL: `/var/lib/tftpboot`
- MacOS (Built-in TFTP server): `/private/tftpboot`

In RH/Centos pxelinux and its modules are installed by `yum install syslinux`, but this may not provide the lpxelinux.0' that is required by linetboot.

Info on UEFI syslinux.efi boot: https://wiki.syslinux.org/wiki/index.php?title=Configuration_location_and_name

## Installing Node.js and NPM

Node.js runs the linetboot server. Linetboot depends on a bunch of NPM (Node package manager)
packages from NPM internet repos, so you will need a npm (or npm compatible) package manager
to handle installation of these.

If you are running a fairly recent distro (Ubuntu >= 16.04, Centos/RHEL >= 7) it is suggested you install
Node.js and Node package manager from distro sources:

    # Debian/Ubuntu - available directly in default repos
    sudo apt-get install nodejs npm --no-install-recommends
    # Centos (and RHEL)
    # Add NodeSource yum repository (Includes npm automatically)
    curl -sL https://rpm.nodesource.com/setup_10.x | sudo bash -
    # ... now install nodejs (comes w. npm)
    sudo yum install nodejs

Generic linux tar install: Download: `wget https://nodejs.org/dist/v10.14.2/node-v10.14.2-linux-x64.tar.xz`
All download options: https://nodejs.org/dist/v10.14.2/

See https://github.com/nodejs/help/wiki/Installation for installing under /usr/local/lib/nodejs.
Alternative rsync install (directly) under /usr/local/:

    cd /tmp
    wget https://nodejs.org/dist/v10.14.2/node-v10.14.2-linux-x64.tar.xz
    tar -Jxvf node-v10.14.2-linux-x64.tar.xz
    # Go to root of binary install tree after unpackaging
    cd node-v10.14.2-linux-x64
    echo -e "CHANGELOG.md\nLICENSE\nREADME.md\nexclude.txt" > exclude.txt
    # test: --dry-run
    sudo rsync -av  --exclude-from exclude.txt ./ /usr/local/
    # re-cache executables in $PATH
    hash -r

The generic Node install from nodejs.org may become handy with an outdated RH/Centos system where Node.js is not available as OS/distro package or would be way outdated that way. It is also very viable way of installing Node on MacOSX.

## Installing Ansible

Ansible is used to extract "host facts" from invetoried hosts (e.g. ones being booted using linetboot).
Installing the distro bundled ansible is recomended:

    # Debian/Ubuntu - available directly in default repos
    sudo apt-get install ansible --no-install-recommends
    # Centos (and RHEL)
    sudo yum install ansible
    # MacOSX (brew likes to run non-superuser)
    brew install ansible

Ansible Requires no special (system wide) configuration.
Inventory file for ansible operations will be configured as part of Linetboot install flow (Ansible and Linetboot will
share the inventory config).

### Linetboot as Ansible Accelerator

You can accelerate Ansible facts gathering phase by using Linetboot `fact_path` as Ansible shared "facts cache"
(e.g. place this into your `~/.bashrc`):
```
# Same location as main config 'fact_path' or env. $FACT_PATH (honored by Linetboot)
export ANSIBLE_CACHE_PLUGIN_CONNECTION=~/hostinfo
export ANSIBLE_CACHE_PLUGIN=jsonfile
export ANSIBLE_CACHE_PLUGIN_TIMEOUT=10000000
```

## Optional Dependencies / Pre-requisites

Some Installers prefer to access files needed for installation via network shares (NFS and Samba/CIFS).
Recent Ubuntu desktop distributions (Ubuntu 18.04 => NFS and Windows => Samba) seem to follow this model
and are unable to use http based installation.

Install NFS file server:
```
# NFS - Debian and Ubuntu
sudo apt-get install nfs-kernel-server
# NFS - RH and Centos
sudo yum install nfs-utils
```
Install Samba/CIFS Server:
```
# Samba/CIFS - Ubuntu / Debian
sudo apt-get install samba samba-common
# Samba/CIFS - RH and Centos (Optional samba-client)
sudo yum install samba samba-common
```

In MacOS goto "System Preferences" => "Sharing" => (Check) "File Sharing" => (Click) Options =>
(Check) "Share files and folders using SMB". Add directories by clicking "+" under "Shared Folders" and
by setting "Everyone ... Read Only" under "Users".

### Configuring NFS Server

NFS filesystems to export/share are configured in `/etc/exports`.
Because of the public and read-only nature of CDROM media, we share media
with no restrictions (except setting it ro=read only).
```
# Whole /isomnt/
/isomnt/ *(ro)
# Each ISO area one-by-one
/isomnt/centos6  *(ro)
/isomnt/centos7  *(ro)
/isomnt/ubuntu16 *(ro)
/isomnt/ubuntu18 *(ro)
```
After edits to `/etc/exports`, run `sudo exportfs -a` to activate changes (this will signal the change to NFS server
and request it to re-read the configuration).
Read more about exporting NFS filesystem from "man exports".

On MacOS the file for configuring exports is the same - /etc/exports - but the format is completely different.
Example of configuring /isomnt to be shared (to local 192.168.1.0 network):
```
/isomnt -ro -mapall=501 -network 192.168.1.0 -mask 255.255.255.0
```
Enabling MacOS NFS Daemon and checking exported dirs:
```
# Enable / Start
sudo nfsd enable
# Check exported FS areas (after adding some)
showmount -e

```

### iPXE Bootloader

This section exists for iPXE bootloader awareness and potential. The iPXE has not been used
in the official development of Linetboot. Notes on iPXE specialties:

- iPXE is based on *.ipxe scripts with hasbang line looking (first-line) signature `#!ipxe`,
that iPXE bootloader loads and uses to configure boot
- Scripts can be loaded by bootloader or embedded (appended?) into bootloader binary (at compile time)
- Scripts syntax has variable notation, if conditionals, goto jumps, commands etc. to implement more
complex things
- Example commands: dhcp, chain, include, echo, set, isset, shell, boot
- iPXE does not have a default (or fallback)
- iPXE typically asks DHCP server for the script name (!), and DHCP server could have conditionals to
detect DHCP client by options passed and send script when client is iPXE (quite a complex interaction)
- Because of the above, the iPXE (w/o custom DHCP config) by design cretaes an infinie DHCP loop
  (Explained at: https://ipxe.org/howto/chainloading => "Breaking the infinite loop")
- iPXE bootloader binaries are available directly from iPXE website (e.g. http://boot.ipxe.org/ipxe.efi)

Install iPXE bootloaders using OS install packages:
```
sudo apt-get install ipxe
sudo yum install ipxe-bootimgs
```
Copy the appropriate bootloader files under TFTP root
```
# EFI Bootloader: ipxe.efi
# Bootloaders for BIOS mode:
# - ipxe.pxe - unloads UNDI and PXE:  (for chainloading, potentially flaky)
# - undionly.kpxe - keeps UNDI, unloads PXE:  (preferred, optimally uses UNDI)
# 
# Ubuntu
cp /usr/lib/ipxe/{undionly.kpxe,ipxe.efi} /var/lib/tftpboot
# Centos/RH
cp /usr/share/ipxe/{undionly.kpxe,ipxe.efi} /tftpboot
```

iPXE Bootloader loads the default config file `default.ipxe` (but seems this has to be configured at DHCP Server) e.g.
```
  if exists user-class and option user-class = "iPXE" {
      filename "http://${next-server}/default.ipxe";
  } else {
      filename "undionly.kpxe";
  }
```
This is based on the difference in user-class field sent by Machine PXE DHCP client vs. iPXE DHCP Client:
```
# Machine PXE (NO 'user class' field)
vendor class: PXEClient:Arch:00000:UNDI:002001
# iPXE (Note: vendor class string is the same)
vendor class: PXEClient:Arch:00000:UNDI:002001
user class: iPXE
```

Another option is to compile bootloader with default script in it (https://lists.ipxe.org/pipermail/ipxe-devel/2011-March/000548.html):
```
make bin/undionly.kpxe EMBEDDED_IMAGE=conf_loader.ipxe
```
Where conf_loader.ipxe might look like:
```
# cat conf_loader.ipxe
#!ipxe
include default.ipxe
```
And default.ipxe might finally look like:
```
#!ipxe
dhcp
chain http://server/fixed-boot-url
include 2nd_stage.ipxe
```


iPXE has a set of internal variables (e.g. `${net0/mac}`, `${TFTP_IP}`, `${next-server}`, etc...) that can be used within a "script" to customize boot.

#### Building iPXE bootloader with embedded script

```
# Clone iPXE git
git clone http://git.ipxe.org/ipxe.git
cd ipxe/src
#  Download (wimboot) script (Note: This is customized to your environment)
wget http://localhost:3000/scripts/wimboot.ipxe -O wimboot.ipxe
# Build (See e.g. https://ipxe.org/embed => "Embedding within the iPXE binary", example
# builds undionly.kpxe)
make bin/ipxe.efi EMBED=wimboot.ipxe
file ./bin/undionly.kpxe
./bin/undionly.kpxe: pxelinux loader (version 3.70 or newer)

```

#### References

iPXE:
- iPXE key-concept Documentation pages
  - Settings (i.e. variables) https://ipxe.org/cfg
  - Commands https://ipxe.org/cmd
  - Configuring Boot with iPXE https://ipxe.org/howto/chainloading
  - Embedding .ipxe script https://ipxe.org/embed
- More on iPXE bootloader variant choices: https://forum.ipxe.org/showthread.php?tid=6989
- IPXE documentation (compiling iPXE, Configuring DHCP) https://wiki.fogproject.org/wiki/index.php/IPXE
- Dicussion on EFI PXE Boot https://forums.fogproject.org/topic/4628/undionly-kpxe-and-ipxe-efi/
- https://wiki.syslinux.org/wiki/index.php?title=PXELINUX
- https://c-nergy.be/blog/?p=13808
- https://coreos.com/matchbox/docs/latest/network-booting.html iPXE Bootsequence
- https://lists.ipxe.org/pipermail/ipxe-devel/2011-March/000549.html - discussion about boot sequence
- https://projects.theforeman.org/projects/foreman/wiki/Fetch_boot_files_via_http_instead_of_TFTP
- iPXE Menu example - https://gist.github.com/robinsmidsrod/2234639

### Grub and Shim (for PXE UEFI setup)

Quick notes about Grub:
- With Grub config lines "linux" and "initrd" are always separate (No nesting initrd=... on linux kernel line)
- Choice of bootloader should not affect choice of kernel, initrd. Use the same ones as with other bootloaders.
- Do not install package "grub-efi-amd64" - this activates Grub as current bootloader on system (we only want bootloader copyable binaries for PXE-based bootloading)
- Redhat Instructions advice to use Grub config keywords "linuxefi" and "initrdefi"

Grub EFI Installation:

```
# grub-efi-amd64-bin is for booting the installed system (non-PXE)
sudo apt-get install grub-efi-amd64-signed shim-signed
# Primary boot-loadable, as registered in DHCP (Use conditionality to detect EFI booting machine: client-arch,7)
# Note: Bootloaders must be in same dir as configs (?)
#OLD: sudo cp /usr/lib/shim/shim.efi.signed                         /var/lib/tftpboot/grub/bootx64.efi
sudo cp /usr/lib/shim/shimx64.efi.signed                       /var/lib/tftpboot/grub/bootx64.efi
sudo cp /usr/lib/grub/x86_64-efi-signed/grubnetx64.efi.signed /var/lib/tftpboot/grub/grubx64.efi
# Optional: /usr/share/grub/unicode.pf2 /var/lib/tftpboot/grub/fonts/unicode.pf2

```

Configuration dir "grub" under TFTP root (Very common grub Netboot convention):
```
mkdir /var/lib/tftpboot/grub/
touch /var/lib/tftpboot/grub/grub.cfg
# x86_64-efi for modules from package grub-efi-amd64-bin
mkdir /var/lib/tftpboot/grub/x86_64-efi
cp /usr/lib/grub/x86_64-efi/*.mod /var/lib/tftpboot/grub/x86_64-efi/

```
Example grub.cfg contents:
```
set default=master
set timeout=5
set hidden_timeout_quiet=false

menuentry "master"  {
  configfile /tftpboot/$net_default_mac.conf
}
```
Use the file (with tftp path ...) `grub/shimx64.efi.signed` as initial boot file for UEFI PXE Client
in your DHCP configuration:
```
# DNSMasq (/etc/dnsmasq.conf)
...
dhcp-match=set:efi-x86_64,option:client-arch,7
dhcp-boot=tag:efi-x86_64,grub/shimx64.efi.signed
...
# ISC DHCP (/etc/dhcp/dhcpd.conf)
class "pxeclients" {
  match if substring (option vendor-class-identifier, 0, 9) = "PXEClient";
  option tftp-server-name "192.168.1.100";
  option bootfile-name   "/grub/shimx64.efi.signed";
}
```
Note: Some articles suggest that file `shimx64.efi.signed` should be renamed to `bootx64.efi` and `grubnetx64.efi.signed` to `grubx64.efi` respectively. However with the PXE clients and DHCP servers I've tested with the original filenames seem to work fine.

For kernel and ramdisk http loading you must use http module (...)

#### References

- Google: grub pxe uefi, grub uefi pxe boot, grub efi netboot
- Google: grub linux vs. linuxefi directives
- http://lukeluo.blogspot.com/2013/06/grub-how-to6-pxe-boot.html
- Ubuntu 20.04 Netboot (w. Grub) https://ubuntu.com/server/docs/install/netboot-amd64
- Ubuntu UEFI netboot: https://wiki.ubuntu.com/UEFI/PXE-netboot-install
- https://wiki.ubuntu.com/UEFI/SecureBoot/PXE-IPv6
- Diskless Grub boot: https://gist.github.com/kvaps/4a61233e4427740c636a0cbd885e54cd
- https://www.redhat.com/sysadmin/pxe-boot-uefi
- https://www.ietf.org/assignments/dhcpv6-parameters/dhcpv6-parameters.txt
- Ubuntu/Dev vs. Fedora grubnetx64.efi (config search): https://kscherer.github.io/linux/2017/03/20/pxe-install-on-uefi-using-foreman-and-grub2
- https://misperious.wordpress.com/2018/02/03/uefi-and-pxe-boot-setup-on-ubuntu-17-10/
- https://olbat.net/files/misc/netboot.pdf

### Configuring Samba Server on Linux

Install samba packages as described earlier in this document ("Install Samba/CIFS Server").

Edit Samba main config `/etc/samba/smb.conf` (In both RH and Debian based distros).
In case of linetboot it will likely be good to expose the /isomnt dirs (your Windows related path location may differ).

```
[global]
# workgroup = WORKGROUP
server string = Linetboot SMB
netbios name = linetboot-smb
# security = user
# MUST HAVE
map to guest = Bad User
dns proxy = no
# Come up with a better name, will be used in "net use ..."
[isomnt]
path = /isomnt
# Needs to be writeable (?) - seems no
browsable = yes
writable  = no
read only = yes
guest ok  = yes
```

Restart samba related services:
```
systemctl enable smb.service
systemctl enable nmb.service
systemctl restart smb.service
systemctl restart nmb.service
# Ubuntu
sudo service smbd restart
```

### Enable Windows Boot

To enable the Linetboot "WIndows 2019 Server" example boot item perform the following setup steps.

Setup and configure Samba server and /isomnt share (e.g.) on Linetboot server (Or server configured in
main config "smbserver").

Use the mkwinpeimg image authoring process (See README.bootmenu.md) and place the `winpe.iso`
ISO image to /isomnt/ directory:
```
# Copy (compacted) ISO
cp -p /tmp/winpe.iso /isomnt/
```
Download *Windows* version of wget executable (to samba shared /isomnt):
```
cd /isomnt/
sudo wget https://eternallybored.org/misc/wget/1.21.1/64/wget.exe
```
Place Linetboot generated Autounattend.xml file (to samba shared /isomnt):
```
sudo wget http://linetboot:3000/Autounattend.xml -O /isomnt/Autounattend.xml
```

### wimtools and wimlib - WinPE Authoring tool

```
# Debian / Ubuntu
# Suggests: genisoimage mtools syslinux cabextract
sudo apt-get install libwim15 wimtools
```
wimtools contains the important utility `mkwinpeimg` for re-authoring simple WinPE windows ISO images out of
full Windows install ISO:s. It will read the *essential* windows files from and re-author a new "mini-ISO" that will be
< 1/10 of original size.

### DRBL - Diskless Remote Boot in Linux

Info Resources:
- SourceForge http://drbl.sourceforge.net
- Clonezilla SE/Server Edition https://clonezilla.org/clonezilla-SE/
- DRBL/Diskless Remote Boot in Linux https://drbl.org/installation/
- Clonezilla Live Usage https://clonezilla.org/clonezilla-usage/general-live-use.php
- Clonezilla params info (e.g. `ocs_live_extra_param`, `ocs_live_run`): https://clonezilla.org/show-live-doc-content.php?topic=clonezilla-live/doc/99_Misc

By default Clonezilla client wants "image root" mounted onto `/home/partimag/`, under which each subdirectory
presents an image.

On Image Server Size (Essentially NFS,CIFS or sshfs server) create the image root directory and


# Linux NetBoot and Installation System Layout

The sequence of booting installer and installing an OS with netinstall:

<!--
    |------------| |-----------|  |---------|      |----------------------|
    | DHCP       | | TFTP      |  | HTTP    |      | HTTP Package mirror  |
    | Server     | | Server    |  | Server  |      | Server               |
    | - NBP Name | | - NBP File|  | - Kernel|      | - udeb, deb packages |
    | - TFTP Name| | - Menus   |  | - InitRD|      |
    |____________| |___________|  | - preseed.cfg
-->
![Boot Diagram](doc/netbootseq.png "Boot Sequence Diagram")


# Overview of Network boot and Install Subsystems

## DHCP Server

PXE Booting standard and respective implementations start by consulting local DHCP server for IP address, "Boot file" and "Next Server". The next server allows a server other than DHCP server to handle delivery of "Boot file".

Hopefully you get to utilize an existing DHCP server. However you have to buddy-up with the admins of the server
to tweak the config in a minor way. See section "Changes to local DHCP Server".

## TFTP Server

The first stage low level booting starts by loading (pxelinux) files 
PXE Linux (e.g. pxelinux.0) is NOT a linux OS or system, but a network bootloader system with configurable menu system designed to boot linux from network. linetboot will minimize the usage of TFTP to absolute bare minimum - only pxelinux bootloader NBP components and boot menu will be gotten from TFTP. All Linux stuff (Kernel, Initial ramdisk) will be delivered by this system using HTTP (See following section).

## HTTP Server

The HTTP server used by linetboot is a lightweight Node.js / Express server without presence of - or need to install - a "big" webserver like "Apache".

Web server has dual roles:

- Deliver static files like ...:
  - Kernel images, Initial ramdisk and filesystem images (to boot the system)
  - OS software packages (during the OS install)
- Generate dynamically installation configurations for OS installers (basically instructions to automate the install) in the format that particular OS flavor prefers:
  - In Debian family of OS:s a format called "Preseed" is used
  - In RedHat family of OS:s a format called "kickstart" is used

linetboot and its dependencies can be installed plainly with git and npm (Node.js ecosystem package installer).

## Media (Server)

The media used by linetboot is a set of CD/DVD ISO Image files that are mounted as "loopback file" or "loop device" (mount option `-o loop`). For more detailed information on this google "loop device" or read the man page for `mount`.

Various OS ISO images are used for various purposes:
- Some are Utility images like GpartEd Live that allows tweaking disk partitions, checking and recovering filesystems, diagnosing, extracting system data or testing memory (e.g. memtest86)
- OS install media images allow to install a full OS on the client

For latter purpose most OS:s allow network boot, although many of them also have bugs in installation process when doing the network install).

The mount points of ISO images are symlinked (or alternatively URL-mapped) to be accessible by the HTTP server (viat the web server "document root").

## Hostinfo (Facts) DB

Hostinfo DB is not a real DB server, but just filesystem based JSON document (file) collection gathered by Ansible fact gathering process. The steps to collect this info are:

Create a small Ansible hosts file (e.g. hosts):

    [netboot]
    linux1 ansible_user=admuser
    linux2 ansible_user=admuser

Note: The linetboot external hosts file (given by "hostsfile" main config property) is compatible with ansible and all
this info can be given in there.

Run facts gathering:
     
     # inventory group = netboot (-u root would eliminate need for ansible_user= in inventory)
     ansible -b netboot -i ./hosts -m setup --tree ~/hostinfo --extra-vars "ansible_sudo_pass=..."
     # Single host w/o inventory
     ansible -b -u admuser -K -i linux1, all -m setup --tree ~/hostinfo

Make sure your SSH key is copied to host(s) with ssh-copy-id.
If you have problems getting ansible running on lineboot machine, the hostinfo DB can be easily rsynced from another host (that is more capable running ansible):

    rsync ~/hostinfo admuser@boothost:/home/admuser/hostinfo

Currently an explicit list of hosts to be allowed to be booted/installed by linetbot system is in global config under key "hostnames" (See: "Linetboot configuration" for more info). Hosts outside this list will not be counted in from the hostinfo directory.

For further info see documents for:

- [Installation Pre-requisites](doc/README.prereq.md "Installation Pre-requisites for all related SW")
- [Configuring Linetboot and related systems](doc/README.configure.md "Configuring Linetboot and all related SW")
- [Troubleshooting](doc/README.troubleshoot.md "Troubleshooting the whole Linetboot system functionality")
- [Linetboot FAQ - Frequently Asked Questions](doc/README.faq.md "Frequently Asked Questions")
-------------------------------------------------------------------------------------------------

## Pre-configured Boot Options in pxelinux.cfg/default

Planned / Pre-configured boot options on the menu:

- Boot from local disk, first partition
- Boot from local disk, second partition
- Run Gparted Live to tweak, fix or diagnose the system
- Run memory test
- TODO: Install on first existing (big enough ?) partition
- Install automatically and completely repartition the drive

Notes:
- The topmost items in menu are "less dangerous" and more "read-only" to your system. In case you nervously fat finger with your arrow down, you have ~4 menu items before the "extreme makeover" items
- Currently the automated installation "recipe" will/may wipe out your disk. Please review the preseed and kickstart templates before using them to avoid data loss.

# Using CDROM Content as preseed mirror

Reverse engineered:
- The Ubuntu top level / root of CDROM has subdir path "pool/main/" under it.
  - Has "aphabet dirs" (hashed ?) under it with package named dirs under it.
- The Ubuntu mirror site http://us.archive.ubuntu.com/ has subdir (for bionic)
  - ubuntu/dists/bionic/ with main,multiverse,restricted,universe ... but content differs between mirror and CD/DVD.

## Using apt-mirror (from pkg apt-mirror)

- Install sudo apt-get install apt-mirror
- See config: /etc/apt/mirror.list
- Must configure: set base_path           /var/spool/apt-mirror
- Downloads whole remote SW repository, e.g. 45GB of SW packages

# Using raw ISO CD/DVD

Download and mount CD/DVD Images (*.iso) as aloopback mount under /mnt by sequence:

    # Create central iso repo (Use better name like os_iso as needed)
    cd /usr/local
    sudo mkdir iso
    #sudo chown myacct:myacct iso
    cd iso
    # Download from http://cdimage.ubuntu.com/releases/14.04.5/release/ and http://cdimage.ubuntu.com/releases/18.04.1/release/
    wget http://releases.ubuntu.com/14.04/ubuntu-14.04.5-server-amd64.iso
    #wget http://cdimage.ubuntu.com/releases/14.04.5/release/ubuntu-14.04.5-server-amd64+mac.iso
    wget http://cdimage.ubuntu.com/releases/18.04.1/release/ubuntu-18.04.1-server-amd64.iso
    wget https://osdn.net/frs/redir.php?m=constant&f=clonezilla%2F71563%2Fclonezilla-live-2.6.3-7-amd64.iso
    # Create mountpoints and mount
    sudo mkdir -p /isomnt/ubuntu14 /isomnt/ubuntu18 /isomnt/centos6 /isomnt/centos7 /isomnt/gparted
    ls -al /isomnt/
    sudo mount -o loop ubuntu-14.04.5-server-amd64.iso /isomnt/ubuntu14
    sudo mount -o loop ubuntu-18.04.1-server-amd64.iso /isomnt/ubuntu18
    sudo mount -o loop CentOS-6.10-x86_64-minimal.iso  /isomnt/centos6
    sudo mount -o loop gparted-live-0.31.0-1-amd64.iso /isomnt/gparted
    sudo mount -o loop clonezilla-live-2.6.3-7-amd64.iso /isomnt/clzilla
    # sudo mkdir -p /isomnt/centos6
    # sudo mount -o loop CentOS-6.6-x86_64-netinstall.iso /isomnt/centos6
    # As an excercise ... add Centos ... :-)
    # Mirror index page that shows mirror links to download dirs (with ISO images in dir listing)
    # http://isoredirect.centos.org/centos/7/isos/x86_64/
    # http://repos.lax.quadranet.com/centos/7.6.1810/isos/x86_64/CentOS-7-x86_64-DVD-1810.iso (DVD, 4.5 GB)
    # http://repos.lax.quadranet.com/centos/7.6.1810/isos/x86_64/CentOS-7-x86_64-Minimal-1810.iso (Minimal, ~970MB)
    # http://isoredirect.centos.org/centos/6/isos/x86_64/
    # http://repos.lax.quadranet.com/centos/6.10/isos/x86_64/CentOS-6.10-x86_64-minimal.iso (Minimal, ~425MB)
    
Referring to CD/DVD content, add symlinks for installer boot kernels and ramdisks.
We'll add everything under /var/www/html/ (Seems to exist in both Debian/RH based distros).

    # Prepare boot/ directories under web server document root.
    sudo mkdir -p /var/www/html/boot/
    cd /var/www/html/boot/
    sudo mkdir -p ubuntu14/ ubuntu18/ centos6/ centos7/ gparted/
    ls -al /var/www/html/boot

Find kernel and initrd by example:
    # Kernel
    find  /isomnt/ubuntu18 -type f -name linux
    # Initramdisk
    find  /isomnt/ubuntu18 -type f -name initrd.gz
   
    sudo ln -s /isomnt/ubuntu18/install/netboot/ubuntu-installer/amd64/linux /var/www/html/boot/ubuntu18/linux
    sudo ln -s /isomnt/ubuntu18/install/netboot/ubuntu-installer/amd64/initrd.gz /var/www/html/boot/ubuntu18/initrd.gz
    # ... Repeat searches for ubuntu14 and create symlinks
   sudo ln -s /isomnt/ubuntu14/install/netboot/ubuntu-installer/amd64/linux /var/www/html/boot/ubuntu14/linux
    sudo ln -s /isomnt/ubuntu14/install/netboot/ubuntu-installer/amd64/initrd.gz /var/www/html/boot/ubuntu14/initrd.gz
    # Centos 6 (Network boot installer kernel and initrd under $MEDIAROOT/images/pxeboot/)
    sudo ln -s /isomnt/centos6/images/pxeboot/vmlinuz /var/www/html/boot/centos6/vmlinuz
    sudo ln -s /isomnt/centos6/images/pxeboot/initrd.img /var/www/html/boot/centos6/initrd.img
    # Centos 7 ... same
   
    # Gparted Live
    sudo ln -s /isomnt/gparted/live/vmlinuz /var/www/html/boot/gparted/vmlinuz
    sudo ln -s /isomnt/gparted/live/initrd.img /var/www/html/boot/gparted/initrd.img
    # test for correct symlinking
    cd /var/www/html/boot
    md5sum ubuntu14/linux ubuntu18/linux ubuntu14/initrd.gz ubuntu18/initrd.gz gparted/vmlinuz gparted/initrd.img

To serve mirror content with Apache/NginX, or to just avoid url mapping with linetboot, create a symlink to CDROM image root from Ubuntu/Debian default www document root:

    cd /var/www/html
    ln -s /isomnt/ubuntu18 ubuntu18
    ln -s /isomnt/ubuntu14 ubuntu14
    ln -s /isomnt/centos6 centos6
    ln -s /isomnt/centos7 centos7
    ln -s /isomnt/gparted gparted

A hint for choosing the CD/DVD Image: for example Ubuntu release new "patch versions" of the CD/DVD image regularly (when enough
updates have cumulated), that are labeled with new "dot-version" at the end of official release version. For example "18.04.1" would be the
first patch release update after launch of "18.04". This appears in the CD/DVD image name. Choose the highest version to minimize the amount
of update downloads after install.


# Additional Topics

## Debian Installer Preseed examples

In Ubuntu/Debian CD/DVD images: $CDROOT/preseed (Note: these are not very comprehensive examples). Google for "Preseed example".

## Boot Kernels and Initramdisk images on ISO images

The answers to "wheres's the kernel and init ramdisk for boot of particular OS" can be quickly gotten by find utility,
but just to speed up the process and to provide confirmation, here are the *likely* path locations for boot kernel
and intial ramdisk:

Gparted:
- $ROOT/live/vmlinuz
- $ROOT/live/initrd.img
Ubuntu (14.04, 18.04):
- $ROOT/install/netboot/ubuntu-installer/amd64/linux
- $ROOT/install/netboot/ubuntu-installer/amd64/initrd.gz
Centos (6, 7):
- $ROOT/images/pxeboot/vmlinuz
- $ROOT/images/pxeboot/initrd.img
- Also $ROOT/isolinux/ has these (for ISO/CD boot)

Symlink to these files from respective $DOCROOT/boot/$OSID/ directory.


## TODO

- Discover a good, comprehensive kernel+initrd combo w. good basic set of utilities (e.g. fdisk, ...) for local disk boot that may
act as a recovery or diagnostics toolkit for machine (Although full boot to Gparted would compensate for this) ... when first partition
mount fails and boot leads to single user mode.
  - Ubuntu 18 basic kernel+initrd are not great in this respect (e.g. fdisk,cfdisk,gfdisk missing)
  - Try using Gparted kernel+initrd
- See the possibility to use Centos netinstall (e.g. CentOS-6.6-x86_64-netinstall.iso) for boot and have minimal edition
  (e.g. CentOS-6.10-x86_64-minimal.iso) on the server, of course versions fully matching
  - See https://www.tecmint.com/centos-6-netinstall-network-installation/  refers: http://mirror.liquidtelecom.com/centos/6.10/os/x86_64/
- Create systemd startup file for linetboot
- Rename main config from ...global... to linetboot.
- Create a automatic logic to lookup custom configs, templates from dir ~/.linetboot


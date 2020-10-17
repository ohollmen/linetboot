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

# What is Linetboot ?

Lineboot is ...

- PXE Boot and OS Installation Orchestration central
- DHCP and TFTP Server management system (Lineboot can provide configurations and setup for these)
- Hi-Performance HTTP Based OS Install media server
- Host Asset Inventory system - View hosts Network,Hardware and OS/version info and keep track of packages installed on OS
- Host Asset statistics reporting system
- Small scale real-time (snapshot based) host monitoring system (shows network reachability, DNS status, SSH-reachability)
- IPMI, iDRAC and RedFish Remote management system
- SSH Host keys Inventory - enabling archiving and restoration of SSH hostkeys when hosts get re-imaged
- a bunch of documentation and hints to help you in any (non-Linetboot) DIY PXE related project

Any of these features can be disabled to use only subset of features.
There is a special synergy between Ansible and Linetboot on multiple fromts (explained better in the documentation, see below).

Lineboot can be made to manage:

- Home/Office: Office Workstations, Diskless Workstations, Home network computers
- DB Servers, Web servers
- Compute Clusters, Build Farms 
- Bottom line: any computers accessible with Ansible

Linetboot is written in Javascript and Node.js, which is one of the best languages / runtimes to create high-performing network based
concurrently tasking aplications.

## What does Lineboot Run on ?

- Ubuntu / Debian (Tested on x86 and ARM)
- RedHat/Centos (tested on RH 6 and VMWare hosted Centos 7)
- MacOS (BSD UNIX)
- Likely in any Linux distro that has node.js available

Install and config instructions aim to advice on the minute config differences needed on various platforms
(Mainly accounting for package name differences or e.g. loop mounting commands in linux vs. BSD).

-------------------------------------------------

## Systems Linetboot Collaborates with

- DHCP Server - PXE Bootload process starts here
- TFTP Server - Hosts 1st stage bootloaders
- LDAP Directory (Optional) - Used for optional authentication

If you used Lineboot only as Asset Inventory, the DHCP and and TFTP would be needed.

<!--

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
- Generate dynamically OS installers "install-recipes":
  - Debian/Ubuntu "Preseed"
  - RedHat/Centos "kickstart"
  - FreeBSD 
  - Windows Autounattend.xml

linetboot and its dependencies can be installed plainly with git and npm (Node.js ecosystem package installer).

## Media (Server)

The media used by linetboot is a set of CD/DVD ISO Image files that are mounted as "loopback file" or "loop device" (mount option `-o loop`). For more detailed information on this google "loop device" or read the man page for `mount`.

Various OS ISO images are used for various purposes:
- Some are Utility images like GpartEd Live that allows tweaking disk partitions, checking and recovering filesystems, diagnosing, extracting system data or testing memory (e.g. memtest86)
- OS install media images allow to install a full OS on the client

For latter purpose most OS:s allow network boot, although many of them also have bugs in installation process when doing the network install).

The mount points of ISO images are symlinked (or alternatively URL-mapped) to be accessible by the HTTP server (via the web server "document root").


-->

<!--
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
If you have problems getting ansible running on linetboot machine, the hostinfo DB can be easily rsynced from another host (that is more capable running ansible):

    rsync ~/hostinfo admuser@boothost:/home/admuser/hostinfo

Currently an explicit list of hosts to be allowed to be booted/installed by linetbot system is in global config under key "hostnames" (See: "Linetboot configuration" for more info). Hosts outside this list will not be counted in from the hostinfo directory.
-->

For further info see Lineboot documentation for:

- [Installation Pre-requisites](doc/README.prereq.md "Installation Pre-requisites for all related SW")
- [Lineboot Installation](doc/README.install.md "Linetboot Installation (Divided to Stage 1,2,3)")
- [Configuring Linetboot and related systems](doc/README.configure.md "Configuring Linetboot and all related SW")
- [Administering Boot media (ISO images)](doc/README.bootmedia.md "ISO Bootmedia")
- [Authoring and configuring Bootmenu](doc/README.bootmenu.md "Configuring Boot menu")
- [Troubleshooting](doc/README.troubleshoot.md "Troubleshooting the whole Linetboot system functionality")
- [Linetboot FAQ - Frequently Asked Questions](doc/README.faq.md "Frequently Asked Questions")
- [Boot media (ISO:s)](doc/README.bootmedia.md "Boot media and Bootable ISO Images")
- [Boot menu](doc/README.bootmenu.md "Configuring PXELinux Boot Menu Items")




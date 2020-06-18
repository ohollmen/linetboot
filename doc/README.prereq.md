# Installation Prerequisites

List of prerequisites for a functional lineboot system:

- pxelinux - Provides network bootloaders (pxelinux0, lpxelinux.0, with latter supporting http)
- syslinux-efi - Network bootloader for UEFI
- Tftp server - to store PXE Linux and menus on (Debian/Ubuntu: tftpd, tftpd-hpa, dnsmasq or atftpd, Redhat/CentOS: tftp-server)
- nodejs and npm - to run the preseed generation (and optionally mirror server for static file content (packages))
- ansible - to record host facts

Additionally you need download CD/DVD ISO Images, e.g:
- Ubuntu: [archive.ubuntu.com](http://archive.ubuntu.com/ubuntu/dists/).
- Gparted Live ISO/CD Image (from https://gparted.org/download.php)
- Centos Install ISO:s (from https://wiki.centos.org/Download)

Optional (Development):
- devscripts - Tools to explore remote Ubuntu/Debian mirrors (e.g. rmadison linux-generic)

## PXE Linux Bootloader

Ubuntu/Debian Install:

    # Pulls in syslinux-common as dependency
    sudo apt-get install pxelinux

Centos/RHEL does not seem to have lpxelinux.0 at all, but syslinux can be installed:

    # See also: syslinux syslinux-devel syslinux-extlinux syslinux-perl syslinux-tftpboot
    sudo yum install syslinux

pxelinux has bootloader `lpxelinux.0` with HTTP support and HTTP is what this system is largely all about (RedHat / CentOS version that I checked did not have `lpxelinux.0` at all).
Files that are needed from `pxelinux` package come from directories:
- /usr/lib/PXELINUX/*pxelinux.0 - 3 possible `*pxelinux.0` bootloaders, but we linetboot mandates the `lpxelinux.0` with HTTP support
- /usr/lib/syslinux/modules/bios/*.c32 pxelinux bootloader modules (from `syslinux-common`)

## Setting up TFTP Server directories for PXE Booting


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
    # For example booting FreeBSD uses this.
    memdisk
    # Bootmenu is located in in a subdir named "pxelinux.cfg", file "default"
    # There can also be per-client differentiated boot menus by MAC address
    # (e.g. symlinks)
    pxelinux.cfg/
    pxelinux.cfg/default

All the components must be for intel X86 cpu architecture (Booting ARM has not been tested yet).
  
TFTP server default content root directory locations:
- Debian/Ubuntu: `/srv/tftp`
- Centos/RHEL: `/var/lib/tftpboot`

In RH/Centos pxelinux and its modules are installed by `yum install syslinux`, but this may not provide the lpxelinux.0' that is required by linetboot.

Info on UEFI syslinux.efi boot: https://wiki.syslinux.org/wiki/index.php?title=Configuration_location_and_name


## Installing TFTP Server

Debian/Ubuntu (Default TFTP Server data/content root: **/srv/tftp**).

    # This "just works". No config needed. Default TFTP root /srv/tftp.
    # However this TFTP server does not support TFTP "options" (See RFC 2347).
    # Some X86_64 UEFI BIOSes require options for PXE Boot TFTP phase.
    sudo apt-get install tftp tftpd
    # For options support install tftpd-hpa
    sudo apt-get install tftpd-hpa

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
    # test getting the test file
    tftp localhost -c get dummy.txt
    cat dummy.txt

in Centos follow the system log file `/var/log/messages` for TFTP daemon messages.

## Installing Node.js

If you are running a fairly recent distro (Ubuntu >= 16.04, Centos/RHEL >= 7) it is suggested you install
Node.js and Node package manager from distro sources:

    # Debian/Ubuntu - available directly in default repos
    sudo apt-get install nodejs npm
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

The generic Node install from nodejs.org may become handy with an outdated RH/Centos system where Node.js is not available as OS/distro package or would be way outdated that way.

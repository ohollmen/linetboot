# Installation Prerequisites

List of prerequisites for a functional lineboot system:

- pxelinux - Provides network bootloaders (pxelinux0, lpxelinux.0, with latter supporting http)
- Ubuntu install CD/DVD Image (from http://archive.ubuntu.com/ubuntu/dists/)
- Gparted Live CD Image (from https://gparted.org/download.php)
- Centos Install CD:s 
- Tftp server - to store PXE Linux and menus on (Debian/Ubuntu: tftpd, tftpd-hpa or atftpd, Redhat/CentOS: tftp-server)
- nodejs and npm - to run the preseed generation (and optionally mirror server for static file content (packages))
- ansible - to record host facts

Optional (Development):
- devscripts - Tools to explore remote Ubuntu/Debian mirrors (e.g. rmadison linux-generic)

## PXE Linux Bootloader

Install Ubuntu/Debian package `pxelinux` and its dependency `syslinux-common` on Ubuntu/Debian system as pxelinux has bootloader `lpxelinux.0` with HTTP support and HTTP is what this system is largely all about (RedHat / CentOS version that I checked did not have `lpxelinux.0` at all).
Files that are needed from `pxelinux` package come from directories:
- /usr/lib/PXELINUX/*pxelinux.0 - 3 possible `*pxelinux.0` bootloaders, but we linetboot mandates the `lpxelinux.0` with HTTP support
- /usr/lib/syslinux/modules/bios/*.c32 pxelinux bootloader modules (from `syslinux-common`)

Content needed on TFTP Server (relative to TFTP server root):

    # The PXELinux bootloader
    lpxelinux.0
    # bootloader for UEFI based boots (Needs to be in subdir for differentiation of
    # *.c32 modules below, found in package "syslinux-efi")
    efi64/syslinux.efi
    efi32/syslinux.efi
    # syslinux (apt:"syslinux-common") modules that (l)pxelinux.0 will use
    ldlinux.c32
    libutil.c32
    menu.c32
    vesamenu.c32
    libcom32.c32
    # Memdisk kernel (from syslinux-common) for loading ISO:s and raw images
    memdisk
    # Bootmenu in a subdir named "pxelinux.cfg"
    # There can also be per-client differentiated boot menus by MAC address (e.g. symlinks)
    pxelinux.cfg/
    pxelinux.cfg/default

After installing APT package pxelinux on your (recent) Ubuntu / Debian distribution, install the pxelinux and pxelinux modules (*.c32) by rsync or scp to TFTP server root directory.
  
TFTP Root on Debian/Ubuntu: /srv/tftp, Centos /var/lib/tftpboot.
In RH/Centos pxelinux and its modules are installed by `yum install syslinux`, but this may not provide the lpxelinux.0' that is required by linetboot.
 
## Installing Node.js

Ubuntu: `sudo apt-get install nodejs npm`

Generic linux install: Download: `wget https://nodejs.org/dist/v10.14.2/node-v10.14.2-linux-x64.tar.xz`
All download options: https://nodejs.org/dist/v10.14.2/

See https://github.com/nodejs/help/wiki/Installation for installing under /usr/local/lib/nodejs.
Alternative rsync install (directly) under /usr/local/:

    cd /tmp
    wget https://nodejs.org/dist/v10.14.2/node-v10.14.2-linux-x64.tar.xz
    
    # Go to root of binary install tree after unpackaging
    cd node-v10.14.2-linux-x64
    echo -e "CHANGELOG.md\nLICENSE\nREADME.md\nexclude.txt" > exclude.txt
    # test: --dry-run
    sudo rsync -av  --exclude-from exclude.txt ./ /usr/local/
    hash -r

The generic Node install from nodejs.org may become handy with an outdated RH/Centos system where Node.js is not available as OS/distro package or would be way outdated that way.

## Installing TFTP Server

Debian/Ubuntu (Default TFTP Server data/content root: /srv/tftp).

    # This "just works". No config needed. Default TFTP root /srv/tftp
    sudo apt-get install tftp tftpd

RedHat/Centos (Default TFTP Server data/content root: /var/lib/tftpboot).

    # See if you already got tftp-server or tftp
    yum list installed | grep tftp
    # Prefer having both tftp.x86_64 and tftp-server.x86_64, former (client)
    # for diagnosing/testing/troubleshootting. Will be used for testing below.
    sudo yum install tftp-server tftp
    # Edit and change disable to 'no'
    # For logging verbosity add -v,--verbose to server_args (-s,--secure = chroot server root,
    # -v may be added multiple times)
    sudo vi /etc/xinetd.d/tftp
    # Verify
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


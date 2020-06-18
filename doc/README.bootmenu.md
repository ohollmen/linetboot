# Authoring PXELinux Boot menu items

There is plenty of good documentation on PXELinux (bootloader) netboot
and this section is not a detailed documentation for it.
The template file `tmpl/default.installer.menu.mustache` should give a
plenty of good examples on configuring various distros to boot via pxelinux.
For the sequence and phase when pxelinux gets loaded see the sequence diagram
showing lineboot operation. See: https://www.syslinux.org/wiki/index.php?title=PXELINUX - Explanations of load order, HTTP,FTP Support, Examples on boot menus.

For more info on pxelinux boot menu file structure and directives, read `man syslinux`.

## Adding a new disto boot item

Find **kernel** and initial ramdisk (**initrd**) to use for PXE boot. Hope your distro documentation has
good info on this or you find it by googling.

When lacking documentation, find kernel and initrd for your distro for example by:

    # Kernel (vmlinuz, linux)
    find  /isomnt/ubuntu18 -type f -name "*linu*"
    # Initramdisk (initrd.img, initrd.gz, initrd)
    find  /isomnt/ubuntu18 -type f -name "initrd*"

This search will score you values for variables **kernel** and **initrd** respectively (Fill thes into the template you're going to use):

    kernel http://{{ httpserver }}/ubuntu18/install/netboot/ubuntu-installer/amd64/linux
    # A lot more goes to append line after initrd parameter
    append initrd=http://{{ httpserver }}/ubuntu18/install/netboot/ubuntu-installer/amd64/initrd.gz

Next you need to find out the rest of the kernel command line parameters to use to accomplish the use case 
you have in mind. All these are added to **append** parameters.
Some of these parameters have meaning to kernel and some to installers (and
other apps running in the OS).

## Pre-configured Boot Options in example pxelinux.cfg/default

Planned / Pre-configured boot options on the menu:

- Boot from local disk, first partition
- Boot from local disk, second partition
- Run Gparted Live to tweak, fix or diagnose the system
- Run memory test
- Run desktop distro in live mode (with NO auto-install)
- TODO: Install on first existing (big enough ?) partition
- Install automatically and completely repartition the drive

Notes:
- The topmost items in menu are "less dangerous" and more "read-only" to your system. In case you nervously fat finger with your arrow down, you have ~4 menu items before the "extreme makeover" items
- Currently the automated installation "recipe" will/may wipe out your disk. Please review the preseed and kickstart templates before using them to avoid data loss.

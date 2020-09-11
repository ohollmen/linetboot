# Authoring PXELinux Boot menu items

There is plenty of good documentation on PXELinux (bootloader) netboot
and this section is not a detailed documentation for it.

The bootmenu template file `tmpl/default.installer.menu.mustache` should give a
plenty of good examples on configuring various distros to boot via pxelinux.
For the sequence and phase when pxelinux gets loaded see the sequence diagram
showing lineboot operation. See: https://www.syslinux.org/wiki/index.php?title=PXELINUX - Explanations of load order, HTTP,FTP Support, Examples on boot menus.

For more info on pxelinux boot menu file structure and directives, read `man syslinux`.

## Menu Template Fill-in

The menu template gets "filled-in" with parameters and turned into a usable menu with Mustache templating engine command:

    cat ~/.linetboot/global.conf.json | ./node_modules/mustache/bin/mustache - ./tmpl/default.installer.menu.mustache > /tmp/default

While the example has a safe test location `/tmp/default` the output should get finally stored in a relative file `pxelinux.cfg/default` under your TFTP root directory (e.g. ).
Example of this is in Makefile target `gendefault`.

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

# Booting load-in-memory ISO images

Linux Bootloader utility `memdisk` allows to load either raw image or ISO image into memor from where it will boot like from
local CD/DVD drive. This will require at least as much RAM as the size of the image.
Construct shown on oitibs.com:

```
LABEL myos
MENU LABEL My OS
kernel memdisk
append iso initrd=http://myos.com/myos.iso raw
```
There are also variations that use initrd with URL (leaving out iso or raw from it) and have a separate have `append iso` line
(or even `append iso raw` is possible).
More info on this: https://oitibs.com/pxe-boot-almost-any-iso-image/ (See also: https://oitibs.com/pxe-structure-on-windows-2008-r2/)

# Booting Windows (WinPE - Windows Preinstallation environment)

Explanation of Windows "native" PXE Boot process (and OS install, from Arch and musteresel pages listed in refs):
- Beginning of boot with DHCP (giving boot server, boot file), TFTP and loading PXELinux from there is same
- PXELinux is using memdisk (chained bootload) utility to load WinPE (Windows PE) ISO (e.g. winpe.iso) and execute it
- After WinPE (ISO) boots, it: 
  - Runs `wpeinit` to detect hardware
  - Runs `ipconfig` to get network settings via DHCP
  - Accesses a SMB network drive with files from the Windows install iso (e.g. net use I: \\192.168.42.1\GUEST /user:user pass)
  - Runs setup.exe (from Samba drive) to start the installation (e.g. I:\setup.exe).

WinPE PXELinux menuitem config may look as follows (From Arch Linux documentation):
```
label winpe
menu label Boot WinPE (ISO)
kernel memdisk
initrd winpe.iso
# For lpxelinux.0 with http capability:
# initrd http://linetboot:3000/winpe.iso
append iso raw
```
This config has been used with `pxelinux.0` over TFTP.

### Authoring WinPE ISO Images (winpe.iso)

wimlib toolkit (Deb/Ubu package `libwim15`) has utility `mkwinpeimg` to author WinPE ISO mimages based on Windows install CD/DVD
ISO images.

Example command line for creating an image:

    mkwinpeimg --iso --windows-dir=/tmp/win10iso --tmp-dir=/home/mustersel/temporary \
        --start-script=/tmp/win-pxe/start.cmd /tmp/winpe.iso

Use alternatively --waik-dir (not --windows-dir) if files are from WAIK/WADK.

References:
- https://wiki.archlinux.org/index.php/Windows_PE
- https://musteresel.github.io/posts/2018/04/install-windows-over-pxe-with-dnsmasq-pxelinux-winpe.html
- en.wikipedia.org/wiki/Windows_Preinstallation_Environment
- The Windows® Automated Installation Kit (AIK) for Windows® 7 https://www.microsoft.com/en-us/download/details.aspx?id=5753 

# Authoring PXELinux Boot menu items

There is plenty of good documentation on PXELinux (bootloader) netboot
and this section is not a detailed documentation for it.

The bootmenu template file `tmpl/default.installer.menu.mustache` should give a
plenty of good examples on configuring various distros to boot via pxelinux.
For the sequence and phase when pxelinux gets loaded see the sequence diagram
showing lineboot operation. See: https://www.syslinux.org/wiki/index.php?title=PXELINUX - Explanations of load order, HTTP,FTP Support, Examples on boot menus.

For more info on pxelinux boot menu file structure and directives, read `man syslinux`.

## Lineboot "safe" menu format convention

To make most sure your menu is most compatible with Linetboot (which parses
the contents of menu under few circumstances), order the fields of your
your single boot item entry in following way:

- `label` - Boot label symbol
- `menu label` - Human readable description of boot item
- `kernel` - Kernel to load
- `initrd` - Intial ramdisk to load for 1st stage boot
- `append` - Additional (key=value) kernel commandline parameters for boot.

For raw and ISO image based boots the initrd and kernel are usually missing,
see example boot menu file for examples.

You should note that while initrd info can be given as `initrd=...` on append line, it should be given as separate field in menu file (also Grub bootloader
mandates it as a separate line and does not allow blending it with kernel CL options).

## Menu Template Fill-in

The menu template gets "filled-in" with parameters and turned into a usable menu with Mustache templating engine command:

    cat ~/.linetboot/global.conf.json | ./node_modules/mustache/bin/mustache - ./tmpl/default.installer.menu.mustache > /tmp/default

While the example has a safe test location `/tmp/default` the output should get finally stored in a relative file `pxelinux.cfg/default` under your TFTP root directory (e.g. ).
Example of this is in Makefile target `gendefault`.

## Adding a new disto boot item

Find **kernel** and initial ramdisk (**initrd**) to use for PXE boot. Hope your distro documentation has
good info on this or you find it by googling. Some distros are designed to be PXE booted and nertwork installed some
are not. Before starting it is a good planning step to see if google produces any results for search "PXE boot
$DISTRO_NAME $DISTRO_VERSION". 

When lacking documentation, find kernel and initrd for your distro for example by:

    # Kernel (vmlinuz, linux)
    find  /isomnt/ubuntu18 -type f -name "*linu*"
    # Initramdisk (initrd.img, initrd.gz, initrd)
    find  /isomnt/ubuntu18 -type f -name "initrd*"

This search will score you values for variables **kernel** and **initrd** respectively (Fill these into the boot menu
template file you're going to use):

    kernel http://{{ httpserver }}/ubuntu18/install/netboot/ubuntu-installer/amd64/linux
    # A lot more goes to append line after initrd parameter
    append initrd=http://{{ httpserver }}/ubuntu18/install/netboot/ubuntu-installer/amd64/initrd.gz

Next you need to find out the rest of the kernel command line parameters to use to accomplish the use case 
you have in mind. All these are added to **append** line parameters.
Some of these kernel command line parameters have meaning directly to kernel and some parameters have only meaning to installers (and
other apps running during install in the OS). Linux kernel is known to not be "picky" about it's command line parameters - it acceps any
"flag nature parameters" (e.g. "nodhcp") or key=value parameters (e.g. "mediaurl=http://.../media/").

After adding your new boot item to menu template, run templating on it (See "Menu Template Fill-in" above for example,
also the command "node hostsetup.js tftpsetup" does this for you using default menu file).

## Custom Menu for Your Environment

The default menu may have unneeded items that are a mere distraction for your boot/OS Install environment.
These items can be commented out or deleted from menu file. If you plan to later add new upstream boot items from linetboot,
you can keep diffing the files and add new boot items (text fragments) manually (based on diff).

## Pre-configured Boot Options in Linetboot Example pxelinux.cfg/default

Planned / Pre-configured boot options on the menu:

- Boot from local disk, first partition
- Boot from local disk, second partition
- Run Gparted Live to tweak, fix or diagnose the system
- Run memory test
- Run desktop distro in live mode (with NO auto-install)
- Install (misc OS:s and distros) automatically and completely repartition the drive
- Run installer (misc OS:s and distros) and allow manually installing the OS.

<!-- - TODO: Install on first existing (big enough ?) partition -->

Notes:
- The topmost items in menu are "less dangerous" and more "read-only" to your system. In case you nervously fat finger with your arrow down, you have ~4 menu items before the "extreme makeover" items
- Currently the automated installation "recipe" will/may wipe out your disk. Please review the preseed and kickstart templates before using them to avoid data loss.

# Booting load-in-memory ISO images

Linux Bootloader utility `memdisk` allows to load either raw image or ISO image into memor from where it will boot like from
local CD/DVD drive. This will require at least as much RAM as the size of the image.
Example construct found from on oitibs.com:

```
LABEL myos
MENU LABEL My OS
kernel memdisk
append iso initrd=http://myos.com/myos.iso raw
```
There are also variations that use initrd with URL (leaving out iso or raw from it) and have a separate have `append iso` line
(or even `append iso raw` is possible). For example Windows or BSD variants may need to be booted / chain loaded this way. 
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
This config has been used and proven with `pxelinux.0` over TFTP and with `lpxelinux.0` over HTTP.

### Authoring WinPE ISO Images (winpe.iso)

wimlib toolkit (Deb/Ubu package `libwim15`) has utility `mkwinpeimg` to author WinPE ISO mimages based on Windows install CD/DVD
ISO images.

Example commands for creating an image:

    # Loop mount full MS Windows Install ISO
    sudo mount -o loop /some/place/fullWin10Install.iso /isomnt/win10
    # Use mkwinpeimg utility to extract bare essentials from mounted full ISO to a ~300+MB ISO image
    # Utility places start-script into the root of WIM. 
    mkwinpeimg --iso --windows-dir=/isomnt/win10 --tmp-dir=/tmp/winiso \
        --start-script=/tmp/win-pxe/start.cmd /tmp/winpe.iso

Use alternatively --waik-dir (not --windows-dir) if files are from WAIK/WADK.

References:
- https://wiki.archlinux.org/index.php/Windows_PE
- https://musteresel.github.io/posts/2018/04/install-windows-over-pxe-with-dnsmasq-pxelinux-winpe.html
- en.wikipedia.org/wiki/Windows_Preinstallation_Environment
- The Windows® Automated Installation Kit (AIK) for Windows® 7 https://www.microsoft.com/en-us/download/details.aspx?id=5753 
- http://www.thinkwiki.org/wiki/Windows_PE
- https://ipxe.org/wimboot - wimboot, booting WinPE
- On Windows install ISO, look for support/samples/headlessunattend.xml
- https://docs.microsoft.com/en-us/windows-hardware/manufacture/desktop/windows-setup-automation-overview
- https://docs.microsoft.com/en-us/windows-hardware/manufacture/desktop/update-windows-settings-and-scripts-create-your-own-answer-file-sxs

- https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-xp/bb490954(v=technet.10) Windows Command Shell Overview
https://social.technet.microsoft.com/Forums/office/en-US/df523791-7424-4be7-b468-548bbd0c95ed/discconfiguration-error-0x80042565?forum=w8itproinstall  Windows could not create partition on disk 0. The error occurred while applying the unattend answer file's <DiskConfiguration> setting. Error code: 0x80042565
0x80042565: The specified partition type is not valid for this operation.
https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-8.1-and-8/hh824989(v=win.10)?redirectedfrom=MSDN Adding device drivers
- https://www.linuxjournal.com/magazine/pxe-magic-flexible-network-booting-menus Linux Journal "starter" article (by Kyle Rankin)

Bootloaders, comparisons:
- https://askubuntu.com/questions/651902/what-is-the-difference-between-grub-and-syslinux - Grub vs. syslinux
- https://wiki.archlinux.org/index.php/kernel_parameters - Arch Wiki on Kernel CL params in various bootloaders

Filesystem access and perms

- https://stackoverflow.com/questions/2928738/how-to-grant-permission-to-users-for-a-directory-using-command-line-in-windows
- https://superuser.com/questions/364083/windows-list-files-and-their-permissions-access-in-command-line/364085
- https://www.virtualhelp.me/windows/691-change-access-permissions-in-command-prompt


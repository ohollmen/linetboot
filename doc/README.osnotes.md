# OS PXE Install Notes


## Ubuntu

Ubuntu 18.04 and 20.04 legacy (non-"live") installers suffer from
fully automated install requiring an interactive keypress.

On first boot (after install) Ubuntu 20.04 may show blank console and
may require switching virtual consoles (e.g. ctrl-alt-F1 ...) to get a
login prompt to show up. However host is fully up and running.

## Debian

- Requires separate ISO image and netboot.tar.gz package to be able to "netboot" (PXE boot)
- PXE Capable kernel + ramdisk comes from netboot.tar.gz package
- Debian ISO Image version and netboot.tar.gz version must be
carefully matched (e.g. for the kernel modules to match the kernel)
- Unfortunately the as-distributed netboot.tar.gz file never has
version in it's name (Consider renaming the file to remind of the
version, but as a last resort, refer to file `version.info` in the
root directory of tarball)
- netboot.tar.gz comtains lot of "fluff", but only kernel and ramdisk are needed:
  - debian-installer/amd64/linux - Kernel
  - debian-installer/amd64/initrd.gz - Initial Ramdisk

To have kernel and initrd accessible to bootloader (by http) create a directory (e.g.)
/isomnt/debian10net (Note: this is separate from ISO loop mount path
/isomnt/debian10), where you place the 2 files in following paths
(mirroring original path and file names):
```
sudo mkdir /isomnt/debian10net/debian-installer/amd64/
mkdir /tmp/di && tar -C /tmp/di -zxvf netboot.tar.gz
cp  /tmp/di/debian-installer/amd64/linux  /isomnt/debian10net/debian-installer/amd64/linux
cp  /tmp/di/debian-installer/amd64/initrd.gz /isomnt/debian10net/debian-installer/amd64/initrd.gz
```
The above locations are expected by the default pxelinux menu.

## Redhat / Centos

Info sampled from RH 8.2.
- User root homedir (`/root`) contains anakonda kickstart logs:
  - original-ks.cfg - the original as-is KS file downloaded from `ks=http://...` URL gotten from kernel command line.
  - anaconda-ks.cfg - the filtered / merged-with-defaults KS file (likely) used as final installation recipe

## VMWare ESXi

VMWare ESXI can boot via pxelinux.0, but is very tied to particular
version of pxelinux (unlike other "Operating systems"). ESXi installer
runs ans a bootloader module (named mboot.c32) loaded from TFTP and must
very accurately match the version (of the "loading protocol) of pxelinux.
VMWare says to "Obtain SYSLINUX version 3.86" (released ~ 2010-04-04,
implying availability in some fairly old version of RedHat/Centos).
However the linetboot recommended pxelinux/syslinux (from Ubuntu 18.04) is 6.03.
This discrepancy causes error at the time of loading VMWare customized
mboot.c32.

Source + binaries distribution of syslinux 3.86:
- Release page: https://launchpad.net/syslinux/+milestone/3.86
- Download: https://launchpad.net/syslinux/main/3.86/+download/syslinux-3.86.tar.gz

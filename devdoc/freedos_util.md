# FreeDOS Utility OS

Some legacy utilities only run in DOS/Windows based environments (not in e.g. Wine). The best environment for running these legacy utilities is FreeDOS, except (i.e. what makes it hard):
- Networking in DOS/FreeDOS is difficult
- FreeDOS does not mount USB by default (Needed: USB driver ...)

## Creating Bootable USB with Linux tools

Option to try for readable USB
- Check devices with: lsblk
- Use Linux fdisk
  - to create MBR partition table on USB
  - to create first partition of size <512MB (e.g. 200MB)
- mkdosfs -F 32 /dev/mmcblk0

## Writing freedos image to 
- Write image (FD*.img) to whole device (e.g. /dev/sdc, /dev/mmcblk0), not single partition (e.g. NOT /dev/sdc1, /dev/mmcblk0p1 - note numbers and 'p'  at the end).
- dd if=FD*.img of=/dev/mmcblk0 bs=4M

FreeDOS Image analysis by `file`:

```
file /isomnt/clzilla/live/freedos.img 
/isomnt/clzilla/live/freedos.img: DOS/MBR boot sector, code offset 0x3c+2, OEM-ID "LINUX4.1", root entries 224, sectors 2880 (volumes <=32 MB), sectors/FAT 9, sectors/track 18, serial number 0x44fa7fe3, label: "           ", FAT (12 bit), followed by FAT
```
Found on the USB supporting edition of FreeDOS
C:\packages\drivers\usbdos.zip

## Links
- https://superuser.com/questions/1388931/how-to-install-freedos-onto-a-usb-stick
- FreeDOS Download: https://www.freedos.org/download/
- How to Create a USB Boot Disk Using FreeDOS https://freedos.sourceforge.io/wiki/index.php/USB

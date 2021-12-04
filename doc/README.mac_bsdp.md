# Apple/Mac BSDP (Boot Services Discovery Protocol)

##  Image root directory
- Includes a set of directories ending with ".nbi", each of which
contains single boot target (may have multiple NBP/NBI bootfiles and bootable images).

Each Directory contains: NBImageInfo.plist file with meta info about
boot target and files needed for it (for different boot stages).

## NBImageInfo.plist File (in .nbi directory)

Info from bootpd.8.auto.html, members:
- BootFile - bootfile basename (including suffix) from .nbi dir
- IsEnabled - boolean (e.g. `<true/>`)
- Index - Index number (integer). Higher (4096..50000) values indicat (more?) global
(common) images (taht may appear on multiple servers ?). Lower 1..4095
mean local images
- IsInstall - Is Installable boot target / image
- Name - Displayable name (Shows on Startup Disks)
- SharedImage - Main image (e.g. NetBoot HD.img) ?
- PrivateImage - Addl image (e.g. Applications HD.img) ?
- Type - The type of storage Classic (Val=1, Mac OS 9), HTTP, NFS
(Val=1, Only latter 2 used nowadays)
- RootPath - Alt for \*Image keys, Image basename
- Architectures (array of 1 or more, e.g. i386, ppc). ppc images
should reside in .nbi dir, otheris in arch-named dirs (i386)

For (e.g.) i386 architecture the filenames for files named in .plist should be the
same, but in arch (e.g. i386/) subdirectory and suitable for that architecture.

# References
- Wikipedia BSDP - https://en.wikipedia.org/wiki/Boot_Service_Discovery_Protocol
- 
- https://opensource.apple.com/source/bootp/bootp-237.2/bootpd.tproj/bootpd.8.auto.html
- Apple "System Image Utility" installed on every Mac
  - 2nd page of wizard: Add Configuration Profiles, Packages, and Post-Install Scripts
- https://krypted.com/mac-os-x/edit-netboot-sets-without-creating-new-images/
- Boot files from /Volumes/Recovery/
  - /Volumes/Recovery/2716A96D-8D2B-4F0D-889D-B899DE8CD403/BaseSystem.dmg (zlib compressed data)
  - /Volumes/Recovery/2716A96D-8D2B-4F0D-889D-B899DE8CD403/boot.efi:
PE32+ executable (EFI application) x86-64 (stripped to external PDB), for MS Windows
- Example file: /Volumes/NetBootSP/NetInstall\ OS\ X\ Yosemite.nbi/NBImageInfo.plist (from krypted.com article)
- http://hints.macworld.com/article.php?story=2005050214484646
- http://www.manpagez.com/man/8/bootpd/ - properly HTML formatted bootpd
- Google: BSDP discovery in startup disk (startp disk is the boot
  choice app in "System Preferences")
-
https://opensource.apple.com/source/bootp/bootp-198.1/Documentation/BSDP.doc
(also http works)
- About bless utility - https://serverfault.com/questions/300132/netboot-intel-macs-without-bsdp
  - Ships on basic mac, described (on man) as: set volume bootability and startup disk options 
  -  bless --netboot --server bsdp://255.255.255.255
  - Eliminates broadcast
- Univ. of Camridge Perl BSDP Server - https://www.ch.cam.ac.uk/computing/boot-service-discovery-protocol-daemon


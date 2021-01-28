# Administering and Setting up Boot (ISO) media

## Using ISO Images as boot media

The lineboot basic boot examples have been all successful using
plain (non-modified) ISO image content as content to boot for most distributions.
This means distribtion ISO authors have generally done good job preparing
their ISO:s to be boot media agnostic and PXE bootable. 

What all gets utilized from ISO boot media and what point of boot or install ?

- **OS kernel** and **Initial RAM disk**
  - These get downloaded by *bootloader* (lpxelinux.0)
  - In legacy / traditional model these get downloaded by TFTP
  - In modern / Linetboot way with a HTTP-capable bootloader (e.g. lpxelinux.0, note "l" in front) these get downloaded
    by HTTP (much faster than TFTP)
  - most internet examples insist making a copy of these (e.g. to root of TFTP or HTTP server),
  but Linetboot uses them *directly* from loop-mounted media media
  (with a little bit longer and "deeper" path though) instead of making a FS cluttering copy of them (with many OS:s clutter will
  gradually form).
- OS Install packages
  - These get downloaded by OS Installer, usually by HTTP (Also legacy methods for TFTP, FTP and NFS exist in installers)
  - Linetboot favors hinting (on Kernel CLI) installer to use HTTP always when it can (Sometime fallback on e.g. NFS is necessary
    because of malfunctioning or missing HTTP access)
  - Most OS Distros have a good set (even if not complete set) of packages on ISO image, but some of the "slimmest" distributions
    leave out the packages altogether out from ISO image and fetch packages from internet mirror repos
  - These "slim" distributions are often recognizable by \*net\* or \*mini\* in their name *or* by their ISO size - a 40MB..100MB ISO
    is likely to use internet repos and not contain much packages at all on ISO, and a > 900MB is likely to be "self contained" and
    not use internet repos for install at all (although the models mix too, e.g. for recent updates not contained on ISO).
  - 

Example of distribution that strongly differentiates booting between media is Debian. The ISO image is exclusively
dedicated for booting from DVD or USB and  a separate tar.gz package containing PXE netboot kernel (linux) and initrd (initrd.gz) is needed
to boot:
- netboot.tar.gz package has kernel and initrd (and lot of bootloader and TFTP related files that you don't need with linetboot) to enable
  PXE booting
- The large size (~4GB) ISO is unable to PXE boot, but has all the packages needed for installation
- By combining the 2 you can produce a PXE bootable, linetboot mirrored Debian OS installation setup

## Debian PXE Boot setup

The netboot.tar.gz and ISO must be an exactly matched pair by their minor version (e.g. number "7" in 10.7.0, i.e. 10.4.0 would not be compatible).
Note that the netboot.tar.gz does not have any version info in it's filename and after collecting a few of them you will have hard time telling
rhem apart if you did not track the version. Luckily a file "version.info" in package root dir has a hint of major and minor versions.
However it's best to label the file with version by renaming it (See below).

The steps to carry out installation are:
```
# Download netboot.tar.gz package (e.g. Debian 10.7.0)
wget http://.../netboot.tar.gz -O netboot-debian-10.7.0.tar.gz
# And make the kernel and initrd available for PXE booting
mkdir /isomnt/debian10netboot
cp netboot-debian-10.7.0.tar.gz /isomnt/debian10netboot
cd /isomnt/debian10netboot
# Unpackage - creates subdir debian-installer/
sudo tar zxvf netboot-debian-10.7.0.tar.gz
# Use paths debian-installer/amd64/linux and debian-installer/amd64/initrd.gz in pxelinux menu kernel and initrd respectively
```
Download ISO containing the packages used during install:
```
# Download matching ISO (If you do the download ISO from same Debian ISO mirror as netboot.tar.gz at one point in time, they should be matched).
# Keep name as-is. ISO names are well thought out (unlike netboot.tar.gz)
wget http://.../debian-10.7.0-amd64-DVD-1.iso
# Create a mountpoint dir for ISO and loop mount it
mkdir /isomnt/debian10
sudo mount -o loop debian-10.7.0-amd64-DVD-1.iso /isomnt/debian10

```

## Downloading ISO Images

The linetboot example setup uses a single directory (`/usr/local/iso`) for storing the ISO images.
All images are mounted from this "ISO image repo". It's recommended that you use the original
names of the downloaded images as these tend to be very unique, descriptive and distinctive.

Creating and setting up an ISO image repo directory (e.g):

    # Create central ISO image repo (Use better name like os_iso as needed)
    cd /usr/local
    # Create repo dir
    sudo mkdir iso
    # Facilitate write access to a non-root (service) account
    sudo chown myacct:myacct iso
    # cd for further downloads ... (see below)
    cd iso

Example ISO image download (for Ubuntu 18.04 server):

    # Download by wget or curl
    wget http://cdimage.ubuntu.com/releases/18.04.1/release/ubuntu-18.04.1-server-amd64.iso
    #  For good habit, check MD5 (or SHA...) against checksum (typically) given at download site.
    md5sum ubuntu-18.04.1-server-amd64.iso

## Creating ISO Image mount dirs

Most of the Linux ISO distro images used by linetboot can be mounted with linux loop-mount method, after
which image content appears as directory tree under the mountpoint. All you need for booting by PXE will be there.

The lineboot default (conventional) top mount directory is /isomnt/. Under this directory reside the mountpoint
subdirectories.

Choose descriptive names for the mountpoints. For systematic approach match the name labels used as /isomnt subdir names:
- in `?osid=...` lable passed in recipe (kickstart, preseed) parameter on kernel command line.
- Additionally/optionally you could reflect the same names in boot menu "menu label ..." lines

For examples on default out-of-box directory labeling conventions see the `tmpl/default.installer.menu.mustache`.

The linetboot example setup uses top mount directory `/isomnt/`. Creating it and the
individual distro directories will be one of the rare root user operations needed in administering linetboot:

    # Create top dir
    sudo mkdir /isomnt/
    # Per below 3-disto mounting example
    sudo mkdir /isomnt/ubuntu18/ /isomnt/centos7/  /isomnt/gparted

## Mounting ISO Images

Mount images with super user privileges:
```
# For ease of typing, first cd to /usr/local/iso/
# For explicit demo of what mounts where, paths are fully shown
sudo mount -o loop /usr/local/iso/ubuntu-18.04.1-server-amd64.iso   /isomnt/ubuntu18
sudo mount -o loop /usr/local/iso/CentOS-7-x86_64-Minimal-1810.iso  /isomnt/centos7
sudo mount -o loop /usr/local/iso/gparted-live-0.31.0-1-amd64.iso   /isomnt/gparted
```

You can make these mounts permanent in /etc/fstab as needed (to re-establish them after reboot).
The corresponding /etc/fstab entries for above mounts would be (to allow mounts to persist over a boot):
```
/usr/local/iso/ubuntu-18.04.1-server-amd64.iso      /isomnt/ubuntu18 iso9660 loop 0 0
/usr/local/iso/CentOS-7-x86_64-Minimal-1810.iso     /isomnt/centos7  iso9660 loop 0 0
loop /usr/local/iso/gparted-live-0.31.0-1-amd64.iso /isomnt/gparted  iso9660 loop 0 0

```
If you already mounted images manually, Linetboot allows you to auto-reverse engineer and generate
either mount commands or /etc/fstab mount lines to loopmount the ISO media:

```
# By default as /etc/fstab lines ... 
./linetadm.js loopmounts
# As commands (You could paste output to bash script if you wanted to avoid modifying /etc/fstab)
./linetadm.js loopmounts --cmds

```

Linux kernel always mounts ISO images with loop mount read-only and immutable making boot process
predictable and repeatable.
With loop-mount method you never copy the thousands of file contained in a ISO image to
your existing file systems. On the other hand if the very distro and it's version was authored
in PXE boot un-friendly way (with bugs and malfunctions) you might need to copy the files on image to
a path location and alter them. Linetboot is completely fine with this, even if out-of-box boot
examples/options use loopmount method.

The loop mount on BSD UNIX is said to use combination of `mdconfig` and `mount` commands. In MacOS
`hdiutil attach ...` facilitates eqivalent of Linuxloop mounts.

After loop-back mounting you should make sure all the bootable distros will be available to linetboot
via HTTP for the http server configured as "httpserver" in lineboot main config.

## Media Files HTTP Delivery

Note that with linetboot all boot (kernel,ramdisk) and OS Install package files (from mounted ISO images) are fetched
via HTTP, **not** TFTP. Lineboot itself is a HTTP server that delivers all that content.
Setup your linetboot server "core.maindocroot" to refer to the ISO mount path (e.g. "/isomnt/")

## Hints on boot name labels

Boot label names length and complexity is up to your usage. If you only install servers (or only desktops)
and you have standardized on OS 32/64 bitness (e.g. never 32 bit again), short labels, such
as "ubuntu18", "centos7" may suffice.

If on the other hand you allow booting different bitnesses (32/64) plus server and desktop versions
of your (example) ubuntu variants, your naming convention needs to grow in length and detail (e.g.):

    ubuntu-18-i386-serv  # 32 bit Server
    ubuntu-18-amd64-serv # 64 bit Server
    ubuntu-18-i386-dt    # 32 bit Desktop
    ubuntu-18-amd64-dt   # 64 bit Desktop

If you can foresee yourself going to wide selection, go with granular long names from the start.

## Updating servers from Dell DTK ISO:s

Dell DTK (Dell Deployment Toolkit) ISO:s are available from (e.g.):
https://www.dell.com/support/article/en-us/sln296511/update-poweredge-servers-with-platform-specific-bootable-iso?lang=en

From model-name links navigate to download page, copy lik address and download to your Linetboot ISO images storage directory.
Mount to /isomnt/ dir as loop device (just like other ISO images, e.g.):

    mount -o loop /usr/local/iso/PER640_BOOTABLE_20.07.00.153.iso /isomnt/dell_r640 

These DTK images hard to get fully booting over PXE despite well written (old, 2006)
Dell whitepaper (https://www.dell.com/downloads/global/power/ps1q06-20050170-gujarathi-oe.pdf,
the problem is OS boots up, but network interface is missing !).

However you can use the images to update firmware by mounting them to remote servers.
Run NFS server and add/export NFS share on your lineboot host by /etc/exports (e.g.):

    /isomnt/dell_m640 *(ro)
    /isomnt/dell_r640 *(ro)

This should enable you to mount the DTK update media on your servers and access the firmware update
directory to make an update (e.g. BMI/iDRAC update here in example):

    # Mount !
    sudo mount lineboot.mycomp.com:/isomnt/dell_r640 /mnt
    # Get to firmware update dir
    cd /mnt/repository/
    # Run Posix shell archive updater (See opts -q, -n)
    ./iDRAC-with-Lifecycle-Controller_Firmware_369M3_LN_4.20.20.20_A00.BIN -q -n

Note: Some of the different DTK CD:s for different models (e.g. M640, R640) share the same update binaries
for the different models. To stay on the safe side, Mount and use particular ISO image for *your* model
(and check the MD5 sum for the different update binaries to detect "sameness" of images).

Ther possible ways to update firmware: The Dell racadm utility: https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=rdcvd and http://nick.txtcc.com/index.php/linux/1732 (Not discussed in detail here).

Also Dell page ...https://www.dell.com/community/PowerEdge-Hardware-General/DRAC4-Reset/td-p/3910153 hints on small CentOS OMSA live distro available at: http://linux.dell.com/files/openmanage-contributions/omsa-65-live/OMSA65-CentOS6-x86_64-LiveDVD.iso

Note: For the Update from shell to work the "iDRAC Settings" => "Local Configuration" Settings "Disable iDRAC Local Configuration using Settings" and 
"Disable iDRAC Local Configuration using RACADM" must be set to "Disabled".

### Why run the BMI Update ?

RedFish is a fairly recent technology (~2015) and many iplementations are still in flux in regards to sane support for features. Example of this is automated boot request with JSON message:

     {"ResetType": "GracefulRestart", "BootSourceOverrideTarget": "Pxe"}
     
Where - for unattended, automated boot operation - the ResetType type should be "GracefulRestart" or "Powercycle" for a smooth warm/cold restart, but both options seem to be missing or malfunctioning for some firmware version
(Reset Type Options "ForceRestart" - does not accept or honor "Pxe" option, "On" is only applicable when device is Off, "GracefulShutdown" will not restart, but keeps machine off, "PushPowerButton" (also) shuts off).

<!--
As an example of this on Dell M640 server the list 
    4.10.10.10: On,ForceOff,ForceRestart,GracefulShutdown,PushPowerButton,Nmi,PowerCycle
                None,Pxe,Floppy,Cd,Hdd,BiosSetup,Utilities,UefiTarget,SDCard,UefiHttp
    4.20.20.20: On,ForceOff,ForceRestart,GracefulShutdown,PushPowerButton,Nmi,PowerCycle
                None,Pxe,Floppy,Cd,Hdd,BiosSetup,Utilities,UefiTarget,SDCard,UefiHttp
-->

# References

Windows boot:

- https://ipxe.org/howto/winpe - Network-booting Windows PE using iPXE
- https://www.microsoft.com/en-us/download/details.aspx?id=30652 - Windows Assessment and Deployment Kit (ADK) for Windows 8

ISO Media sources:

- http://linux.darkpenguin.net/distros/ubuntu-unity/ubuntu-web/20.04.1/ - Ubuntu Web Remix
  - Background for Ubuntu Web Remix: https://discourse.ubuntu.com/t/ubuntu-web-remix/19394

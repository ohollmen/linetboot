# Administering Boot (ISO) media

## Using ISO Images as boot media

The lineboot basic boot examples have been all successful using
plain (non-modified) ISO image content as content to boot.
This means distribtion ISO authors have generally done good job preparing
their ISO:s to be PXE bootable. 

## Downloading ISO Images

The linetboot example setup uses a single directory (/usr/local/iso) for storing the ISO images.
All images are mounted from this "ISO image repo". It's recommended that you use the original
names of the downloaded images as these tend to be very unique, descriptive and distinctive.

Creating and setting up an ISO image repo directory (e.g):

    # Create central ISO image repo (Use better name like os_iso as needed)
    cd /usr/local
    # Create repo dir
    sudo mkdir iso
    # Facilitate write access to a non-root (service) account
    sudo chown myacct:myacct iso
    # cd for further downloads ... (see bgelow)
    cd iso

Example download:

    # Download by wget or curl
    wget http://cdimage.ubuntu.com/releases/18.04.1/release/ubuntu-18.04.1-server-amd64.iso
    #  For good habit, check MD5 (or SHA...) against checksum given at download site.
    md5sum ubuntu-18.04.1-server-amd64.iso

## Creating ISO Image mount dirs

All the images used by linetboot can be mounted
with linux loop-mount method where image looks like file tree under the
mountpoint.

Choose short but descriprive labels on the mounpoints. For systematic approach,
these same names may be refleced in the pxelinux boot menu "menu label ..." lines.

    /isomnt/
      ubuntu18/ (mount -o loop ...) -> /usr/local/iso/ubuntu-14.04.5-server-amd64.iso
      centos7/  (mount -o loop ...) -> /usr/local/iso/CentOS-7-x86_64-Minimal-1810.iso
      gparted/  (mount -o loop ...) -> /usr/local/iso/gparted-live-0.31.0-1-amd64.iso

You can make these mounts permanent in /etc/fstab as needed (to re-establish them after reboot).

The linetboot example setup uses a single top mount directory /isomnt/. Creating it and the
individual distro directories will be one of the rare root user operations needed:

    # Create top dir
    sudo mkdir /isomnt/
    # Per below 3-disto mounting example
    sudo mkdir /isomnt/ubuntu18/ /isomnt/centos7/  /isomnt/gparted

## Mounting ISO Images

Mount images with super user privileges:

    # For ease of typing, you could first cd to /usr/local/iso/
    # For explicit demo of what mounts where, paths are shown
    sudo mount -o loop /usr/local/iso/ubuntu-18.04.1-server-amd64.iso   /isomnt/ubuntu18
    sudo mount -o loop /usr/local/iso/CentOS-7-x86_64-Minimal-1810.iso  /isomnt/centos7
    sudo mount -o loop /usr/local/iso/gparted-live-0.31.0-1-amd64.iso   /isomnt/gparted

Linux kernel always mounts ISO images with loop mount read-only and immutable making boot process
predictable and repeatable.
With loop-mount method you never copy the thousands of file contained in a ISO image to
your existing file systems. On the other hand if the very distro and it's version was authored
in PXE boot un-friendly way (with bugs and malfunctions) you might need to copy the files on image to
a path location and alter them.

The loop mount on BSD UNIX is said to use combination of `mdconfig` and `mount` commands. In MacOS
`hdiutil attach ...` facilitates eqivalent of Linuxloop mounts.

After loop-back mounting you should make sure all the bootable distros will be available to linetboot
via HTTP for the http server configured as "httpserver" in lineboot main config.

## HTTP delivery

Note that with linetboot all boot and package files (from mounted ISO images) are fetched via HTTP, **not** TFTP.
Setup your linetboot server "maindocroot" to refer to the ISO mount path (e.g. "/isomnt/")

## Hints on boot name labels

Boot label names lenght and complexity is up to your usage. If you only install servers (or only desktops)
and you have standardized on OS 32/64 bitness (e.g. never 32 bit again), short labels, such
as "ubuntu18", "centos7" may suffice.

If on the other hand you allow booting different bitnesses (32/64) plus server and desktop versions
of your (example) ubuntu variants, your naming convention needs to grow in length and detail (e.g.):

    ubuntu-18-i386-serv  # 32 bit Server
    ubuntu-18-amd64-serv # 64 bit Server
    ubuntu-18-i386-dt    # 32 bit Desktop
    ubuntu-18-amd64-dt   # 64 bit Desktop

If you can foresee yourself going to wide selection, got with granular long names from the start.

## Updating servers from Dell DTK ISO:s

Dell DTK (Dell Deployment Toolkit) ISO:s are available from (e.g.):
https://www.dell.com/support/article/en-us/sln296511/update-poweredge-servers-with-platform-specific-bootable-iso?lang=en

From model-name links navigate to download page, copy lik address and download to your Linetboot ISO images storage directory. Mount to /isomnt/ dir as loop device (just like other ISO images, e.g.):

    mount -o loop /usr/local/iso/PER640_BOOTABLE_20.07.00.153.iso /isomnt/dell_r640 

These DTK images hard to get fully booting over PXE despite well written (old, 2006) Dell whitepaper (https://www.dell.com/downloads/global/power/ps1q06-20050170-gujarathi-oe.pdf, the problem is OS boots up, but network interface is missing !).

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

### Why run the BMI Update

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

- https://ipxe.org/howto/winpe - Network-booting Windows PE using iPXE
- https://www.microsoft.com/en-us/download/details.aspx?id=30652 - Windows Assessment and Deployment Kit (ADK) for Windows 8

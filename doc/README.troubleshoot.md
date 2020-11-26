
# Debugging and Troubleshooting

## Linux OS installer on Install client host

General hints on troubleshooting installation on various distributions.

### Ubuntu (18.04)
- Ubuntu installer virtual console #4
  - Early install /var/lib/cdebconf/
  - Installer runtime (ramdisk?) /var/log/syslog (Only "more" pager is avail during install, also use tail -n 200 ...)
  - Some (lesser) logs in /target (install dest target, gets created and mounted only later in install)
- See also: /target/var/log/installer (after install var/log/installer)
- Preseed: ...
- Set `priority=medium` on Kernel CL to see the menu items iterated (and surprisingly also some install
  questions, (e.g. regarding VLAN trunk port, auto config networking), pop up) during install
- Set Kernel CL DEBCONF_DEBUG=5 to see increase in syslog verbosity
- Networking bring-up stage flow and hints:
  - in `/var/log/syslog`, look for line `attempting IPv4 autoconfig`
  - "autoconfig" stage relates to preseed vars netcfg/use_autoconfig and netcfg/disable_autoconfig
  - netcfg should run dhclient (syslog: "Started DHCP Client")
  - after that, following netcfg[...] lines show the discovered DHCP info in /etc/resolv.conf (written by dhclinet)
    gets written by DHCP request info to correct value (e.g. 192.168.1.95) from DHCP (See how this changes to 127.0.0.1 later)
    - syslog: netcfg acks this by "Reading nameservers from /etc/resolv.conf" and (e.g.) "Read nameserver 192.168.1.95".
    - Most native log of DHCP info: /var/lib/dhcp/dhclient.leases
  - Writes also netplan /etc/netplan/01-netcfg.yaml at that time, but contents are set for dhcp4 (not static, but interface
    detected by auto is correct)
  - /etc/hostname is set, /etc/hosts does not have static ip addr. Local and global DNS works (!) at this point
  - After successful early commands run /etc/netplan/01-netcfg.yaml shows static net config info (!) 
    - Interface name, IP, netmask, OK (Also /etc/hosts IP matches), nameserv shows as 127.0.0.53 (/etc/resolv.conf matches),
      local and global DNS lookup start to fail
  - Followed immediately by "Loading additional components" (before that there was a checkbox select menu of udeb pkgs.
    These are low level installation geared components)
  - nslookup fails on security.ubuntu.com (when trying to look up additional comps/pkgs for install ?)

See also /etc/NetworkManager/system-connections/Wired\ connection\ 1

### Ubuntu 20.04
Any completed install creates:
- installer log: /var/log/installer/autoinstall-user-data
- cloud-config log (used at first boot): /target/var/lib/cloud/seed/nocloud-net/user-data
- watch files in: /target/var/lib/cloud/seed/nocloud-net

### Centos (6, 7)

- CentOS installer virtual console #3 (filesystems),#4 (networking),#5 (other, all excellent sources of detailed information)
- CentOS installer leaves
  - Anakonda says: Installation log files are stored in /tmp during the installation
  - anakonda-ks.cfg (Installer modified Kickstart w. packages added, commands resequenced, recommented etc.) and original-ks.cfg (your original KS as it came from server, verbatim) to homedir of root user (/root on root partition)
  - Various RedHat/CentOS anakonda installer in /var/log/anakonda (Or early on in /tmp/ ?)
    - ifcfg.log - Network config (Interesting python dump snippets for if configs, under label "all settings")
    - packaging.log - Info about YUM repos, mirrors and packages (will be 0 size early on, until packages start getting installed,
      or 0 size may indicate mirror problem ?)
    - storage.log - Info about disk controlled, disk devices, partitions (partitioning flow has python log messages)
    - journal.log - Full Log (like dmesg/syslog/message, including DHCP traffic, Starting Anaconda)
    - syslog, anaconda.log, program.log,ks-script-*.log
  - Centos says: `Parsing kickstart: /run/install/ks.cfg` (Check if this is indended ks.cfg and looks right)
  - Misc in /tmp:
    - anakonda.log
    - storage.log (FS module loading)
    - program.log misc programs / command logging (e.g. %pre command logging)
    - ifcfg.log (Network Interfaces config)
    - sensitive-info.log (0-size ealry on))
- After (failed) boot, check /proc/cmdline (Linux kernel commandline) for match with menu ("default") specified command line (sanity check) -
    if there is a mismatch, you possibly forgot to copy/sync the latest menu changes to TFTP server.

### Misc installer errors

- Centos 7 (after `%pre` stage, written to /tmp/storage.log): `ERR blivet: Could not load kernel module xfs` (w/o xfs appearing in ks.cfg).
  Also in same event (on Anakonda UI): `Pane is dead`
  - Speculation on problem: https://bugs.centos.org/view.php?id=16640

- Windows: Windows could not create partition on disk 0.
  The error occurred while applying unattend answer file's <DiskConfiguration> setting. Error code 0x80042565
  - https://social.technet.microsoft.com/Forums/windows/en-US/f5b06914-552a-47db-a52c-cdc646dcb215/windows-could-not-create-a-partition-on-disk-0-the-error-occurred-while-applying-the-unattended?forum=w7itproinstall

- Centos 7: messages for XFS default filesystem
  - console 1:main : "ValueError: new value non-existent xfs filesystem is not valid as default fs type"
  - console 2:shell: "blivet: invalid default fstype: XFS instance (0x....) object id 2--" (See also /tmp/storage.log)
  - xfs is not requested, modprobe xfs fails per /tmp/program.log (modprobe xfs ... Return code: 1)
  - CLI:"... method=http://mirror.centos.org/centos/7/os/x86_64/ ..." file layout looks like top of /isomnt/centos7
  - Various articles state reason as mixed media
  - Change orig method=... to http://10.85.233.180:3000/centos7/
  - In installer env: /etc/redhat-release: CentOS Linux release 7.9.2009 (Core) when booted with mirror.centos.org
  - /isomnt/centos7/CentOS_BuildTag: 20200420-1800
  - Changing kernel CLI to use ISO as mirror helps (method=http://{{ httpserver }}/centos7/)
  - https://serverfault.com/questions/910020/error-xfs-filesystem-is-not-valid-as-a-default-fs-type

#### Centos 8/RH8: `%post --nobase` discontinued.

- Do not use in (any) ks.cfg content. Solution: just leave out package set `@Base` or state '-@Base' (Shows in /var/log/anaconda/packaging.log
  as: 18:47:53,415 DBG packaging: excluding group Base').
- File also explain from what group packages are coming from (e.g.  "Adding packages from group 'core':
  {<libcomps.Package object 'iwl5150-firmware', ...")
- Testing by: yum install '@Base' *does* install 133 packages.
- Note also (form same log): "INF dnf: You can remove cached packages by executing 'dnf clean packages'."

#### RH8 problems about authconfig missing

- Add package authconfig (authselect,authselect-compat) in %package section

#### Centos 8 Networking does not come up
- networking does not come up at boot
- /etc/sysconfig/network has NISDOMAIN=.. (only)
- Install with KS `network --device=$MACADDR` and /etc/sysconfig/network-scripts/ifcfg-eno1 looks good (including
  ONBOOT=yes, BOOTPROTO=static) and *merely* issuing `systemctl start network` brings interface up !
- Centos 8 (installer) adds TYPE=Ethernet to (e.g.) ifcfg-eno1 (compared to Centos 7)
- chkconfig (Pre systemd config) Shows ony item 'network' with 'off' on all runlevels (1..6)

Output of chkconfig (Seems this is related to installed )
```
# Centos 8 (Only has network, all "off")
network        	0:off	1:off	2:off	3:off	4:off	5:off	6:off
# Centos 7 (with same install settings)
netconsole     	0:off	1:off	2:off	3:off	4:off	5:off	6:off
network        	0:off	1:off	2:on	3:on	4:on	5:on	6:off
```
- `systemctl start network` brings up network inteface
- When issuing `sudo systemctl status network` Centos 8 warns about `network-scripts` (legacy package and respective functionality,
Centos 7 does not do this).
- Reboot after no persistent change: problem repeats, no interface, but `systemctl start network` brings network up
- Reboot after setting 'systemctl enable network' - Network fully works

Solution: run `systemctl enable network` in %post scripts

### Centos troubleshooting commands

```
ip addr show
chkconfig
systemctl list-unit-files | grep network
cat /etc/sysconfig/network
# NIS
cat /etc/yp.conf
grep NISDOMAIN /etc/sysconfig/network
```
 
#### Ubuntu 18: On screen "Configuring apt" (25% - Retrieveing file 1 of 3)
  - Last file requested (404): /ubuntu18/dists/bionic/InRelease, Misc downloads from (ISO dir): dists/bionic/main/
  - Last packages retreieved (from last to earlier): usbutils, libc-bin, libusb-1.0.0, pciutils, libpci3
  - Before freeze logged: Menu item 'apt-setup-udeb' selected
  - Running process (hangs?): udpkg --configure --force-configure apt-setup-udeb ... (~10 lines of params)
  - After unlocking jam: problems resolving security.ubuntu.com (lack of DNS. After Initial DHCP DNS is ok. After kill-all-dhcp DNS
    resolution fails). This is before 'pkgsel' (by log)
  - After unlocking jam: 'pkgsel' (Said to be "Select and Install additional packages", on screen; "Select and Install software")
  
  - Hint: Installer stages documentation: https://d-i.debian.org/doc/internals/ch02.html
  - As track of stages check: grep 'INFO: Menu item' /var/log/installer/syslog
    - netcfg /etc/hosts, /etc/netplan/01*
    - /etc/fstab and completion of partitioning
    - /boot/ and install of kernels, etc ...
    - /etc/passwd and initialuser
    - /etc/apt.sources.list (e.g. 51 l.)
  - TODO: Enable on kernel command line: install debconf/priority=medium (try: priority=medium)
  - Use in-target to check packages (e.g. 222 pkgs at the time of jam, consider sending ...)
  - Also see /var/log/installer (During install: /target/...)

##### Analysis

The network gets configured static but the preseeded nameservers are not in /etc/netplan/01-netcfg.yaml.
Log says: Reading nameservers from /etc/resolv.conf, seems preseeded netcfg/* settings are not used at all (maybe netcfg/disable_dhcp
affects this ?) - seesm DHCP originated info is used for all. This is found in cdebconf/questions.dat (nameservers coerced to systemd
value and original value found nowhere, at the time netcfg/disable_dhcp = false)
```
Name: netcfg/confirm_static
Template: netcfg/confirm_static
Value: true
Owners: d-i
Flags: seen
Variables:
 interface = enp9s0
 ipaddress = 192.168.1.99
 pointopoint = <none>
 netmask = 255.255.255.0
 gateway = 192.168.1.1
 nameservers = 127.0.0.53

```
Preseed: d-i netcfg/get_nameservers string 192.168.1.107, questions.dat: "Template: netcfg/get_nameservers\nValue: 127.0.0.53".

When Kernel CLI DEBCONF_DEBUG=5 shows at the time of jam, the "debconf" installer is polling in a loop with "PROGRESS SET 300"
and debconf-apt-progress/info description echoing on screen "Retrieving file 1 of 3"

DEBCONF_DEBUG=developer (https://bugs.launchpad.net/ubuntu/+source/debconf/+bug/62986)

Suggestions: Try disable_dhcp = true/false, eliminating kill-all-dhcp (from orig.: "kill-all-dhcp; netcfg").

NOT Proven with semi-manual install: If machine has access to DNS after "APT setup" (e.g. security.ubuntu.com), the install does not
"jam" in the place described.

Remove /target/etc/mtab (symlink to /proc/self/mounts, size 0) as
- 1) "won't be updated since it's a symlink."
- 2) symlink could not be followed outside chroot/in-target (reason for above message) 

Focus on every "apt-setp/*" directive to see if those are able unjam (also "seen" variants. See also tasksel, e.g tasksel/tasks)

When syslog verbosity is adjusted up (e.g. kernel CLI ...) Look for pattern "<-- 10" in log, faulty directives, usually
followed by "... doesn't exist"

Other (grep) patterns: 'Menu item' 'Adding \[ID\]'

"Configuring apt" maps to apt-setup/progress/title
"Retrieving file ..." maps to
- In syslog: debconf-apt-progress/info description Retrieving file 1 of 3

- Lats message in ...log (after jam): Processing triggers for initramfs-tools (0.130ubuntu.3)

- /debconf-1.5.42/debconf-apt-progress: https://searchcode.com/codesearch/view/21701039/

## Installation sequence and minor differences Debian vs. Ubuntu 18

```
Debian          Ubuntu18
-------------------------------------
localechooser   LATER
---             brltty-udeb
ethdetect       ethdetect
netcfg          netcfg               | "Started DHCP client"
network-preseed network-preseed      | Load preseed
EARLIER         localechooser
---             console-setup-udeb   | setupcon: gzip is not accessible (very Short)
choose-mirror   choose-mirror
download-installer download-installer | anna (apt-like...) in use, downloads live-installer

---             driver-injection-disk-detect
---             user-setup-udeb       | few lines - does not do anything (see finish-install) ?
clock-setup     clock-setup
......................................
---             disk-detect
partman         partman-base         | creates filesystems, mounts FS at the end
base-installer  live-installer       | FS packages, initramfs, kernel, modules (~ l. 1200/8000)
user-setup      ---
apt-setup       apt-setup-udeb       | APT setup (sources.list, ~ l. 5300, JAM after start of this) FREEZE!
pkgsel          pkgsel               | Select and install additional packages (tasksel)
grub/lilo-installer  grub-installer
finish-install  finish-install       | Ubuntu runs user setup here, postcmd
```
### Ubuntu Debian-installer "Partition disks" 

Error message (on second install round where also the first install succeeded):
```
        Failed to partition the selected disk
This probably hapened because the selected disk or free space is too
small to be automatically partitioned.
```
Problem is (likely) with heuristic d-i recipe setting `d-i partman-auto/init_automatically_partition select biggest_free`, which tries
to find a free disk and partition to install OS to. Because earlier install succeeded and occupied whole disk, there will be
no unallocated space per this setting. Solution: do not use `nit_automatically_partition ... select biggest_free`.

### Ubuntu post scripts apt-package installations

Example: Package configuration ... Configuring nis ... Please choose the NIS "domainname" for this system.
If you want this machine to just be a client, you should enter the NIS domain you wish to join....
enter a new NIS "domainname" or the name of an existing NIS domain (also a lot of control chars appears on screen). 

Solution: Add "-yq" (aut-yes, quiet) and env. setting DEBIAN_FRONTEND=noninteractive
```
DEBIAN_FRONTEND=noninteractive apt-get -yq install ...
```

## Testing DHCP Client

- Real (ISC) DHCP Client: /sbin/dhclient (-v = verbose, -x Stop the running DHCP client without releasing the current lease.)
- dhcping - Not sure how this works (`sudo dhcping -s 192.168.1.107` reponds: "no answer")
- `sudo dhcpdump -i eno1` - Only dumps traffic, attaches to an interface (utilizes tcpdump). Run `sudo dhclient` to monitor traffic (requests and responses). Must use separate terminals (e.g. virtual consoles) starting with boot, device detection, etc.

## Testing DHCP Server

To run dnsmasq on the forground and see very detailed and verbose DHCP request details (fields request and returned, their values, etc.), use `dnsmasq -d`.

See man pages on other DHCP servers to see equivalent debugging methods.

## TFTP Server

Follow TFTP Server log for filenames. Many TFTP servers log into OS syslog file (Debian: /var/log/syslog, RH: /var/log/messages)

Problem: `tftpd: read: Connection refused` - after request for a valid file the network seems to blocked by firewall (?). This seems to happen when there is a rapid progression of trying different (non-existing) pxelinux menu files from server. Solution is to create a symlink by ethernet address (with correct convention) to the menu file "default" in subdir "pxelinux.cfg".

TODO: Find out how to increase tftp server message verbosity.

## Web server file delivery

Express static files delivery module "static" is not great about allowing intercept the success of static file delivery.
Enable Apache static file delivery (assuming typical Apache port 80) by changing original "httpserver" value  `"192.168.1.141:3000"`
to `"192.168.1.141"`. This way the dynamic files (preseed.cfg and ks.cfg) will still be delivered by net boot install system.

## PXE Client Error messages (Non-PXE Linux)

The problem with PXE Boot error messages are that they remain on screen for a very short time.

- `PXE-E53: No boot filename received` - DHCP config option "filename" was not gotten in DHCP offer (response for discovery).
  The lineboot compatible value for this is "lpxelinux.0". Check your DHCP Configuration.
- `Failed to load COM32 file ....c32` - PXELinux module (*.c32) defined in menu was not found on tftp server path relative to root  or a path relative to "path" directive (also found in menu). Follow TFTP server log to see what files were being tried. You likely forgot to place the *.c32 modules onto your TFTP server.
- PXE-T01 File Not Found, PXE-E38 TFTP Error - Filename was given in response from by DHCP Server, but file by that name was not found on the TFTP Server
  - PXE-E38 - TFTP cannot open connection


- PXE-E51: No DHCP or Proxy Offers were received. PXE-M0F ...
- ... Media Test failure, check cable Your PXE ROM Configuration likely asks to PXE boot from wrong Network Interface port, which has not cable connected. 
- PXE-T01: File not nound PXE-E3B: TFTP Error - File Not found PXE-M0F Exiting ... Your PXE Implementation already tried to load a file by name which it does not display to you to challenge your debugging skills. Got to the log of your TFTP server and see what filename was tried. Example real life case: file requested was pxelinux.0, should be lpxelinux.0.
- PXE-E16: No offer received (AMI Bios machine on ...)

- PXE-E11 - ARP Timeout (Lenovo Z580 Laptop, on-n-off). Serverfault.com suggests bad network switch as origin of problem. It could also be single bad port on switch.
- PXE-E18 Server Response Timeout

# Bootloader Errors (various stages after Firmware PXE)

## PXELinux

- Failed to load ldlinux.c32 - same/similar as above on QLogic PXE Firmware
- `Unable to locate configuration file` ... Boot failed - PXE Linux is not finding its configuration file in TFTP directory pxelinux.cfg/ more particularly:
  - default file pxelinux.cfg/default
  - One of the may files in same subdirectory identified or named by client unique id (e.g. 44454c4c-5900-1046-804c-b1c04f4b4232), dash separated MAC address (e.g. 01-28-f1-0e-5d-61-af), 
Hexadecimal IP address (.e.g 0A55E80B), or truncated variants of Hex IP Address (with one digit dropped from tail at the time)
  - Place boot menu file by name pxelinux.cfg/default in correct format on the TFTP server.
- Unable to locate configuration file
  - Check TFTP server log to see which file was tried to be loaded.
  - Usually many files are tried by various names (See pxelinux config file
    name rules)
  - RedHat firewall heuristics may refuse tftp traffic after too may rapid tries
  - Solution: Create symlink by one of the first tried filenames (e.g. MAC address with octets dash-separated).

## BSD "pxeboot"

pxeboot chain-loaded by pxechn.c32.
Bootloader crashes after "FreeBSD/x86 bootsrap loader, Revision 1.1". More complete output:
```
pxechn.c32: Attempting to load 'initrd=::pxeboot': loaded

...Ready to boot:
  Attempting to boot...
  Booting...
  PXE Loader 1.00
  
  Building the boot loader argumets
  Relocating the loader and the BTX
  Starting the BTX loader
  
  BTX loader 1.00 BTX version is 1.02
  Consoles: internal video/keyboard
  BIOS drive C: is disk0
  
  PXE versopn 2.1, real mode entry point @9a22:00d6
  BIOS 636kB/2094442kB available memory
  
  FreeBSD/x86 bootsrap loader, Revision 1.1
  
```

## Syslinux chainloader: pxechn.c32

Message: `Cannot load pxechn.c32` - every bootloader (lpxelinux.0, efi*/syslinux.efi) needs to have its own (different) binary
for chainloading (however by same filename).

Problems in chainload process network communication:
```
pxechn.c32: ERROR Unable to retrieve first packet
Could not unpack packet
USAGE:
    pxechn.c32 [OPTIONS]  ....
```

Hints for solution - see *which* pxechn.c32 (out of many, /pxechn.c32, /efi32/pxechn.c32, /efi64/pxechn.c32) got loaded
and if it is compatible with current bootloader. But here it seems to already run (no problems loading the module).


## PXELinux errors

Errors are recognizable by *not* having the `PXE-E...` prefix.
- Unable to locate configuration file: pxelinux.0 or syslinux.efi was loaded, but the menu file was not there.
- No DEFAULT or UI configuration directive found: Config was found but
- ...failed: No such file or directory (After selecting menu item) - Likely means you are using non-http capable pxelinux or syslinux and filename was given as HTTP URL. This error message is very misleading and there will be no trace of
failed load in either TFTP or HTTP logs.

### Memdisk errors

Error `MEMDISK: No ramdisk image specified` may mean that you need user pxelinux `append` line without initrd=http://... or forgot
the "dedicated" `inird` line (with *no* options). Either one needs to be there.

# Linux boot (early stage)

## Dell DTK ISO Boot Errors

dracut-initqueue[738]: Warning: dracut-initqueue timeout - starting timeout scripts

## EFI Boot on Dell

- Enabling secure boot seems to obscure NBP filename (only indicating "NBP file downloaded successfully"), normally
  NBP file name (with TFTP path) and filesize (!) are displayed.
- UEFI0073: Unable to boot PXE Device 1: Integrated NIC 1 Port 1 Partition 1 because of the Secure Boot policy. (...)
  No boot device available or Operating System detected. Please ensure a compatible bootable media is available.

Winpe.iso with lpxelinux.0 (for Windows server 2019) boots fine with BIOS boot, gets drivers detected, sets up the network, mounts
samba drive and lauches the installer with Autounatted.xml.
However installer informs that it will not proceed with Disk partitioning and formatting because boot was legacy/BIOS and
Autounatted.xml tells to use GPT partitioning (a EFI related standard). At least we get quite far.

Same scenario with syslinux.efi and UEFI Boot starts (promisingly) loading (300+MB) ISO image via http, but at ~4:10 ... 4:30 (mins)
loading crashes completeley (screen goes green in iDRAC). Note: Local disk boot boots fine, Gparted boots fine, memtest not
(loads ok but crashes with boot menu screen frozen),  
Same with memdisk based FreeBSD12 Boot. Seems crash is timed at the completion of loading (when bootstrap starts).

## SSH

SSH client reports (with -v turned on) `no hostkey alg`. The host keys are likely corrupt or have wrong perms.

## References
- https://stackoverflow.com/questions/8504065/ubuntu-preseed-file-installation-hanging
- https://stackoverflow.com/questions/27201419/automate-ubuntu-install-via-packer-stuck-at-welcome-screen
- https://www.experts-exchange.com/questions/28918859/Debian-Preseed-Installation-process-stuck-at-18-at-finishing-installation.html

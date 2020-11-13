# URL File /ubuntu/dists/bionic/InRelease

When using Node/Express HTTP static files delivery, the installer gets stuck
in file (relative path): /ubuntu/dists/bionic/InRelease and tries to fetch it
2 times

Sample:
File: /ubuntu/pool/main/p/pciutils/pciutils_3.5.2-1ubuntu1_amd64.deb
File: /ubuntu/pool/main/libu/libusb-1.0/libusb-1.0-0_1.0.21-2_amd64.deb
File: /ubuntu/pool/main/u/usbutils/usbutils_007-4build1_amd64.deb
File: /ubuntu/dists/bionic/InRelease
File: /ubuntu/dists/bionic/InRelease
File: /ubuntu/pool/main/t/tasksel/tasksel-data_3.34ubuntu11_all.deb
File: /ubuntu/pool/main/t/tasksel/tasksel_3.34ubuntu11_all.deb
File: /ubuntu/pool/main/i/installation-report/installation-report_2.62ubuntu1_all.deb

Pressing highlited, only button <Cancel> in installer lets installation progress
(installation seemed eternally stuck).

Resolution steps: Try corresponding scenario by Apache HTTP delivery

Result via Node.js / express / port 3000
Cannot GET /ubuntu/dists/bionic/InRelease

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot GET /ubuntu/dists/bionic/InRelease</pre>
</body>
</html>

Apache (Port 80)

<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">
<html><head>
<title>404 Not Found</title>
</head><body>
<h1>Not Found</h1>
<p>The requested URL /ubuntu/dists/bionic/InRelease was not found on this server.</p>
<hr>
<address>Apache/2.4.29 (Ubuntu) Server at 192.168.1.141 Port 80</address>
</body></html>

Apacche log shows 2 requests with different user agents:  Wget
192.168.1.99 - - [11/Dec/2018:21:49:33 -0800] "GET /ubuntu/dists/bionic/InRelease HTTP/1.1" 404 467 "-" "Debian APT-HTTP/1.3 (1.6.3)"
127.0.0.1 - - [11/Dec/2018:21:51:49 -0800] "GET /ubuntu/dists/bionic/InRelease HTTP/1.1" 404 519 "-" "Wget/1.19.4 (linux-gnu)"

# INFO: Menu item 'live-installer' selected

main-menu[1572]: INFO: Menu item 'live-installer' selected
base-installer: error: Could not find any live images
main-menu[1572]: WARNING **: Configuring 'live-installer' failed with error code 1
main-menu[1572]: WARNING **:  Menu item 'live-installer' failed

Solution: use on boot menu append line: 
live-installer/net-image=http://{{ httpserver }}/ubuntu14/install/filesystem.squashfs

# Ubuntu 18.04 Installer

Loading files 1/3 - progress gets jammed.

Solution: press enter, and installer progresses
TODO: See at what HTTP file jam happens. Also are we missing packages because of this ?

# Unable to install the selected kernel (14.04.5 server)

Unable to install the selected kernel
An error was returned while trying to install the krnel into the target system.
Kernel package: 'linux-generic-lts-xenial'

Check /var/log/syslog or see virtal console 4 for details

Note: xenial is 16.04 (Xenial Xerus), but we're trying to install 14.04 (Trusty Tahr)
In console 4 (Note error talks still only about headers):

in-target: Setting up linux-headers-4.4.0-139-generic (4.4.0.139.165~14.04.1)
in-target: Setting up linux-headers-generic-lts-xenial (4.4.0.139.119)
base-installer: error: exiting on error base-installer/kernel/failed-install

Possible solution: Preseed allows defining kernel version. Did not work

Possible solution: Try older server edition: ubuntu-14.04-server-amd64.iso (Older than even the .1)
This gives problem: Unable to install the selected kernel
...
Kernel package: 'linux-generic'

https://projects.theforeman.org/issues/16504
 saw this same issue and a google search got me here. In case others see it I resolved it by changing the partition layout to "Preseed default" from "Preseed custom LVM".
 
https://ubuntuforums.org/showthread.php?t=2337166
Do you have the trusty-security and/or trusty-updates repositories on your local mirror? 

In DEBCONF_DEBUG=5 console this shows: Adding [KERNEL] -> [linux-generic]

Helpful search: find /isomnt/ubuntu14/ -name "linux-*" (Shows 28 files)

References:
https://ubuntuforums.org/archive/index.php/t-2229953.html  Unable to isntall the kernel at end ... Kernel package: 'linux-generic'."

# nic firmware 404 not found

Found: /isomnt/ubuntu14/pool/main/l/linux-firmware/nic-firmware_1.127_all.udeb
URL:          /ubuntu14/pool/main/l/linux-firmware/nic-firmware_1.127.24_all.udeb

# Centos6 Installer panic (after first boot)

Last file downloaded: URL/File: /centos6/Packages/rootfiles-8.1-6.1.el6.noarch.rpm 6992 (Not necessarily culprit)
All consoles frozen, #1 shows the panic messages
Messages (repeated ~ 20 times):
mount: /dev/mapper/vg_perlix2-lv_root already mounted or /sysroot busy
mount: according to mtab, /dev/mapper/vg_perlix2-lv_root is already mounted on /sysroot

Followed by kernel (2.6.X !) messages: 
Kernel panic - not syncing: Attempted to kill init!
Pid: 1, comm: init not tainted 2.6.32-754.el6.x86_64 #1

Possible solution: Add /boot ? Prevent installer from using complex LVM scheme

# Centos 7 Failing network config

Problem:
From journal.log: network: apply kickstart: --device auto does not exist
Solution:
DO NOT leak value auto that is valid on preseed (as a substitute for concrete device name) to Kickstart. This is parameter of "network" command, where --device=auto creates a problem.

# Ubuntu Installer doing fast install

Registerd as of git state 2019-01-05 (evening):
- Normal install wi. root+swap partitions on disk, filling the disk
- Takes 4.5 mins, stops at partitioning and forces to manually choose install to esiting partitioning.

After Centos7 install
- on ~500GB disk with RH create parts w. sizes (MB) boot: 500, root: 32000,  swap: 2000 leaving a lot of space (400+ GB) on disk
- Installer runs 100% unattended in 3.5 mins
- Conclusion: partman-auto/init_automatically_partition select biggest_free probably means "Biggest free unallocated space" and allows partman-auto to proceed completely automatically, where as existing 400+ GB partition (not unallocated space) would require manual interaction and selections.

Complete disk settings at the time:

d-i partman-auto/init_automatically_partition select biggest_free
d-i partman-auto/disk string /dev/sda
d-i partman-auto/purge_lvm_from_device boolean true
d-i partman/default_filesystem string ext4
d-i partman/confirm boolean true
d-i partman/confirm_nooverwrite boolean true
d-i partman/mount_style select uuid
d-i partman/unmount_active boolean true

# Network global config
NOTE: There are slightly overlapping members in global.net
- dev - Network device, allowing value "auto" for preseed
  (netcfg/choose_interface)
- ifdefault - Default network device name for Netplan YAML (which whould
  not allow value "auto")

Try to document (better) or disambiguate these (in implementation).

# NetProbe async

Exception (w. server crash)

```
/projects/ccxsw/home/ccxswbuild/linetboot/node_modules/q/q.js:155
                throw e;
                ^

Error: Callback was already called.
    at /projects/ccxsw/home/ccxswbuild/linetboot/node_modules/async/dist/async.js:966:32
    at /projects/ccxsw/home/ccxswbuild/linetboot/node_modules/async/dist/async.js:1137:13
    at /projects/ccxsw/home/ccxswbuild/linetboot/netprobe.js:80:32
    at /projects/ccxsw/home/ccxswbuild/linetboot/node_modules/ping/lib/ping-sys.js:41:9
    at _rejected (/projects/ccxsw/home/ccxswbuild/linetboot/node_modules/q/q.js:864:24)
    at /projects/ccxsw/home/ccxswbuild/linetboot/node_modules/q/q.js:890:30
    at Promise.when (/projects/ccxsw/home/ccxswbuild/linetboot/node_modules/q/q.js:1142:31)
    at Promise.promise.promiseDispatch (/projects/ccxsw/home/ccxswbuild/linetboot/node_modules/q/q.js:808:41)
    at /projects/ccxsw/home/ccxswbuild/linetboot/node_modules/q/q.js:624:44
    at runSingle (/projects/ccxsw/home/ccxswbuild/linetboot/node_modules/q/q.js:137:13)
```

In code section
```
ping.sys.probe(ipaddr, function (isok) {
          prec.ping = isok;
          if (! isok) { return cb(null, prec); }
	  
```

In more verbose output - place just before (twice called) CB call - a ipaddr repeats (for some reason):
```
Ping fail: 10.75.139.30
Ping fail: 10.75.158.204
Ping fail: 10.75.158.204
```
The reason for that is dns.resolveAny() produces sometimes > 1 records (2)
and all are iterated by addrs.forEach(function (rec) {...
```
# Normal record
Pv4 Addresses:  [ { address: '10.75.139.31', ttl: 3600, type: 'A' } ]
# 
IPv4 Addresses:  [ { address: '10.75.158.204', ttl: 60, type: 'A' },
  { entries: [ '31bc53614c44bdcd25b434262c6e9f749e' ],
    type: 'TXT' } ]
```

# Systemd: Attempted to remove disk file system, and we can't allow that.

When trying to do: systemd-analyze verify ./linetboot.service
Bug in systemd 237 and 238 (Ubuntu 18 has 237), see: https://unix.stackexchange.com/questions/443708/why-does-systemd-report-attempted-to-remove-disk-file-system-when-verify-is


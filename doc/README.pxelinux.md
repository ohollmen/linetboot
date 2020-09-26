# PXE Boot and PXELinux Bootloader

## PXELinux

https://www.syslinux.org/wiki/index.php?title=PXELINUX - Explanations of load order, HTTP,FTP Support, Examples on boot menus

## General About PXE

PXE Booting starts at Machine PXE firmware that has small, lightweight
implementations (and also API usable from secondary bootloaders, called UNDI) for:
- Host Networkcard card drivers
- DHCP Client
- TFTP Client

Sequence of PXE Boot Activities. The PXE sw on host is briefley called "PXE" here
- PXE makes a DHCP request
  - Requests a bunch of usual DHCP fields
  - Sends indicators about client type (e.g. `vendor class: PXEClient:Arch:00000:UNDI:002001`)

PXE DHCP Client request (extracted from dnsmasq log lines with `Sep 16 20:50:17 dnsmasq-dhcp[24411]: 613971400` eliminated):
```
requested options: 1:netmask, 2:time-offset, 3:router, 5, 6:dns-server, 
requested options: 11, 12:hostname, 13:boot-file-size, 15:domain-name, 
requested options: 16:swap-server, 17:root-path, 18:extension-path, 
requested options: 43:vendor-encap, 54:server-identifier, 60:vendor-class, 
requested options: 67:bootfile-name, 128, 129, 130, 131, 132, 
requested options: 133, 134, 135
```

Response:
```
sent size:  1 option: 53 message-type  2
sent size:  4 option: 54 server-identifier  192.168.1.107
sent size:  4 option: 51 lease-time  86400
sent size:  4 option: 58 T1  43200
sent size:  4 option: 59 T2  75600
sent size: 14 option: 67 bootfile-name  undionly.kpxe
sent size:  4 option:  1 netmask  255.255.255.0
sent size:  4 option: 28 broadcast  192.168.1.255
sent size:  4 option:  6 dns-server  192.168.1.107
sent size:  7 option: 12 hostname  perlix2
sent size:  4 option:  5   c0:a8:01:6b
sent size:  4 option:  3 router  192.168.1.1
```
### Notes on PXE related DHCP options

This is by no means a full manual to DHCP options, but these are core DHCP protocol options controlling TFTP boot
(See your DHCP server on what string-form keyword is used to configure each numeric protocol option):

- 13 - Boot file size (???) - Size of boot file in 512 byte chunks
- 66 - TFTP (boot) server name (hostname by RFC spec, but it seems implementations allow IP address too, aka "next-server")
- 67 - TFTP boot program path (resolvable under tftp server root dir.)
- 128 - TFTP server address (For IP Phone SW load)
- 150 - TFTP Server address (IPv4 IP address, somewhat overlapping w. Option 66)

Also a feature introduced later onto TFTP is "options". These options
may be required by some (BIOS) PXE implementations.

For more on protocol, see [rfc2132 1997](https://tools.ietf.org/html/rfc2132),
[RFC2939](https://www.iana.org/assignments/bootp-dhcp-parameters/bootp-dhcp-parameters.xhtml),
[BOOTP (~PXE) Options](http://www.networksorcery.com/enp/protocol/bootp/options.htm)


### DHCP Vendor classes

PXE Client sends an indication (A new DHCP message type, DHCPINFORM, rfc2131) of its hardware boot mechanism and way of booting in a "vendor-class" DHCP option.
The  beginning of this option starts like PXEClient:Arch:00007 and the number after Arch is significant and expresses:

- 00000 - BIOS Boot
- Various EFI (> 6)
  - 00006 - EFI AI32
  - 00007 - EFI 64 (EFI BC - Byte Code)
  - 00009 - EFI x86 (32 bit and 64 bit ?)
- Other examples:
  - 000562 - Cisco IP Phone (Not sure if this changes by tgeneration of phone)
  - 10 is "ARM 32-bit UEFI"
  - 11 is "ARM-64 bit UEFI
In the same string (after Arch) there is substring `...:UNDI:002001`, which merely indicates PXE Standard version 2.1 (As usually show on the PXE stage boot screen of PC/Server)

(See http://www.unix.com/linux/139267-dhcp-what-does-vendor-class-identifier-0-9-mean.html, RFC2131, RFC2132, See also option 60/vendor-class,
See RFC3004 for 77/user-class, See (legacy) Option 43, generic vendor specific info in N-octets, rfc5970 https://tools.ietf.org/html/rfc5970#section-6https://tools.ietf.org/html/rfc5970#section-6 .)

### Next-Server, Bootfile and Server name

See rfc2131, 2. Protocol Summary / "FIELD OCTETS DESCRIPTION" table:
- siaddr - Next-server **IPAddress** (not hostname) for TFTP Server to get bootfile from - 4 B
- file - Boot File (NBP), Max 128 B (with possible relative path), must reside on next-server
- sname - Optional Server name (hostname, not IP address) Max 64 bytes null terminated (leaving 63 usable bytes)

These fields are crucial to understand and appear in the DHCP server configuration.

## References

- DHCP Options in plain english https://www.incognito.com/tutorials/dhcp-options-in-plain-english/
- Cisco on DHCP Options https://www.cisco.com/c/en/us/td/docs/net_mgmt/prime/network_registrar/9-0/dhcp/guide/DHCP_Guide/DHCP_Guide_appendix_01101.pdf
- FOG on Vendor-classes https://wiki.fogproject.org/wiki/index.php/BIOS_and_UEFI_Co-Existence

BSD
- NetBSD "pxeboot" PXE bootloader https://man.openbsd.org/pxeboot.8 (Very good explanation of pxe and this bootloader
  and its conf file /etc/boot.conf on TFTP server, See boot/pxeboot on Freebsd 12 ISO)
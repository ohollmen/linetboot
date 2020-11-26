# Config changes to local DHCP Server

Independent of which particular kind of DHCP Server your environment is using you have to configure it to
send following configuration information to the hosts that you want to include in the auto-installation setup:

- Boot Image / NBP (Network Boot Program, DHCP Option 67) name (e.g. Linux standard "pxelinux.0" or "lpxelinux.0")
- The TFTP server, aka "Next-Server" (separate from DHCP server itself, DHCP Option 66) from which the above Boot Image / NBP is available using the simple TFTP
  - ISC DHCP calls this descriptively  "next-server" in it's configuration

Examples of configuring this in various DHCP servers:

## Configuring ISC DHCP 3 Server

In a subnet block include (among other options)

    ...
    # Range of network booting machines to apply this config to
    range dynamic-bootp 10.1.10.50 10.1.10.70;
    # TFTP Server to fetch NBP (Network boot program) from
    next-server 10.1.10.5;
    # NBP Filename (assumed to be at root dir of TFTP server)
    filename "lpxelinux.0";

To make DHCP Server assign constant/fixed ip address ("pseudo-static") by MAC address create blocks similar to floowing for each PXE bootable host: 

    # These could reside inside a wrapping subnet block
    ...
    host compute-001 {
      hardware ethernet bc:30:d9:2a:c9:50;
      fixed-address 192.168.0.152;
    }
    ...
    
In case you want to customize a particular host to a special NBP boot file and different server (or just one
of them leaving the other one out):

    host compute-001 {
      filename "gpxelinux.0";
      next-server 10.1.10.6;
      hardware ethernet bc:30:d9:2a:c9:50;
      fixed-address 192.168.0.152;
    }

See ISC DHCP server documentation for advanced details.
Restart server by `sudo service restart dhcpd`.

## Configuring dnsmasq Server

In main config include (How to limit this to only a range of hosts ?):
    
    dhcp-boot=lpxelinux.0,mytftphost-001,10.1.10.5

Another way that should be effective for same outcome:

    # Boot TFTP server
    dhcp-option=66,"10.1.10.5"
    # Boot file (on boot server)
    dhcp-boot=lpxelinux.0
    

Note: The dnsmasq is generally very "overloaded" with it's config directives and thus even `dhcp-boot` has
many conditional forms that could be used for PXE boot client differentiation (i.e. "if client has this characteristics, then send this bootfile/bootloader", see confitional labels like "tag:", "vendor:").

dnsmasq allows also advanced differentiation of PXE Boot clients (not tested w. linetboot):

    # NOTE: For some reason ".0" suffix has to be left out with pxe-service
    pxe-service=x86PC, "PXELINUX (BIOS)", "lpxelinux"
    pxe-service=X86-64_EFI, "PXELINUX (EFI)", "efi64/syslinux.efi"

Read `man dnsmasq` carefully to use these options (See also `pxe-prompt` and `pxe-service`).
See also dnsmasq `dhcp-match` directive and combining it with `dhcp-boot` (as another way for paramerizing boot process).

Other good info on configring dnsmasq:

- [dnsmasq author's manual](http://www.thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html)
- [Arch Wiki on dnsmasq, see 'PXE Server'](https://wiki.archlinux.org/index.php/Dnsmasq) - discussion on PXE boot options and proxy-DHCP mode
- [Arch Wiki on PXE](https://wiki.archlinux.org/index.php/PXE)
- [Arch Wiki on Syslinux](https://wiki.archlinux.org/index.php/Syslinux)
- [Gentoo Wiki on dnsmasq](https://wiki.gentoo.org/wiki/Dnsmasq)
- [Syslinux Project Website](https://wiki.syslinux.org/wiki/index.php?title=The_Syslinux_Project)
- [Syslinux details (e.g. SYSAPPEND bitmask)](https://wiki.syslinux.org/wiki/index.php?title=SYSLINUX#SYSAPPEND_bitmask)
- https://autostatic.com/setting-up-a-pxe-server-with-dnsmasq/
- https://serverfault.com/questions/986773/force-client-to-send-dhcp-options-to-next-server
- https://github.com/chan-sccp/chan-sccp/wiki/setup-dhcp-service
- [Sonicwall table of DHCP Option codes](http://help.sonicwall.com/help/sw/eng/6800/26/2/3/content/Network_DHCP_Server.042.12.htm)
- [Dealing with Option 93 / vendor-class-identifier](https://www.syslinux.org/archives/2014-October/022683.html)
- https://forums.fogproject.org/topic/8726/advanced-dnsmasq-techniques

Reload dnsmasq server config by `sudo kill -HUP $DNSMASQ_PID` (Use `ps -ef | grep dnsmasq` to find out pid).

dnsmasq also has an integrated tftp server that can be turned on with `enable-tftp` (See also `tftp-root` for
customizing the TFTP root path).
Turning on dnsmasq tftp would eliminate the need to install a separate TFTP server.

Debian/Ubuntu hint: dnsmasq logs to /var/log/syslog. To increase DHCP interaction verbosity in log add -q option
for the launch of dnsmasq in `/etc/default/dnsmasq`:

    # ...
    DNSMASQ_OPTS="-q"
    # ...

## Configuring Infoblox appliance DHCP Server

Infoblox is a commercial DHCP/DNS Server with Web Admin GUI, see: [Configuring IPv4 BOOTP and PXE Properties](https://docs.infoblox.com/display/NAG8/Configuring+IPv4+BOOTP+and+PXE+Properties)

The PXE Boot settings are often (exclusively) a property of a network (Not host). Infobox allows
finding out the network by searching by "IP Address" or "DNS Name", from search results, choose
the network (w. CIDR mask), e.g. "10.75.128.0/19" and click Edit (to view or edit).

After getting to IPv4 network view (You may need to "Toggle Advanced Mode" to see BOOTP/PXE related details) navigate to tab (i.e. click) **IPv4 BOOTP/PXE** to enter (in section "BOOTP Settings"):

- **Boot File**: name of the boot file the client must download (Enter "lpxelinux.0")
- **Next Server**: Enter the IP address or hostname of the boot file server where the boot file is stored (Normal PXE clients, enter IP Address of your TFTP Server)
- **Boot Server**: Same as above, but for clients which do not request IP Address lease, but only Boot Server name (This is supposed to be hostname, but is sometimes filled with IP address).

The Next Server and Boot Server are often redundantly set to same value.
Do not set (checkbox) "Deny BOOTP Requests".
The above servers can be set on **network level** or **host level**. Out of the Internal fields (e.g. as dealt with in REST API)
on the host level config the following fields in "ipv4addrs" section are relevant or need to be set.

- host - The hostname (This will be always filled, this is called "name" in API parameters and the outer JSON section of "ipv4addrs")
- ipv4addr - The IP Address (This could be static or fixed-dynamic or used for both - host PXE boots with dynamic address,
     but gets configred with static address at the time of OS install, UI: "IPv4 Address")
- mac - MAC Adrress by which this host record gets looked up during PXE boot (UI: "MAC Address")
- configure_for_dhcp - Must be set to get correct address at PXE boot (**Important !**, UI: "DHCP" checkbox)

Note: Does host record "Updates" => "Protected" (checkbox) need to be turned off ?

In terms of DNS The host can be recorded in may ways in InfoBlox (TXT (no address)/A (ip address)/PTR, all these have "Basic" tab only,
or "Host" record). The machines for PXE boot should be recorded as "Host" records.

------------------------------------------------------------------------

# Configuring TFTP Server

Config locations (for Ubuntu tftpd servers):

- tftpd - /etc/inetd.conf - Has a line to launch tftpd
- tftpd-hpa - /etc/init/tftpd-hpa.conf, /etc/init.d/tftpd-hpa /etc/default/tftpd-hpa (Add -vvv to TFTP_OPTIONS=...
   for increased verbosity)
  - On an old Debian logs go to: /var/log/daemon.log or /var/log/syslog (See your debian doc for exact location)
  
  
## Using UEFI PXE Boot (syslinux.efi)

<!--
syslinux.efi does not unfortunately support booting (i.e. loading kernel and ramdisk) over the HTTP like lpxelinux.0 does.
The loopmounted ISO image must be made available on TFTP server and paths in menu file "default" must be
adjusted accordingly. However the KS/Preseed loading can still happen via HTTP as that phase is
handled by installer (TODO: Test out and provide step-by-step example on how to setup content under TFTP server root).
-->
Ubuntu 18 version of syslinux.efi seems to support loading of kernel and initrd over http and as a result should be bootmenu
(pxelinux.cfg/default) compatible with lpxelinux.0.

## Using VirtualBox "virtual PXE boot and vitual TFTP server"

Less advertised feature of VirtualBox is it's ability to allow PXE boot via its Virtual TFTP server.
There is no actual TFTP server running but only a specifically created directory layout that mimicks
TFTP server (VirtualBox handles this internally). For example on Mac the the root directory for TFTP content
would be `/Users/johnsmith/Library/VirtualBox/TFTP/`. Per this path the setup of menu would require:

    VBOX_TFTP_ROOT=/Users/johnsmith/Library/VirtualBox/TFTP/
    mkdir -p $VBOX_TFTP_ROOT/pxelinux.cfg
    cp /path/to/my_pxe_menu_file $VBOX_TFTP_ROOT/pxelinux.cfg/default
    
The content can (and should) be identical to regular "real" TFTP server (i.e. you should still have the pxelinux *.c32 modules in $VBOX_TFTP_ROOT/.
The booting can still happen via a live lineboot server via HTTP.
Info Source: https://gerardnico.com/virtualbox/pxe.

------------------------------------------------------------------------

## Configuring Host BIOS for PXE Boot

The instructions here are specifically applicable for Dell servers but flow is likely very similar for other Intel based hardware with BIOS.

- Boot Configuration is under top menu item "Boot Settings", navigate there
- Choose Boot Mode: BIOS (not UEFI mode *pxelinux.0 bootloaders will only work in BIOS mode)
- Navigate to "BIOS Boot Settings"
- In section "Boot Option Enable/Disable", keep "Integrated NIC 1 ..." enabled - disabling this item does not allow booting from network at all.
- In "Boot Sequence" you may keep "Integrated NIC 1 ..." at low priority (towards bottom) as request to (PXE) boot via network is likely to be triggered via explicit keypress (e.g. Dell: F12) at the startup.

### Support for ARM

Linetboot server will run fine on ARM. At this point booting ARM hardware is not directly supported/tested as
PXELinux (the lineboot de-facto bootloader) is Intel X86 w. PXE BIOS -only.
However booting ARM boot clients should be quite feasible with some DIY by following steps:

- Find a suitable ARM bootloader for your ARM CPU and board variant
- Configure DHCP to recognize your ARM system by its MAC address, assigning it an IP (also in DNS)
- Assign the ARM bootloader you figured out in first step as bootfile/NBP (e.g.): `filename "..."` 

<!-- (However You *can* run linetboot server on ARM fine, just the machine to netboot/install cannot be ARM based). -->

### Booting EFI/UEFI

#### Bootloader

Possible bootloader solutions (not fully tried):
- Use Grub 2 with its net booting capabilities (NBP: grubaa64.efi)
- Use syslinux.efi (Separate binaries for efi32,efi64, seems to support also http)
- Use iPXE

#### Hardware Settings

Besides enabling Disk EFI Boot you need to "Enable UEFI Network Stack" (Dell Term in BIOS settings)
References:
- https://www.dell.com/community/Laptops-General-Read-Only/How-to-make-Precision-5510-XPS13-XPS15-boot-from-network/td-p/5044315
- Google: loading memdisk failed no such file or directory

#### UEFI HTTP Settings

For each network device (e.g. 1...4). (Dell) BIOS Explains: "When this setting is Enabled, the BIOS will create a UEFI boot option
for the HTTP sevice."
May be also seen (in server BIOS) as: "UEFI PXE Settings" 1..4, Enabled/Disable, set enabled for network interface you plan to use 

Other notable settings:
- System BIOS Settings => Boot Settings => UEFI Boot Settings => Unavailable: Windows Boot Manager
- System BIOS Settings => System Security => SECURE BOOT => Secure Boot: Enabled/Disabled

### Interference with iSCSI or FCoE

The PXE boot-time error "PXE-E51: No DHCP or proxyDHCP offers were received" can be caused by
iSCSI or FCoE boot being enabled. To avoid this (examples given for typical Dell server) run through listed checks below.

- In general iSCSI and FCoE settings should be disabled (below are disablement hints for settings that may be most likely enabled in out-of-box factory settings)
- Additionally there may be multiple interfaces to perform these settings on
  (you may need to go through all of them). Check the interface MAC address that correlates to your main OS MAC address to configure it as PXE enabled.
- Start at "Device Settings" (Next to System BIOS, iDRAC Settings)
- Main Config. Page => iSCSI Config. => iSCSI General parameters:
  - TCP/IP Parameters via DHCP: Disabled
  - iSCSI  Parameters via DHCP: Disabled
  - Boot to iSCSI Target: Disabled
- Main Config. Page => FCoE Config => FCoE General parameters:
  - Boot to FCoE Target: Disabled

Enable in "NIC Configuration" (Only important/meaningful ones shown):

- Legacy Boot Protocol: PXE
- Boot Strap Type: Auto Detect
- Setting "Retries" to more than one (e.g. even 2-3) often helps.


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

For EFI HTTP Boot (part of the UEFI specification) the (EFI) Boot server should send DHCP Option 60
(Vendor Class) value set to 'HTTPClient' and set Options 66 (Boot
Server IP - IP only ?) and 67 (Boot File Name - relative path to root
of server) - the Boot loader program path accordingly. Seems vendos
implementing EFI boot standard support NBP as either EFI boot loader
or bootable ISO image (!).

There is also info on setting option 6 (67?) in a following way:
```
# Boot file URI (example had boot.efi). Placing file in e.g. /isomnt
# (set as one of the docroots) should work (Could setup a symlink too).
# Some examples suggest detecting (option 93, set tags are arbitrary
# strings used in tag:... conditionals later, have as many of these as needed):
# Orig. example tag: X86-64_EFI_HTTP
dhcp-match=set:efi64_http,option:client-arch,16
# PXE Boot Arch Field DHCP Option 93 (dnsmasq "client-arch")
# From: https://www.iana.org/assignments/dhcpv6-parameters/dhcpv6-parameters.xhtml#processor-architecture
# - 0x00 0x0f x86 uefi boot from http - 15
# - 0x00 0x10 x64 uefi boot from http - 16
# This is a simple example, sets boot file unconditionally (usually unacceptable for heterogenous PXE clients)
# Try path: /usr/lib/grub/x86_64-efi-signed/grubnetx64.efi.signed, may also need /usr/lib/shim/shimx64.efi.signed
## dhcp-option=67,http://192.168.1.10/grubnetx64.efi.signed
# Force required vendor class in the response, even if not requested
dhcp-option-force=tag:arch_x64,option:vendor-class,HTTPClient
# Try building a complete dhcp-boot record for any HTTP Client (is the last IP even needed):
dhcp-boot=tag:efi64_http,http://192.168.1.10/grubnetx64.efi.signed,192.168.1.10
```

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
- Google: efi http boot dhcp option
- https://serverfault.com/questions/1156567/set-up-dnsmasq-as-a-dhcp-proxy-for-uefi-https-boot
- https://stackoverflow.com/questions/58921055/pxe-boot-arch-field-dhcp-option-93
  - https://www.iana.org/assignments/dhcpv6-parameters/dhcpv6-parameters.xhtml#processor-architecture


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

## Configuring Linux (Debian,Ubuntu,RHEL)

Config locations (for Ubuntu tftpd servers):

- tftpd - /etc/inetd.conf - Has a line to launch tftpd
- tftpd-hpa - /etc/init/tftpd-hpa.conf, /etc/init.d/tftpd-hpa /etc/default/tftpd-hpa (Add -vvv to TFTP_OPTIONS=...
   for increased verbosity)
  - On an old Debian logs go to: /var/log/daemon.log or /var/log/syslog (See your debian doc for exact location)
- TFTP root: /var/lib/tftpboot/

## Configuring MacOS

Excellent guude: https://kb.promise.com/thread/how-do-i-enable-a-tftp-server-on-mac-os-x/
- TFTP Root: /private/tftpboot/

## Using UEFI PXE Boot (syslinux.efi)

<!--
syslinux.efi does not unfortunately support booting (i.e. loading kernel and ramdisk) over the HTTP like lpxelinux.0 does.
The loopmounted ISO image must be made available on TFTP server and paths in menu file "default" must be
adjusted accordingly. However the KS/Preseed loading can still happen via HTTP as that phase is
handled by installer (TODO: Test out and provide step-by-step example on how to setup content under TFTP server root).
-->
Ubuntu 18 version of syslinux.efi seems to support loading of kernel and initrd over http and as a result should be bootmenu
(pxelinux.cfg/default) compatible with lpxelinux.0.


--------------------------------------------------------------------------

## Using Virtualization Environments to PXE Boot

### Using VirtualBox "virtual PXE boot using virtual TFTP server"

Less advertised feature of VirtualBox is it's ability to allow PXE boot via its Virtual TFTP server.
There is no actual TFTP server running but only a specifically created directory layout that mimicks
TFTP server (VirtualBox handles this internally). For example on Mac the the root directory for TFTP content
would be (e.g.) `/Users/johnsmith/Library/VirtualBox/TFTP/`. Per this path the setup of menu would require:

    # Linux: ~/.config/VirtualBox/TFTP/
    # VirtualBox Virtual TFTP Server root:
    VBOX_TFTP_ROOT=$HOME/Library/VirtualBox/TFTP/
    # Make pxelinux config dir
    mkdir -v -p $VBOX_TFTP_ROOT/pxelinux.cfg/
    # Generate pxelinux bootloader config (named "default" per pxelinux conventions)
    # Assume cwd (current working dir) as lineboot codebase top dir
    cat ~/.linetboot/global.conf.json | ./node_modules/mustache/bin/mustache - ./tmpl/default.installer.menu.mustache > /tmp/default
    # sanity check: less /tmp/default (e.g. no templating curlies should be present)
    # Copy pxelinux config under VirtualBox TFTP root:
    #cp /path/to/my_pxe_menu_file $VBOX_TFTP_ROOT/pxelinux.cfg/default
    cp /tmp/default $VBOX_TFTP_ROOT/pxelinux.cfg/default
    
The content can (and should) be identical to regular "real" TFTP server (i.e. you should still have the pxelinux *.c32 modules in $VBOX_TFTP_ROOT/.
The booting from kernel and initrd loading onwards can still happen via a live linetboot server via HTTP.
Copying 
```
# E.g. on Mac (assuming you have the bootloader executable and modules in place):
cp -r /private/tftpboot/ $HOME/Library/VirtualBox/TFTP/

# Alternatively ... Rsync from remote linux
rsync -av $USER@myremotelinux:/var/lib/tftpboot/ $HOME/Library/VirtualBox/TFTP/
```
### Configuring VirtualBox for PXE / TFTP Boot

- Machine Item (Right mouse button) => Settings => System (Icon/Tab) =>
Boot Order
- Change default (Floppy,Optical,Hard Disk, Network) to start with Network (unselected by default)
- Looks by default for filename: ${VM_NAME}.pxe

To avoid loading bootloader by name ${VM_NAME}.pxe you need to set the
name of bootloader binary explicitly:
```
# Note the letter 'l' in lpxelinux.0 (e.g. for machine RHEL8)
# Make sure machine is in "off" state, or else you'll get:
# VBoxManage: error: The machine 'RHEL8' is already locked for a session (or being unlocked)
VBoxManage modifyvm RHEL8 --nattftpfile1 /lpxelinux.0
```
The Boot Order GUI and modifyvm (CLI) Changes the your ${VM_NAME}.vbox (XML) config file:
```
# From
  <NAT localhost-reachable="true"/>

# To ...
  <NAT localhost-reachable="true">
     <TFTP boot-file="/lpxelinux.0"/>
  </NAT>

# And add & re-order boot items e.g. to prioritize network boot (1 => first / prioritized boot method):
<Order position="1" device="Network"/>
```
Instead of using VirtualBox GUI, You can start your VM from CLI:
```
VirtualBoxVM --startvm RHEL8
```

Info Source: https://gerardnico.com/virtualbox/pxe.

### Using virt-manager to PXE Boot

virt-manager differs from VirtualBox in regards to holistic PXE boot setup by:
- It does not implement a "virtual" TFTP server of its own
- It allows you to use existing DHCP+TFTP infra **directly** for PXE booting
  with minimum configuration in virt-manager itself.

After creating a VM "stub" (even empty, unpartitioned, unformatted disk
is okay), you can toggle the VM to 1) be PXE bootable, 2) set boot priority
to PXE by: Left Navigation Pane: Boot Options => Boot Device Order => NIC: ... (Bring item up / prioritize item "NIC:..." using arrow-up button)

Already at the time of creating the VM (in wizard, step 1 of 5, in some versions of virt-manager, or does this depend on Non-wifi NIC being connected), there is an option
"Choose how you would like to install the operating system:" => "Network Boot (PXE)", so you could choose PXE boot already there.

Links:
- https://blog.scottlowe.org/2015/05/11/using-pxe-with-virt-install/
- https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/virtualization_host_configuration_and_guest_installation_guide/chap-virtualization_host_configuration_and_guest_installation_guide-libvirt_network_booting


### Using QEMU to Boot PXE

QEMU also has a built-in TFTP server, whset root diretory you provide
on comand line (as part of -netdev parameter). You also provide the
normally "delivered-by-DHCP" parameters like `bootfile=...` as part of
command line (-netdev) instead of using actual DHCP (In VBox this came
from config file).

Example script to run as run-qemu -m 8192 -hda ~/pxebootdisk.vmdk, reusing
the earlier established TFTP area:
```
#!/bin/sh
# Notes: -device can have mac=52:05...
# qemu-img create -f vmdk ~/pxebootdisk.vmdk 10
# Use: qemu-system-x86_64
qemu-kvm -cpu host -accel kvm \
-netdev user,id=net0,net=192.168.88.0/24,tftp=$HOME/Library/VirtualBox/TFTP/,bootfile=/pxelinux.0 \
-device virtio-net-pci,netdev=net0 \
-object rng-random,id=virtio-rng0,filename=/dev/urandom \
-device virtio-rng-pci,rng=virtio-rng0,id=rng0,bus=pci.0,addr=0x9 \
-serial stdio -boot n $@
```

See: https://www.brianlane.com/post/qemu-pxeboot/
https://gist.github.com/pojntfx/1c3eb51afedf4fa9671ffd65860e6839


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

Possible EFI bootloader solutions (not fully tried):
- Use Grub 2 with its net booting capabilities (e.g. ARM NBP: grubaa64.efi)
- Use syslinux.efi (Separate binaries for efi32,efi64, seems to support also http)
  - Boots most/all Linux distros fine
  - Can use the same menu as pxelinux
- Use iPXE (certain EFI compatible variant)

#### Hardware Settings

Besides enabling Disk EFI Boot you need to "Enable UEFI Network Stack" (Dell Term in BIOS settings)
References:
- https://www.dell.com/community/Laptops-General-Read-Only/How-to-make-Precision-5510-XPS13-XPS15-boot-from-network/td-p/5044315
- Google: loading memdisk failed no such file or directory

#### UEFI HTTP Settings

For each network device (e.g. 1...4). (Dell) BIOS Explains: "When this setting is Enabled, the BIOS will create a UEFI
boot option for the HTTP sevice.".
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


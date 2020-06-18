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

Restart server by `sudo service restart dhcpd`

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

    # For some reason ".0" suffix has to be left out with pxe-service
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
- [Sonicwall table of DHCOP Option codes](http://help.sonicwall.com/help/sw/eng/6800/26/2/3/content/Network_DHCP_Server.042.12.htm)
- [Dealing with Option 93 / vendor-class-identifier](https://www.syslinux.org/archives/2014-October/022683.html)
- https://forums.fogproject.org/topic/8726/advanced-dnsmasq-techniques
Reload server config by `sudo kill -HUP $DNSMASQ_PID` (Use ps -ef | grep dnsmasq to find out pid).

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

Based on above link the following need to be set (in the UI):

- Boot File: name of the boot file the client must download
- Next Server: Enter the IP address or hostname of the boot file server where the boot file is stored (Normal PXE clients)
- Boot Server: Same as above (but always hostname), but for clients which do not request IP Address lease, but only Boot Server name

## Notes on PXE related DHCP options

This is by no means a full manual to DHCP options, but these are core DHCP protocol options controlling TFTP boot
(See your DHCP server on what string-form keyword is used to configure each numeric protocol option):

- 13 - Boot file size (???) - Size of boot file in 512 byte chunks
- 66 - TFTP (boot) server name (hostname by RFC spec, but it seems implementations allow IP address too, aka "next-server")
- 67 - TFTP boot program path (resolvable under tftp server root dir.)
- 128 - TFTP server address (For IP Phone SW load)
- 150 - TFTP Server address (IPv4 IP address, somewhat overlapping w. 66)

Also a feature introduced later onto TFTP is "options".

For more on protocol, see [rfc2132 1997](https://tools.ietf.org/html/rfc2132),
[RFC2939](https://www.iana.org/assignments/bootp-dhcp-parameters/bootp-dhcp-parameters.xhtml),
[BOOTP (~PXE) Options](http://www.networksorcery.com/enp/protocol/bootp/options.htm)

------------------------------------------------------------------------

# Configuring TFTP Server

Config locations (for Ubuntu tftpd servers):

- tftpd - /etc/inetd.conf - Has a line to launch tftpd
- tftpd-hpa - /etc/init/tftpd-hpa.conf, /etc/init.d/tftpd-hpa /etc/default/tftpd-hpa (Add -vvv to TFTP_OPTIONS=...
   for increased verbosity)
  - On an old Debian logs go to: /var/log/daemon.log (See your debian doc for exact location)
  
## Using UEFI PXE Boot (syslinux.efi)

syslinux.efi does not unfortunately support booting (i.e. loading kernel and ramdisk) over the HTTP like lpxelinux.0 does.
The loopmounted ISO image must be made available on TFTP server and paths in menu file "default" must be
adjusted accordingly. However the KS/Preseed loading can still happen via HTTP as that phase is
handled by installer (TODO: Test out and provide step-by-step example on how to setup content under TFTP server root).

## Using VirtualBox "virtual PXE boot and vitual TFTP server"

Less advertised feature of VirtualBox is it's ability to allow PXE boot via its Virtual TFTP server.
There is no actual TFTP server running but only a specifically created directory layout that mimicks
TFTP server (VirtualBox handles this internally). For example on Mac the the root directory for TFTP content
would be `/Users/johnsmith/Library/VirtualBox/TFTP/`. Per this path the setup of menu would require:

    VBOX_TFTP_ROOT=/Users/johnsmith/Library/VirtualBox/TFTP/
    mkdir -p $VBOX_TFTP_ROOT/pxelinux.cfg
    cp /path/to/my_pxe_menu_file $VBOX_TFTP_ROOT/pxelinux.cfg/default
    
The content can (and should) be identical to regular "real" TFTP server (i.e. you should still have the pxelinux *.c32
modules in $VBOX_TFTP_ROOT/.
The booting can still happen via a live lineboot server via HTTP.
Info Source: https://gerardnico.com/virtualbox/pxe.

------------------------------------------------------------------------

# Linetboot configuration

Lineboot Configuration is best started by creating the initial "hosts" file
( `~/.lineboot/hosts` ).

## Main Configuration

Configuration in the main config file `global.conf.json`

- httpserver - The IP address of linetboot HTTP server with optional port (in addr:port notation). Use port 3000 (Express / linetboot default port) unless you know better what you are doing.
- userconfig - OS Install initial user info (See also how env. LINETBOOT_USER_CONF overrides this)
- tmplfiles (obj) - Object with keys "preseed", "ks" to refer to (Mustache template toolkit) template files to be used for Debian Preseed and RedHat Kickstart configoutput respectively. Tweak only if you need to customize the templates.
- fact_path (str) - Ansible fact path (See Env. FACT_PATH) for hosts to be enabled for install.
- maindocroot (str) - The dcocument root of linetboot (Express) static file delivery
- useurlmapping (bool) - map URL:s instead of using using symlinks to loop mounted ISO FS images.
- hostnames (array) - Explicit hostnames that are allowed to be booted/installed by linetboot system. These hosts must have their hosts facts recorded in dir registered in FACT_PATH (App init will fail on any host that does not have it's facts down). This is DEPRECATED
- hostsfile (string) - Filename for simple line-per-host text file with hostnames. Alternative to `hostnames` JSON config
  (array valued) key for hostnames.
- Installation Environment universal parameters (with fairly obvious meanings, not documented individually for now): locale, keymap, time_zone, install_recommends (D-I only), ntpserver, net (Object with global network base settings)

## Linetboot Environment Variables

Environment Variables that can override settings in main config:

- FACT_PATH - Ansible facts path (main.fact_path). Must contain JOSN facts files named by hostname (without *.json suffix).
- PKGLIST_PATH - Path with host package list files.
- LINETBOOT_GLOBAL_CONF - Full path to lineboot config file (No corresponding main conf var for obvious reasons).
- LINETBOOT_USER_CONF - OS Install Default User config JSON (See example initialuser.json)
- LINETBOOT_IPTRANS_MAP - File to simple JSON key-value value to map dynamic addresses to real IP addresses.
- LINETBOOT_SSHKEY_PATH - Path with SSH keys in hostname named subdirectories (with keys in them)

------------------------------------------------------------------------

## Configuring Host BIOS for PXE Boot

The instructions here are specifically applicable for Dell servers but flow is likely very similar for other Intel based hardware with BIOS.

- Boot Configuration is under top menu item "Boot Settings", navigate there
- Choose Boot Mode: BIOS (not UEFI mode *pxelinux.0 bootloaders will only work in BIOS mode)
- Navigate to "BIOS Boot Settings"
- In section "Boot Option Enable/Disable", keep "Integrated NIC 1 ..." enabled - disabling this item does not allow booting from network at all.
- In "Boot Sequence" you may keep "Integrated NIC 1 ..." at low priority (towards bottom) as request to (PXE) boot via network is likely to be triggered via explicit keypress (e.g. Dell: F12) at the startup.

At this point booting ARM hardware is not supported as PXELinux is Intel X86 w. PXE BIOS -only
(However You *can* run linetboot on ARM fine, just the machine to netboot/install cannot be ARM based). Supposedly Using Grub 2 with its net booting capabilities (NBP: grubaa64.efi) would be the solution.

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
- Surprisingly setting "Retries" to more than one (e.g. even 2-3) may help.


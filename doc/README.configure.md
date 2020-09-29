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
    
The content can (and should) be identical to regular "real" TFTP server (i.e. you should still have the pxelinux *.c32 modules in $VBOX_TFTP_ROOT/.
The booting can still happen via a live lineboot server via HTTP.
Info Source: https://gerardnico.com/virtualbox/pxe.

------------------------------------------------------------------------

# Linetboot configuration

## "hosts" Inventory (Ansible-style)

Lineboot Configuration is best started by creating the initial "hosts" (inventory) file
( `~/.lineboot/hosts` ). The format for this file follows the ansible inventory file format.
Lines should start with hostname and may be optionally followed by arbitrary `key=value` pairs
that may have meaning to either linetboot, ansible (internally) or ansible playbooks.
Linetboot supports a subset of ansible supported features with following notable points:

- host-lines should be fully suppported
- Concept of "groups" is not currently supported.
- host-lines should not be duplicated with same host(name) appearing multiple times in same inventory file

Even with these limitations there is a good chance you can share the inventory file with Ansible.

Note: Linetboot wants the whitespace in parameter values to be escaped by the URL escaping (Hex escape, e.g. %20 for space)  conventions.
However whitespace is rarely needed and the best choice is to simply avoid it.

Example of a small inventory:

```
# Group tags allowed, but not (currently) supported.
# As you can see, '#'-comments are supported too.
[workstations]
# Host parameters / variables are allowed. Lineboot wants spaces to be escaped by '+',
# but you rarely have spaces.
ws-001.comp.com loc=Floor+1 dock=1 nis=west
ws-002.comp.com loc=Floor+3 ansible_user=mrsmith nis=west
[fileservers]
filer-001 nfs=1
```

While key names for key-value pairs are arbitrary, some names have a special meaning (just as for Ansible) meaning for Lineboot.
The list on notable ones is:

- loc (sting) - Free form host location Indicator
- use (string) - Brief Usage description
- dock (bool) - Host is running docker (lineboot has ability to show image info for these hosts)
- nfs (bool) - Host is an NFS server (linetboot can show NFS shares for these hosts)

As a reminder (just to associate the connection to ansible and the possibility to share inventory), some ansible supported keys
would be:

- ansible_user - User to connect to this host as (often not present or overriden by ansible -e / --extra-vars)
- ansible_sudo_pass - Anisble sudo password

Sharing variable names with ansible is okay as long as they have the same conceptual meaning.

### Dynamic population of host key-value params

During server startup it will run a user created custom module, which gets called to do misc setup work.
One common use for this is to populate host params, for example based on hostname (which often have conventions grouping
together a set of hosts with similar patterns in name). See Documentation on main config "lboot_setup_module".
Note: Because these variables are dynamically populated in linetboot runtime data structures, they are not available to ansible.
If you must have params/vars available to ansible, you must statically populate them in inventory.

## Main Configuration

### Config Top level

Configuration in the main config file `~/.linetboot/global.conf.json` (Currently items with "main." reside on top level):

- main.httpserver - The IP address of linetboot HTTP server with optional port (in addr:port notation).
  Use port 3000 (Express / linetboot default port) unless you know better what you are doing.
  This setting is important (and mainly used on) templates (e.g. bootmenu).
- main.nfsserver - NFS file server for special installations that cannot cope with HTTP (E.g. Ubuntu
  18.04 Desktop seems to be crippled with HTTP)
- main.nfsserver - SMB/Samba/CIFS file server to use for special installations (mostly windows)
- fact_path (str) - Ansible fact path (See Env. FACT_PATH) for hosts to be enabled for install.
- main.useurlmapping (bool) - map URL:s instead of using using symlinks to loop mounted ISO FS images.
- main.hostnames (array) - Explicit hostnames that are allowed to be booted/installed by linetboot system. These hosts must have their hosts facts recorded in dir registered in FACT_PATH (App init will fail on any host that does not have it's facts down). This is DEPRECATED
- main.hostsfile (string) - Filename for simple line-per-host text file with hostnames. Alternative to `hostnames` JSON config 
  (array valued) key for hostnames (Default: Current users ~/.linetboot/hosts).
- tmplfiles (obj) - Object with keys "preseed", "ks" to refer to (Mustache template toolkit) template files to be used for Debian Preseed and RedHat Kickstart configoutput respectively. Tweak only if you need to customize the templates.

### Section "core" - Essential Linetboot Settings

- maindocroot (str) - The linetboot HTTP server (Express.js) document root for static boot media and OS Install files delivery
- appname (str) - "Branded" Application name shown in Web frontend of Linetboot
- hdrbg (str) - Header Background Image URL for frontend "branding"
- apiena (bool) - N/A

### Section "tftp" - TFTP Settings

Lineboot Admin tool (hostsetup.js) can assist in populating TFTP directories with (boot menu, config subdirs, symlinks etc.)
config files and bootloader binaries. The settings for "tftp" are:

- host - Remote host where TFTP server operates
- ipaddr - IP address of **local or remote** host where TFTP server operates. Used for the generation of DHCP config file.
- root - TFTP server data root directory
- linftp - Do not use this yet. Flag for using launching linetboot internal TFTP server (which can dynamically serve content for menus, etc)
- bootfile - The bootloader file for configuring DHCP server NBP
- menutmpl - PXELinux boot menu template file (Used for generating menu by admin tool)
- menutout - Boot menu timeout (In seconds, parameter used for boot menu generation)
- menutitle - Boot menu title (TODO) 
- sync - Flag to sync content (config files, dirs or bootfiles) to remote TFTP server, specified by ipaddr)

### Section "net" - Install time (and general) Network settings

  - netmask - Network mask in dotted-quad format (E.g. "255.255.255.0")
  - gateway - Gateway IP address in dotted-quad format (E.g. "192.168.1.1")
  - namesearch - DNS name search domains as array (E.g. `["veryclose.net", "near.net", "wayfarther.net"]`)
  - nameservers - DNS nameservers in array (E.g.: ["192.168.1.10", "192.168.1.11"]).
  - domain - Domainname suffix for local network (E.g. "veryclose.net").
  - dev - The default network interface name for the OS being installed (E.g. "eno1")
  - ifdefault - Default network interface (NOTE/TODO: disambiguate role of this with "dev" above)
  - ntpserver - Network Time Server (hostname)

When new hosts without facts are being installed, Linetboot heavily uses this section to "guess" the good default settings
for network config.

### Section "inst" - OS Installation

Installation Environment universal parameters (with fairly obvious meanings, not documented individually for now) that are used on preseed/kickstart templates:
- locale - Locale name for Language Locale / Char encoding (e.g. "en_US.UTF-8")
- keymap - Keyboard map / layout (E.g. "us")
- time_zone - Timezone of hosts (E.g. "America/Los_Angeles")
- install_recommends - Debian Installer (D-I only) setting for installing recommended dependencies (true/false)
- postscript - Script to launch at the end of installation
- userconfig - OS Install initial user info JSON filename (See also how env. LINETBOOT_USER_CONF overrides this).
    This external file should have members:
  - fullname - full firstname, lastname of user
  - username - login username for user
  - password - login password for user (in clear text for now)
  - groups - The OS groups user should be member of
  - homedir - Home directory for user

See "net" section above for install network settings (Object with global network base settings).

### Section "ipmi" - Remote Management Info

This section is for BMC based host management and interactivety by IPMI and RedFish (protocols).

- path - Path location for ipmitool collected files (`$hostname.net.users.txt` and `$hostname.net.users.txt`)
- user - Username for IPMI and Redfish
- pass - Password for IPMI and Redfish
- debug - Enable more verbose debug output on remote management ops

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

### Support for ARM

Linetboot server will run fine on ARM. At this point booting ARM hardware is not directly supported/tested as
PXELinux (the lineboot de-facto bootloader) is Intel X86 w. PXE BIOS -only.
However booting ARM boot clients should be quite feasible with some DIY by following steps:

- Find a suitable ARM bootloader for your ARM CPU and board variant
- Configure DHCP to recognize your ARM system by its MAC address, assigning it an IP (also in DNS)
- Assign the ARM bootloader you figured out in first step as bootfile/NBP (e.g.): `filename "..."` 

<!-- (However You *can* run linetboot server on ARM fine, just the machine to netboot/install cannot be ARM based). -->

### Booting EFI/UEFI

Possible solutions (not fully tried):
- Use Grub 2 with its net booting capabilities (NBP: grubaa64.efi)
- Use syslinux.efi
- Use iPXE

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


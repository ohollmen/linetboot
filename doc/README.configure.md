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
    # TFTP Server to fetch NBP from
    next-server 10.1.10.5;
    # NBP Filename (assumed to be at root dir of TFTP server)
    filename "lpxelinux.0";
    
## Configuring dnsmasq Server

In main config include (How to limit this to only a range of hosts ?):
    
    dhcp-boot=lpxelinux.0,mytftphost-001,10.1.10.5

## Configuring Infoblox appliance DHCP Server (Commercial DHCP/DNS Server)

See: https://docs.infoblox.com/display/NAG8/Configuring+IPv4+BOOTP+and+PXE+Properties

Based on above link the following need to be set (in the UI):
- Boot File: name of the boot file the client must download
- Next Server: Enter the IP address or hostname of the boot file server where the boot file is stored (Normal PXE clients)
- Boot Server: Same as above (but always hostname), but for clients which do not request IP Address lease, but only Boot Server name


------------------------------------------------------------------------

# Linetboot configuration

Configuration in the main config file `global.conf.json`

- httpserver - The IP address of linetboot HTTP server with optional port (in addr:port notation). Use port 3000 (Express / linetboot default port) unless you know better what you are doing.
- userconfig - OS Install initial user info (See also how env. LINETBOOT_USER_CONF overrides this)
- tmplfiles (obj) - Object with keys "preseed", "ks" to refer to (Mustache template toolkit) template files to be used for Debian Preseed and RedHat Kickstart configoutput respectively. Tweak only if you need to customize the templates.
- fact_path (str) - Ansible fact path (See Env. FACT_PATH) for hosts to be enabled for install.
- maindocroot (str) - The dcocument root of linetboot (Express) static file delivery
- useurlmapping (bool) - map URL:s instead of using using symlinks to loop mounted ISO FS images.
- hostnames (array) - Explicit hostnames that are allowed to be booted/installed by linetboot system. These hosts must have their hosts facts recorded in dir registered in FACT_PATH (App init will fail on any host that does not have it's facts down).
- hostsfile - Filename for simple line-per-host text file with hostnames. Alternative to `hostnames` JSON config
  (array valued) key for hostnames.
- Installation Environment universal parameters (with fairly obvious meanings, not documented individually for now): locale, keymap, time_zone, install_recommends (D-I only), ntpserver, net (Object with global network base settings)

Environment Variables:
- FACT_PATH - Ansible facts path. Must contain files named by hostname.
- PKGLIST_PATH - Path with host package list files.
- LINETBOOT_GLOBAL_CONF - Full path to lineboot config file.
- LINETBOOT_USER_CONF - OS Install Default User config JSON (See example initialuser.json)
- LINETBOOT_IPTRANS_MAP - File to simple JSON key-value value to map dynamic addresses to real IP addresses.
- LINETBOOT_SSHKEY_PATH - Path with SSH keys in hostname named subdirectories (with keys in them)

------------------------------------------------------------------------

## Configuring Host BIOS for PXE Boot

The instructions here are specifically applicable for Dell servers but flow is likely very similar for other Intel based hardware with BIOS.

- Boot Configuration is under top menu item "Boot Settings", navigate there
- Choose Boot Mode: BIOS (not UEFI mode)
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
  - Boot to Target: Disabled
- Main Config. Page => FCoE Config => FCoE General parameters:
  - Boot to FCoE Target: Disabled

Enable in "NIC Configuration":
- Legacy Boot Protocol: PXE
- Boot Strap Type: Auto Detect
- Surprisingly setting "Retries" to more than one (e.g. even 2-3) may help.


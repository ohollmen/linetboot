
# Debugging and Troubleshooting

## Linux installer on Install client host

- Ubuntu installer virtual console #4
  - Installer runtime (ramdisk?) /var/log/syslog (Only "more" pager is avail during install, also use tail -n 200 ...)
- CentOS installer virtual console #3 (filesystems),#4 (networking),#5 (other, all excellent sources of detailed information)
- CentOS installer leaves
  - anakonda-ks.cfg (Installer modified Kickstart w. packages added, commands resequenced, recommented etc.) and original-ks.cfg (your original KS as it came from server, verbatim) to homedir of root user (/root on root partition)
  - Various RedHat/CentOS anakonda installer in /var/log/anakonda
    - ifcfg.log - Network config (Interesting python dump snippets for if configs, under label "all settings")
    - packaging.log - Info about YUM repos, mirrors and packages.
    - storage.log - Info about disk controlled, disk devices, partitions (partitioning flow has python log messages)
    - journal.log - Full Log (like dmesg/syslo/message, includeing DHCP traffic, Starting Anaconda)
    - syslog, anaconda.log, program.log,ks-script-*.log
- After (failed) boot, check /proc/cmdline (Linux kernel commandline) for match with menu ("default") specified command line (sanity check) -
    if there is a mismatch, you possibly forgot to copy/sync the latest menu changes to TFTP server.

## Testing DHCP Client

- Real (ISC) DHCP Client: /sbin/dhclient (-v = verbose, -x Stop the running DHCP client without releasing the current lease.)
- dhcping - Not sure how this works sudo dhcping -s 192.168.1.107 reponds: "no answer"
- sudo dhcpdump -i eno1 - Only dumps traffic, attaches to an interface (utilizes tcpdump). Run `sudo dhclient` to monitor traffic (requests and responses). Must use separate terminals (e.g. virtual consoles) starting with boot, device detection, etc.

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

## PXE Client and PXE Linux Error messages

The problem with PXE Boot error messages are that they remain on screen for a very short time.

- `PXE-E53: No boot filename received` - DHCP config option "filename" was not gotten in DHCP offer (response for discovery).
  The lineboot compatible value for this is "lpxelinux.0". Check your DHCP Configuration.
- `Failed to load COM32 file ....c32` - PXELinux module (*.c32) defined in menu was not found on tftp server path relative to root  or a path relative to "path" directive (also found in menu). Follow TFTP server log to see what files were being tried. You likely forgot to place the *.c32 modules onto your TFTP server.
- PXE-T01 File Not Found, PXE-E38 TFTP Error - Filename was given in response from by DHCP Server, but file by that name was not found on the TFTP Server
- Failed to load ldlinux.c32 - same/similar as above on QLogic PXE Firmware
- `Unable to locate configuration file` ... Boot failed - PXE Linux is not finding its configuration file in TFTP directory pxelinux.cfg/ more particularly:
  - default file pxelinux.cfg/default
  - One of the may files in same subdirectory identified or named by client unique id (e.g. 44454c4c-5900-1046-804c-b1c04f4b4232), dash separated MAC address (e.g. 01-28-f1-0e-5d-61-af), 
Hexadecimal IP address (.e.g 0A55E80B), or truncated variants of Hex IP Address (with one digit dropped from tail at the time)
  - Place boot menu file by name pxelinux.cfg/default in correct format on the TFTP server.

- PXE-E51: No DHCP or Proxy Offers were received. PXE-M0F ...
- ... Media Test failure, check cable Your PXE ROM Configuration likely asks to PXE boot from wrong Network Interface port, which has not cable connected. 
- PXE-T01: File not nound PXE-E3B: TFTP Error - File Not found PXE-M0F Exiting ... Your PXE Implementation already tried to load a file by name which it does not display to you to challenge your debugging skills. Got to the log of your TFTP server and see what filename was tried. Example real life case: file requested was pxelinux.0, should be lpxelinux.0.
- PXE-E16: No offer received (AMI Bios machine on ...)
- PXELinux: Unable to locate configuration file
  - Check TFTP server log to see which file was tried to be loaded.
  - Usually many files are tried by various names (See pxelinux config file
    name rules)
  - RedHat firewall heuristics may refuse tftp traffic after too may rapid tries
  - Solution: Create symlink by one of the first tried filenames (e.g. MAC address with octets dash-separated).

## PXELinux errors

Errors are recognizable by *not* having the `PXE-E...` prefix.
- Unable to locate configuration file: pxelinux.0 or syslinux.efi was loaded, but the menu file was not there.
- No DEFAULT or UI configuration directive found: Config was found but
- ...failed: No such file or directory (After selecting menu item) - Likely means you are using non-http capable pxelinux or syslinux and filename was given as HTTP URL. This error message is very misleading and there will be no trace of
failed load in either TFTP or HTTP logs.

 

# PXE Boot in Virtual Environments

## Using VirtualBox "virtual PXE boot using virtual TFTP server"

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

## Using virt-manager to PXE Boot

virt-manager differs from VirtualBox in regards to holistic PXE boot setup by:
- It does not internally implement a "virtual" TFTP server of its own
- It allows you to use existing DHCP+TFTP infra **directly** for PXE booting
  with minimum configuration in virt-manager itself.
- However it can run a dnsmasq instance with special self-generated config (`--conf-file=/var/lib/libvirt/dnsmasq/default.conf`) to have protected VM-env-only
DHCP server for the clients.


Installing: "New VM" => Manual Install => Choose OS: Generic Linux 2024 =>
  4096 MB RAM / 2 CPUS => Enable Storage, 2.0 GB =>
  Choose: Customize configuration before install, Device name: prefer to leave empty => (In) Overview: 
  Choose: Firmware: OVMF_CODE_4M.fd (also variants .ms.fd, .secboot.fd)

Boot Options: Elevate NIC as first (over VirtIO Disk 1)

After creating a VM "stub" (even empty, unpartitioned, unformatted disk
is okay), you can toggle the VM to 1) be PXE bootable, 2) set boot priority
to PXE by: Left Navigation Pane: Boot Options => Boot Device Order => NIC: ... (Bring item up / prioritize item "NIC:..." using arrow-up button)

BIOS: ...

UEFI
```
>>Start PXE over iPv4
  PXE-E16 No valid offer received.
BdsDxe: failed to load Boot0002 "UEFI PXEv4 (MAC:5254...)" from PciRoot ...
```

Already at the time of creating the VM (in wizard, step 1 of 5, in some versions of virt-manager, or does this depend on Non-wifi NIC being connected), there is an option
"Choose how you would like to install the operating system:" => "Network Boot (PXE)", so you could choose PXE boot already there.

### Running virt-manager + dnsmasq

virt-manager internally runs:
```
# Note theis generated may be combined with manually maintained config
# (fragment / partial config) from /etc/libvirt/dnsmasq/default.conf
/usr/bin/dnsmasq --conf-file=/var/lib/libvirt/dnsmasq/default.conf
```
"Virtual Networks" (global) XML Config (for virt-manager private dnsmasq):
```
<network>
  <name>default</name>
  <bridge name='virbr0'/>
  <ip address='192.168.122.1' netmask='255.255.255.0'>
    <tftp root='/var/lib/tftpboot'/>
    <dhcp>
      <range start='192.168.122.2' end='192.168.122.254'/>
      <!-- Or e.g. grubnetx64.efi.signed -->
      <bootp file='lpxelinux.0'/>
    </dhcp>
  </ip>
</network>
```

### VM NIC Config (XML)

Network Source: Macvtap XML config (Note: dev may juggle between e.g. enp6s0 and virbr0, only ...) - works with lineboot NOT running on VM host:
```
<interface type="direct">
  <mac address="52:54:00:f3:76:f5"/>
  <source dev="enp6s0" mode="bridge"/>
  <model type="e1000e"/>
  <boot order="1"/>
  <address type="pci" domain="0x0000" bus="0x01" slot="0x00" function="0x0"/>
</interface>
```
PXE-E18: Server response timeout.
Error: Could not retrieve NBP size ...


Network Source: NAT config (Changes interface "type" and "source" only):
```
<interface type="network">
  <mac address="52:54:00:f3:76:f5"/>
  <source network="default"/>
  <model type="e1000e"/>
  <boot order="1"/>
  <address type="pci" domain="0x0000" bus="0x01" slot="0x00" function="0x0"/>
</interface>
```
Network Source: Bridge device w. Device name "virbr0" (changes interface "type" and "source" only)
```
<interface type="bridge">
  <mac address="52:54:00:f3:76:f5"/>
  <source bridge="virbr0"/>
  <model type="e1000e"/>
  <boot order="1"/>
  <address type="pci" domain="0x0000" bus="0x01" slot="0x00" function="0x0"/>
</interface>
```

Links:
- https://blog.scottlowe.org/2015/05/11/using-pxe-with-virt-install/
- https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/virtualization_host_configuration_and_guest_installation_guide/chap-virtualization_host_configuration_and_guest_installation_guide-libvirt_network_booting

### Errors

```
error: timeout: could not resolve hardware address.
error: you need to load the kernel first.

Press any key to continue...
```

## Using QEMU to Boot PXE

QEMU also has a built-in TFTP server, with root directory you provide
on comand line (as part of -netdev parameter). You also provide the
normally "delivered-by-DHCP" parameters like `bootfile=...` as part of
command line (-netdev) instead of using actual DHCP (In VBox this came
from config file).

Example script to run as `run-qemu -m 8192 -hda ~/pxebootdisk.vmdk`, reusing
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


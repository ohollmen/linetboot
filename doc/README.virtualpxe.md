# PXE Boot in Virtual Environments

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
- It does not internally implement a "virtual" TFTP server of its own
- It allows you to use existing DHCP+TFTP infra **directly** for PXE booting
  with minimum configuration in virt-manager itself.
- However it can run a dnsmasq instance with special self-generated config (`--conf-file=/var/lib/libvirt/dnsmasq/default.conf`) to have protected VM-env-only
DHCP server for the clients.


After creating a VM "stub" (even empty, unpartitioned, unformatted disk
is okay), you can toggle the VM to 1) be PXE bootable, 2) set boot priority
to PXE by: Left Navigation Pane: Boot Options => Boot Device Order => NIC: ... (Bring item up / prioritize item "NIC:..." using arrow-up button)

Already at the time of creating the VM (in wizard, step 1 of 5, in some versions of virt-manager, or does this depend on Non-wifi NIC being connected), there is an option
"Choose how you would like to install the operating system:" => "Network Boot (PXE)", so you could choose PXE boot already there.

### Running virt-manager + dnsmasq

virt-manager internally runs:
```
# Note theis generated may be combined with manually maintained config
# (fragment / partial config) from /etc/libvirt/dnsmasq/default.conf
/usr/bin/dnsmasq --conf-file=/var/lib/libvirt/dnsmasq/default.conf
```
XML Config:
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


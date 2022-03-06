# FAQ

#### Q: Can I use linetboot for non automated or semi-automated install
A: Yes, Strip auto=true from menu file `append` line. This should work at least for Ubuntu/Debian.
Get familiar with your distro linux commandline ooptions to do this. Generally leaving certain "aspects"
out in kickstart/preseed file (Installer config file) - in other words leaving the answers to certain istaller questions out - will make the installer go to
interactive mode and prompt the user to answer to these missing things. Linux installers rarely (and thus fairly) decide things on behalf of installing user, but it's all up to particular distro (and its version) behavior.

#### Q: Can I use another HTTP server if I suspect a problem with Express static file delivery ?
A: Yes you can, try using Python lightweight HTTP server (we override the port to be Express default port 3000 to avoid regenerating configs):

    python -m SimpleHTTPServer 3000

Note: This basic static file delivery mode of SimpleHTTPServer does not generate appropriate Kisckstart or preseed configs. To do this run the python SimpleHTTPServer for static file delivery and Express for install config generation concurrently on different ports.

#### Q: What happens if host on which I'm trying to install OS does not have its (Ansible) facts available ?
A: In the name off KISS priciple, current behaviour is Garbage in, garbage out. The Preseed or Kickstart output will be malformatted and your installer will either terminate or fall back to fully manual install mode. It would be nice if installers supported a mode where Preseed or KS config can send an error message displayed by installed with good high level reasoning for terminating (not allowing) installation (E.g. "we do not have sufficient information about your host to proceed with OS install. Please ...").

#### Q: Is linetboot limited to installing server installations ? can I install desktop Linux with ?
A: lineboot does not have any built in limitations installing Desktop linux. It seems Ubuntu/Canonical wrote a variant of Debian installer called Ubiquity, which may use a variant of Debian-Installer directives or behave differently. Testing current preseed (and creating necessay parametrizations) or creating variation of preseed template for Ubiquity install would be needed.

#### Q: Instead of pxelinux menu I'm getting black screen with text "boot:". What do I do ?

This happens < 5% of the time for reasons unknown to me.
Press tab character to get pxelinux boot option labels ("label ..." property in menu file) and type one that you want hoping that menu labels were made descriptive enough to meaningfully choose from.
If you get to know why this prompt-mode triggers instead of full arrow-key driven visual menu, let me know too.

#### Q: I cannot get pxelinux assisted install working with HTTP, do I have to use HTTP ?

No you can craft the pxelinux menu to by-pass the http based install. E.g. Ubuntu 18.04 (MATE) Desktop rejects HTTP, but supports NFS based install.
Fall back onto whatever is supported.

#### Q: I'm installing Dell iDRAC firmware update and get "Failed to start firmware update. Possible reason may be that Local Configuration using RACADM is disabled." - What's up with this ?
A: You could try installing newer BIOS update first - this helps in some cases.
Also adjusting iDRAC Settings => Services => Local Configuration => "Disable iDRAC ..." to "Disabled" helps.

#### Q: I try to loopmount, but get an error: mount: could not find any free loop device, what's this?

A: The loop mount "slots" have a corresponding device file in the file system. When there are no more numbered loop mount device
files left , this error triggers. Create more loop device files by:
```
# -m640 - perms, b special block dev, 7 = major (every loopN device), 8 = minor (match N in loopN) 
sudo mknod -m640 /dev/loop8 b 7 8
```

#### Q: Lineboot Newbie: Whats the best user account to use with Lineboot ?

To start and evaluate linetboot, use your own personal account (and own computer). You have (very likely) already done ssh-copy-id operation to create trust to between your
account + host and the machines you would manage. If you account homedirectory is on network drive (NFS or Samba), the machine where you
run Lineboot can be any machine that has access to your homedirectory and you can still take advantage of your personal SSH keys.
This makes Ansible facts collection (part of install) a breeze ! then proceed to gather facts by `ansible -m setup ....`
(See REAME.install.md for more details). Having passwordless SSH connectivity already established is an effort saver.

if you have a service account that has it's user SSH key copied to all your hosts, it's better to use it, and you can run linetboot
under that account (even on permanent basis).

  

#### Q: I'd need to to a single file change on otherwise perfect ISO. Do I need to take it copy its contents to filesystem and use it from there instead on the nice loop mount method ?

Not necessarily. Linux has a nice mount method called "overlay" which you could try for "patching files" on top of loop mount.
Using it starts by "mount -t overlay ..." (See also: `man mount`, https://wiki.archlinux.org/index.php/Overlay_filesystem or
alternatively "union filesystem"). A dummy example of overlaying a OS install recipe on top of (read-only) loop mount:
```
sudo mkdir /merged
mkdir /tmp/olay
mkdir /tmp/olay_work
echo "install-disk /dev/sda" > /tmp/olay/install_recipe.txt
# Mount overlayed into /merged
sudo mount -t overlay overlay -o lowerdir=/isomnt/archlinux/,upperdir=/tmp/olay/,workdir=/tmp/olay_work /merged
```
The downside is if loop mount already exists, a new dir (/merged) is created.

#### Q: I'm getting Error: listen EADDRINUSE: address already in use :::3000 and Linetboot does not start - what is happening ?

You already have one Linetboot (process) instance running and the tcp/ip port 3000 is in use by that server.
Grep the process list (e.g. by pattern "node") for the earlier instance and get rid of it (kill $PID).
Then start the new lineboot instance. If you used PM2 or systemd to launch the old instance, prefer to use them
to terminate earlier process, instead of "raw" kill.

#### Q: My PXE Linux Installer DHCP request is timing out. Preseed/kickstart (to set timeout) is not loaded yet. What to do about this chicken and egg problem ?

Whatever can be set in recipe (KS/Preseed) but needs to be set before loading it, can oftern be seton kernel command line (See your installer documenattion for details). In this case, se on kernel CLI (bootitem append-line. e.g. Debian/Ubuntu:) among other key-value parameters:
```
... netcfg/link_wait_timeout=30 netcfg/dhcp_timeout=60 ...

```
#### Q: My PC Is lacking PXE - can I get it to PXE Boot with additional HW ?

For USB-C There's an interesting Dell brandend ethernet dongle that claims to make
a non-PXE capable device to be able to PXE Boot (sold on Amazon): Dell Adaptor USB-C To Ethernet, DBQBCBC064 (PXE Boot). This device has mixed reviews for its
function for PXE boot.

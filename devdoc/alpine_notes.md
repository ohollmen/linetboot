# Alpine Installation

- Good  info (Packer related): https://wiki.alpinelinux.org/wiki/Packer_installation
  - Good explanations of installer, it's config ("answers") and install flow
- Alpine installer is a shell script called `setup-alpine` that
  gets run on install bootup
  - Quick mode: `setup-alpine -q`
  - Install by **answers** file: `setup-alpine -f answers`
  - Create (good defaults) answer file: `setup-alpine -c answers_fresh`
  - Help: `setup-alpine -h`
- "Answers file (e.g. "answers", common name) is a rudinemntary "Shell variables" file with install time settings / parameters
  - Installer is prepared to load it from HTTP server (e.g. packer / linetboot)
- Concept of "provisioners" (implemented by installer ?)
- Alpine setup-alpine script walks through /sbin/setup-* scripts (as explained in https://wiki.alpinelinux.org/wiki/Alpine_setup_scripts)
  - setup-keymap, setup-hostname, setup-interfaces, setup-dns, setup-timezone, setup-proxy, setup-apkrepos, setup-sshd, setup-ntp, setup-disk
  - Dee doc for paremeters of each setup / provisioner script
- Alpine interactive (default) login: `root` with NO password


Example "answers" file (from Alpine ".../Packer_installation" doc) thta can be
utilized with `setup-alpine -f answers`:
```
KEYMAPOPTS="us us"
HOSTNAMEOPTS="-n alpine"
INTERFACESOPTS="auto lo
iface lo inet loopback

auto eth0
iface eth0 inet dhcp
"
DNSOPTS="-n 8.8.8.8"
TIMEZONEOPTS="-z UTC"
PROXYOPTS="none"
APKREPOSOPTS="-1"
SSHDOPTS="-c openssh"
NTPOPTS="-c openntpd"
DISKOPTS="-L -m sys /dev/vda"
```

# References

- Google: alpine answers file example
- Alpine Installer: https://docs.alpinelinux.org/user-handbook/0.1a/Installing/setup_alpine.html
- How Alpine Repositories work: https://docs.alpinelinux.org/user-handbook/0.1a/Installing/manual.html#_repositories
- Installer parameters (in answers file): https://docs.alpinelinux.org/user-handbook/0.1a/Installing/manual.html
- Alpine setup scripts (In /sbin/setup-*): https://wiki.alpinelinux.org/wiki/Alpine_setup_scripts
- Alpine PXE Boot: https://wiki.alpinelinux.org/wiki/PXE_boot
- https://serverfault.com/questions/1107313/run-script-after-booting-alpine-netboot


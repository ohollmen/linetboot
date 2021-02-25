# Migrating Linetboot instance

This document is merely a checklist for migrating a linetboot instance to a new new server host or user account.
I can be also be used to give your friend some encouraging sample data to show a realistic view to a up-n-running
Linetboot environment.

# Config and data Rsync

This section gives examples of syncing Linetboot Config and Data files to a remote location by rsync. Because
SSH transport of rsync is secure, this tutorial is applicable for migrating over the internet as well.

In tutorial we use variables $LINEBOOT_RHOST and $LINETBOOT_RHOME to reflect the remote host and the homedir path
under it respectively. Utilize these params as needed (with rsync be always careful with and aware of "trailing slash"
of the source parameter - man rsync if needed). If user is different on the other side rsync -a option is usually not good,
(-a equals -rlptgoD), so syncing ownership (-o/-g) should be left out, making -rlpt a better combo (-D, devices and
special files is most likely not applicable).
```
export LINETBOOT_RUSER=johnsmith
export LINETBOOT_RHOST=across.internet.com
export LINETBOOT_RHOME=/home/johnsmith
```

Host facts:
```
rsync -rlptv ~/hostinfo/ $LINETBOOT_RUSER@$LINETBOOT_RHOST:$LINETBOOT_RHOME/hostinfo/
```
SSH Keys
```
rsync -rlptv ~/.linetboot/sshkeys/ $LINETBOOT_RUSER@$LINETBOOT_RHOST:$LINETBOOT_RHOME/.linetboot/sshkeys/
```
Remote mgmt info
```
rsync -rlptv ~/hostrmgmt/ $LINETBOOT_RUSER@$LINETBOOT_RHOST:$LINETBOOT_RHOME/hostrmgmt/
```
Host OS Package Info
```
rsync -rlptv ~/hostpkginfo/ $LINETBOOT_RUSER@$LINETBOOT_RHOST:$LINETBOOT_RHOME/hostpkginfo
```

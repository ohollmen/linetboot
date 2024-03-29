# Misc notes on RH and Debian package Repos and Mirroring

## General about package repos aka "Mirrors"

Package repos can exist in few forms:
1. Official distribution repos in internet (served over http)
2. A replica of of internet repos served in local/internal network ("intranet", also served over http)
3. Repo(s) available on installation media (e.g. ISO image), which linetboot serves over http

The pros and cons of serving package repos from local/internal network vs. internet are:
- Local network will
  - (likely) provide much higher and more predictable performance
  - Not use your internet bandwidth/capacity while doing repetitive OS installations on potentially large number of machines
  - Require regular updates/package syncronizations as updates become available
    in internet "master" repos
- Internet repos will
  - potentially have more up-to-date packages as these are th "master" source
    of packages
  - (likely) have slower and less predictable performance and availability

The repo configuration is often / best expressed in (normalized) form:
- URL scheme http/https of the package trasport (usually combined as server url,
  all linux distributions use http as delivery mechanism)
- The server hostname (and possible port number) of the package repo service
- The (relative) URL path on the server under which all repo data is available

### Repo internal structure

Internally each repo has few key parts to it's internal structure:
- Possible top level config file / repo manifest (e.g. RedHat style
  .treeinfo INI format file, which also has section `[stage2]` in it pointing to an FS image linux root filesystem tree in it, e.g. `images/install.img`)
- Package index file mapping package names to their relative filenames within package repo (or ISO installation media)
  - Because filenames are relative the config and index files work (are interoperable) both in http repository and ISO media contexts (Linetboot exploits this interoperability to maximum by mounting ISO media as loop-mounts
  and serves these lopp-mounted filesystem areas over HTTP)


Usually all "meta files" (configurations, index files) are in plain text formats
(INI, XML, ...), while the packages (rpm, deb, apk) are binary files.

## RH Notes (8)

Files under repo/media root:
- images/install.img - Squashfs image with a "lean" Linux FS tree (etc/,lib/,...) under it (146MiB on centos6)
- images/updates.img - gzip file with few (2?) anaconda related python files (class packages) bundled on it (with a partially binary delimiter between file-fragments).
- Directories BaseOS and AppStream which each have subdirs:
  - Packages with single letter/single number labeled subdirs, each with rpm
    packages starting with that letter or number (e.g. 3 => 389-ds-base-1.4.3.34-...)
  - repodata - w. repomd.xml, which points to number of sqlite DBS and large
    xml files also located in the same directory
- EFI - a tree with Grub2 stuff
  - EFI/BOOT/BOOT.conf - RHEL Grub example boot menu
TODO:
- Clarify/Explain what is RH-style repodata/repomd.xml and
how it differs from (e.g.) ".treeinfo" (Everything starts at .treeinfo).
- What is boot var: inst.stage2 ? (.treeinfo has ini section [stage2] and
has one k-v: `mainimage = images/install.img`,, which is Squashfs image
 (See explanation above) However the inst.stage2=... must point to location which has a .treeinfo (INI) file
 

# Using CDROM Content as preseed mirror

Reverse engineered:
- The Ubuntu top level / root of ISO image has subdir path "pool/main/" under it.
  - Has "aphabet dirs" (hashed ?) under it with package named dirs under it.
- The Ubuntu mirror site http://us.archive.ubuntu.com/ has subdir (for bionic)
  - ubuntu/dists/bionic/ with main,multiverse,restricted,universe ... but content differs between mirror and CD/DVD.

## Debug Info: Setting mirror in Ubuntu, mirror stickyness

After installation Ubuntu remembers *the* mirror (provided by linetboot, ad-hoc) as authoritative mirror when running for example `sudo apt-get update`.
This causes errors like (long paste for later analysis, shows well what all is "tried"):
```
sudo apt-get update
Ign:1 http://10.85.233.180:3000/ubuntu18 bionic InRelease
Ign:2 http://10.85.233.180:3000/ubuntu18 bionic-updates InRelease
Ign:3 http://10.85.233.180:3000/ubuntu18 bionic-backports InRelease
Hit:4 http://10.85.233.180:3000/ubuntu18 bionic Release
Err:5 http://10.85.233.180:3000/ubuntu18 bionic-updates Release
  404  Not Found [IP: 10.85.233.180 3000]
Err:6 http://10.85.233.180:3000/ubuntu18 bionic-backports Release
  404  Not Found [IP: 10.85.233.180 3000]
Hit:8 http://security.ubuntu.com/ubuntu bionic-security InRelease
Reading package lists... Done         
E: The repository 'http://10.85.233.180:3000/ubuntu18 bionic-updates Release' does not have a Release file.
N: Updating from such a repository can't be done securely, and is therefore disabled by default.
N: See apt-secure(8) manpage for repository creation and user configuration details.
E: The repository 'http://10.85.233.180:3000/ubuntu18 bionic-backports Release' does not have a Release file.
N: Updating from such a repository can't be done securely, and is therefore disabled by default.
N: See apt-secure(8) manpage for repository creation and user configuration details.
W: Skipping acquire of configured file 'universe/binary-i386/Packages' as repository 'http://10.85.233.180:3000/ubuntu18 bionic InRelease' doesn't have the component 'universe' (component misspelt in sources.list?)
W: Skipping acquire of configured file 'universe/binary-amd64/Packages' as repository 'http://10.85.233.180:3000/ubuntu18 bionic InRelease' doesn't have the component 'universe' (component misspelt in sources.list?)
W: Skipping acquire of configured file 'universe/i18n/Translation-en_US' as repository 'http://10.85.233.180:3000/ubuntu18 bionic InRelease' doesn't have the component 'universe' (component misspelt in sources.list?)
W: Skipping acquire of configured file 'universe/i18n/Translation-en' as repository 'http://10.85.233.180:3000/ubuntu18 bionic InRelease' doesn't have the component 'universe' (component misspelt in sources.list?)
W: Skipping acquire of configured file 'universe/cnf/Commands-amd64' as repository 'http://10.85.233.180:3000/ubuntu18 bionic InRelease' doesn't have the component 'universe' (component misspelt in sources.list?)
W: Skipping acquire of configured file 'multiverse/binary-amd64/Packages' as repository 'http://10.85.233.180:3000/ubuntu18 bionic InRelease' doesn't have the component 'multiverse' (component misspelt in sources.list?)
W: Skipping acquire of configured file 'multiverse/binary-i386/Packages' as repository 'http://10.85.233.180:3000/ubuntu18 bionic InRelease' doesn't have the component 'multiverse' (component misspelt in sources.list?)
W: Skipping acquire of configured file 'multiverse/i18n/Translation-en_US' as repository 'http://10.85.233.180:3000/ubuntu18 bionic InRelease' doesn't have the component 'multiverse' (component misspelt in sources.list?)
W: Skipping acquire of configured file 'multiverse/i18n/Translation-en' as repository 'http://10.85.233.180:3000/ubuntu18 bionic InRelease' doesn't have the component 'multiverse' (component misspelt in sources.list?)
W: Skipping acquire of configured file 'multiverse/cnf/Commands-amd64' as repository 'http://10.85.233.180:3000/ubuntu18 bionic InRelease' doesn't have the component 'multiverse' (component misspelt in sources.list?)
```

/etc/apt/sources.list

This means we have to replace /etc/apt/sources.list with original.

## Using apt-mirror (from pkg apt-mirror)

apt-mirror is a utility to mirror Debian/Ubuntu internet mirrors locally.

- Install sudo apt-get install apt-mirror
- See config: /etc/apt/mirror.list
- Must configure: set base_path           /var/spool/apt-mirror
- Downloads whole remote SW repository, e.g. 45GB of SW packages


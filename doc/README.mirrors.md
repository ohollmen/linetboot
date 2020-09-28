# Misc notes on RH and Debian package Repos and Mirroring

# Using CDROM Content as preseed mirror

Reverse engineered:
- The Ubuntu top level / root of CDROM has subdir path "pool/main/" under it.
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


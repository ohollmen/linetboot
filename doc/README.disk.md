# Disk Partitioning

Notes on disk partitioning, especially when it comes to installing an OS in an automated way.
Thie following describes creating a rather simple, barebones ("minimum feasible:) partition table and partition layout.
- partition table: MBR / msdos (*Not* EFI)
- Partitions:
  - Debian/Ubuntu: root+swap
  - RH/Centos: boot+root+swap (Can RH do w/o boot ? Seems to be preferred anyways)

Overall notes on disk paritioning descriptions in RH/Kickstart, Debian/Preseed automated OS installer environments:

Redhat / kickstart:

- Good: Kickstart makes partitioning easy with simple commands, no-nonsense, it just seems to work.
    Especially clearing partitions and creating partition seems to be easy
- Bad: RH culture seems to insist and obsess aboult Logical volume manager (LVM), and if you are not explicit about what you want,
   LVM volumes will be created. Luckily using commands "clearpart" + "part" with explicit (enough) parameters (e.g. with 
   `--asprimary` and `--fstype=...`) seems to *not* create LVM volumes.
- Disk and partition commands are few and clear, easy to learn.

Debian / Preseed:

- There's a lot of d-i partman*/... directives, documentation is scarce and parameters seem to interact with (depend on)
  other params nastily and when combinations are vast and weakly documented, you have a lot of trial and error.
- There is a d-i built in partitioning directive and respecive partitioning "language" (separate from row oriented d-i language).

Brief descriptions of other OS:s and Linux distros:

- SuSe Linux has an XML based recipe file format containing Disk partitioning and formatting rules as one of the sections
- Windows - very similar to SuSe (XML)
- BSD / PCBSD / FreeBSD - Simple partitioning and formatting rules like RH/Centos kickstart

# Partitioning tools

While Anakonda and Debian Installer provide facilities for explicit and automatic (heuristical) partitioning there are other
"outside" tools that could be possibly used and triggered from KS pre/post commands or Debian early_ and late_ commands.

- Plain `fdisk` (likely included on installer ramdisk) can be run in scripted form, even if not originally meant for it.
- `sfdisk` is a scripted fdisk that allows to dump existing partition layout as a runnable script or run a script on a particular disk.
- `parted` - Interactive console based partition editor similar to graphical gparted, but according to various discussions has been stripped
  of important functionality in the recent versions (e.g. resizing filesystems+partitions, not relevant on fresh OS installation).

# Other tools

- From anaconda journal.log:
  - dumpe2fs -h /dev/mapper/live-rw
  - resize2fs -P /dev/mapper/live-rw

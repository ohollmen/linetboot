# Mounting Partitions on a multi-partition image

Images with single filesystem, no partition table are easy to mount
with universal command pattern:

```
sudo mount -o loop /my/image /mount/point
``` 
This patter works as Linux kernel is extremely skilled at detecting filesystem
types and the option -t fstype is not needed most of the time for this reason.

However with images containing a partition table and multiple partitions - with each containing a filesystem - there is ambiguity on which partition within image to mount .

Linux wants the partition to mount to be addressed by its start byte offset within image.

In an UNIX/Linux tradition, the offset is to be resolved by using another specialized tool for the purpose (plus some additional computation to come up with the final ofsset figure usable for the mount command).

By inspecting the image with the famous partition viewer/editor tool `fdisk` one can inspect the start offsets of partitions in terms of 512 byte offsets:
```
sudo fdisk -l stretch-minimal-rockpro64-0.7.11-1075-arm64.img
Disk stretch-minimal-rockpro64-0.7.11-1075-arm64.img: 2 GiB, 2144337920 bytes, 4188160 sectors
Units: sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disklabel type: gpt
Disk identifier: FB84DCAE-4E0E-486F-890C-A979BEECCFF9

Device                                            Start     End Sectors  Size Type
stretch-minimal-rockpro64-0.7.11-1075-arm64.img1     64    8063    8000  3.9M Linux filesystem
stretch-minimal-rockpro64-0.7.11-1075-arm64.img2   8064    8191     128   64K Linux filesystem
stretch-minimal-rockpro64-0.7.11-1075-arm64.img3   8192   16383    8192    4M Linux filesystem
stretch-minimal-rockpro64-0.7.11-1075-arm64.img4  16384   24575    8192    4M Linux filesystem
stretch-minimal-rockpro64-0.7.11-1075-arm64.img5  24576   32767    8192    4M Linux filesystem
stretch-minimal-rockpro64-0.7.11-1075-arm64.img6  32768  262143  229376  112M Microsoft basic data
stretch-minimal-rockpro64-0.7.11-1075-arm64.img7 262144 4186111 3923968  1.9G Linux filesystem
```
For example, if the last 1.9G partition starting at 262144 (512 byte blocks) is of interest,
the small computation `512 * 262144 = 134217728` gives the final offset.
Utilizing that byte offset figure in mount command becomes:
```
sudo mount -o loop,offset=134217728 stretch-minimal-rockpro64-0.7.11-1075-arm64.img /storage/tmpimage
```
This parameter can be also used in the /etc/fstab "mount options" field (fourth field, see man fstab for details).

# Refs

https://forum.pine64.org/showthread.php?tid=6814




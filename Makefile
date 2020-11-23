# Miscellaneous useful ops when setting up a PXE Install Environment
# Note: This example file is not meant to be fully universal, parametrized and widely applicable Makefile 
# but will merely give you ideas on how to run various ops.
TFTP_HOST=root@banana2
# TFTP Root directories (for case remote and local)
# Defaults are Examples of Debian and RedHat TFTP Paths
TFTP_PATH=/srv/tftp/
TFTP_PATH_LOCAL=/var/lib/tftpboot/
HTTP_ROOT=/var/www/html
# https://stackoverflow.com/questions/3860137/how-to-get-pid-of-my-make-command-in-the-makefile
# Also $$PPID of a command here would give make process id.
PXETEMPDIR := $(shell mktemp -u)
# PXELINUX
PXEMODPATH=/usr/lib/syslinux/modules/bios
PXEMODULES=ldlinux.c32 libutil.c32 menu.c32 vesamenu.c32 libcom32.c32
# IPXE Binaries (/usr/lib/ipxe/ipxe.iso needed ?)
IPXEBINS=/usr/lib/ipxe/ipxe.efi /usr/lib/ipxe/ipxe.lkrn /usr/lib/ipxe/ipxe.pxe /usr/lib/ipxe/undionly.kkpxe /usr/lib/ipxe/undionly.kpxe
# 
UBU18_IMAGE_URL=http://cdimage.ubuntu.com/releases/18.04.1/release/ubuntu-18.04.1-server-amd64.iso
UEFI_B_PATH=/usr/lib/SYSLINUX.EFI/efi64
MEMDISK_PATH=/usr/lib/syslinux/memdisk
UEFI_LDLINUX=/usr/lib/syslinux/modules/efi64/ldlinux.e64
UEFI_RSYNC=rsync -av $(UEFI_B_PATH) $(TFTP_HOST):$(TFTP_PATH)/
LINETDOC_PATH=/tmp/linetdoc
LINETDOCS=prereq configure bootmedia bootmenu changes faq troubleshoot
# # TODO: Use python markdown_py to support tables ?
MDCONV=markdown

all:
	# TODO: Grep for the targets: grep -P ^\w+: Makefile
	echo "Choose one of the valid targets" `grep -P '^\w+:' Makefile`
# Copy Boot menu config /pxelinux.cfg/default to place in TFTP server
default: gendefault transdefault
gendefault: FORCE
	echo "Make default Boot config file"
	# test if mustache executable is there (Error: run npm install ...)
	cat global.conf.json | ./node_modules/mustache/bin/mustache - ./tmpl/default.installer.menu.mustache > /tmp/default
transdefault: FORCE
	echo "Transfer boot menu to TFTP Server"
	# Rsync to TFTP Server
	rsync -av /tmp/default $(TFTP_HOST):$(TFTP_PATH)/pxelinux.cfg/
	# UEFI 64:
	rsync -av /tmp/default $(TFTP_HOST):$(TFTP_PATH)/efi64/pxelinux.cfg/
	# Remove /tmp/default (Should leave for later inspection ?)
	rm /tmp/default
# Make Boot menu for a local system hosting the TFTP
default_local: gendefault
	echo "Copy to local TFTP Server path"
	# Backup !
	#if [ -e /tmp/default $(TFTP_PATH_LOCAL)/pxelinux.cfg/default ]; then cp $(MEMDISK_PATH) $(PXETEMPDIR)/memdisk; fi
	cp -p /tmp/default $(TFTP_PATH_LOCAL)/pxelinux.cfg/
	rm /tmp/default
# Fake target to set as dependency to force another target to run (despite what Make thinks about "is up to date" situation)
FORCE:
download_ubu18:
	wget $(UBU18_IMAGE_URL) -O /usr/local/iso/`basename $(UBU18_IMAGE_URL)`
network_hack:
	sudo cp -p preseed_dhcp_hack.sh $(HTTP_ROOT)/
	ls -al $(HTTP_ROOT)/
# Create a dir structure "skeleton" and Install all  and pxelinux and syslinux binaries plus
# their modules into localhost staging directory and rsync it to a final TFTP
# location.
pxelinux_install:
	# Above we made a dryrun, so now really make it.
	mkdir $(PXETEMPDIR)
	mkdir $(PXETEMPDIR)/efi64
	mkdir -p $(PXETEMPDIR)/efi64/pxelinux.cfg/
	echo "Using temporary directory:" $(PXETEMPDIR)
	# test presence of $(PXETEMPDIR)
	#if [ ! -d $(PXETEMPDIR) ]; then exit 1; fi
	cp /usr/lib/PXELINUX/lpxelinux.0 $(PXETEMPDIR)
	#cd /usr/lib/syslinux/modules/bios
	# UEFI Boot files: Simple, brute-force, single-step
	# /usr/lib/SYSLINUX.EFI/efi64/
	# if [ -d /binX ]; then echo Hello; fi
	if [ -d $(UEFI_B_PATH) ]; then cp $(UEFI_B_PATH)/syslinux.efi $(PXETEMPDIR)/efi64; fi
	# MEMDISK_PATH
	if [ -e $(MEMDISK_PATH) ]; then cp $(MEMDISK_PATH) $(PXETEMPDIR)/memdisk; fi
	if [ -e $(MEMDISK_PATH) ]; then cp $(MEMDISK_PATH) $(PXETEMPDIR)/efi64/memdisk; fi
	# Need also $(UEFI_LDLINUX) /usr/lib/syslinux/modules/efi64/ldlinux.e64
	cp -p $(UEFI_LDLINUX) $(PXETEMPDIR)/efi64
	cp -p /usr/lib/syslinux/modules/efi64/libcom32.c32  $(PXETEMPDIR)/efi64
	cp -p /usr/lib/syslinux/modules/efi64/libutil.c32   $(PXETEMPDIR)/efi64
	cp -p /usr/lib/syslinux/modules/efi64/vesamenu.c32  $(PXETEMPDIR)/efi64
	# Menu / config
	# These seem to be no good for AMI by log traces
	#cp -p tmpl/grub.cfg.mustache $(PXETEMPDIR)/efi64/grub.cfg
	#cp -p tmpl/grub.cfg.mustache $(PXETEMPDIR)/efi64/syslx64.cfg
	#cp -p tmpl/grub.cfg.mustache $(PXETEMPDIR)/efi64/pxelinux.cfg/default
	ls -alR $(PXETEMPDIR)
	# menu.c32 Not needed ?
	# Also:
	#cp $(PXEMODPATH)/{ldlinux,libutil,menu,vesamenu,libcom32}.c32 $(PXETEMPDIR)
	#cp $(PXEMODULES) $(PXETEMPDIR)
	cd  $(PXEMODPATH) && cp $(PXEMODULES) $(PXETEMPDIR)
	mkdir -p $(PXETEMPDIR)/pxelinux.cfg/
	ls -alR $(PXETEMPDIR)
	#touch $(PXETEMPDIR)/pxelinux.cfg/default
	# Copy to TFTP Server (contents of)
	rsync -av $(PXETEMPDIR)/ $(TFTP_HOST):$(TFTP_PATH)/
ipxe_install:
	mkdir $(PXETEMPDIR)
	cp -p $(IPXEBINS) $(PXETEMPDIR)
	rsync -av $(PXETEMPDIR)/ $(TFTP_HOST):$(TFTP_PATH)/
dia:
	# In Debian/Ubuntu /usr/bin/plantuml is a nice wrapper
	# to avoid starting by java -jar plantuml.jar ...
	plantuml doc/netbootseq.plantuml
	plantuml doc/recipegen.plantuml
	eog doc/netbootseq.png doc/recipegen.png
test: FORCE
	./test/test_http.sh
# Create a default config in ~/.linetboot of current user.
dotlinetboot:
	@cp ./global.conf.json ~/.linetboot/global.conf.json
	# >> ~/.linetboot/hosts
	@[ ! -f "~/.linetboot/hosts" ] && echo "# Add hosts with fqdn in this file" 
	# Create empty stub of IP translation file
	# [ ! -f ~/.linetboot/iptrans.json ] && echo "{}" > ~/.linetboot/iptrans.json
	@mkdir -p ~/.linetboot/sshkeys
	@mkdir -p ~/.linetboot/tmpl
	@echo "Copying PXE (preseed,kickstart) Install templates for you to customize"
	@cp ./tmpl/* ~/.linetboot/tmpl
	@[ ! -f "~/.linetboot/initialuser.conf.json" ] && cp ./initialuser.conf.json ~/.linetboot/initialuser.conf.json
	@echo "Set following env variables in your ~/.bashrc (or equivalent shell config)"
	#@echo "(Note: Change /home/ to /Users/ on Mac!)"
	#@echo "export LINETBOOT_GLOBAL_CONF=$(HOME)/.linetboot/global.conf.json"
	#@echo "export LINETBOOT_IPTRANS_MAP=$(HOME)/.linetboot/iptrans.json"
	#@echo "export LINETBOOT_USER_CONF=$(HOME)/.linetboot/user.conf.json"
	#@echo "export FACT_PATH=$(HOME)/hostinfo"
	@ls -al ~/.linetboot
	
jsdoc: FORCE
	jsdoc linetboot.js -R README.md -c doc/.jsdoc.conf.json
	#mkdir -p out/doc; cd out/doc; [ ! -L "netbootseq.png" ] && ln -s ../../doc/netbootseq.png netbootseq.png
	mkdir -p out/doc; cd out/doc; if [ ! -L "netbootseq.png" ]; then ln -s ../../doc/netbootseq.png netbootseq.png; fi
htmldoc: FORCE
	if [ ! -d $(LINETDOC_PATH) ]; then mkdir $(LINETDOC_PATH); fi
	$(MDCONV) README.md > $(LINETDOC_PATH)/README.html
	#$(MDCONV) doc/README.prereq.md > $(LINETDOC_PATH)/README.prereq.html
	#$(MDCONV) doc/README.configure.md > $(LINETDOC_PATH)/README.configure.html
	#$(MDCONV) doc/README.bootmedia.md > $(LINETDOC_PATH)/README.bootmedia.html
	#$(MDCONV) doc/README.troubleshoot.md > $(LINETDOC_PATH)/README.troubleshoot.html
	# TODO: User something to add style for preview
	for docbn in $(LINETDOCS); \
	do \
	  echo "Doc BN:: $$docbn"; \
	  $(MDCONV) doc/README.$$docbn.md > $(LINETDOC_PATH)/README.$$docbn.html; \
	  cat little.css >> $(LINETDOC_PATH)/README.$$docbn.html; \
	done

	@ls -al $(LINETDOC_PATH)
	echo "Point your browser to: file://$(LINETDOC_PATH)"
mkmediadir:
	#if 
	cd /isomnt; sudo mkdir centos6 centos7 ubuntu18 ubuntu18dt ubuntu20 arch2019 \
	   clzilla freebsd12 freedos1 gparted opensuse_tw_64

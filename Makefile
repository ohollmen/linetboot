# Miscellaneous useful ops when setting up a PXE Install Environment
TFTP_HOST=root@banana2
TFTP_PATH=/srv/tftp/
HTTP_ROOT=/var/www/html
# https://stackoverflow.com/questions/3860137/how-to-get-pid-of-my-make-command-in-the-makefile
# Also $$PPID of a command here would give make process id.
PXETEMPDIR := $(shell mktemp -u)
PXEMODPATH=/usr/lib/syslinux/modules/bios
PXEMODULES=ldlinux.c32 libutil.c32 menu.c32 vesamenu.c32 libcom32.c32
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
	# Remove /tmp/default (Should leave for later inspection ?)
	rm /tmp/default
# Fake target to set as dependency to force another target to run (despite what Make thinks about "is up to date" situation)
FORCE:
download_ubu18:
	wget 
network_hack:
	sudo cp -p preseed_dhcp_hack.sh $(HTTP_ROOT)/
	ls -al $(HTTP_ROOT)/
pxelinux_install:
	# Above we made a dryrun, so now really make it.
	mkdir $(PXETEMPDIR)
	echo "Using temporary directory:" $(PXETEMPDIR)
	# test presence of $(PXETEMPDIR)
	#if [ ! -d $(PXETEMPDIR) ]; then 
	cp /usr/lib/PXELINUX/lpxelinux.0 $(PXETEMPDIR)
	#cd /usr/lib/syslinux/modules/bios
	
	# menu.c32 Not needed ?
	# Also:
	#cp $(PXEMODPATH)/{ldlinux,libutil,menu,vesamenu,libcom32}.c32 $(PXETEMPDIR)
	#cp $(PXEMODULES) $(PXETEMPDIR)
	cd  $(PXEMODPATH) && cp $(PXEMODULES) $(PXETEMPDIR)
	mkdir -p $(PXETEMPDIR)/pxelinux.cfg/
	ls -alR $(PXETEMPDIR)
	#touch $(PXETEMPDIR)/pxelinux.cfg/default
	# Copy to FTP Server (contents of)
	rsync -av $(PXETEMPDIR)/ $(TFTP_HOST):$(TFTP_PATH)/
dia:
	# In Debian/Ubuntu /usr/bin/plantuml is a nice wrapper
	# to avoid starting by java -jar plantuml.jar ...
	plantuml doc/netbootseq.plantuml
	eog doc/netbootseq.png
test: FORCE
	./test/test_http.sh

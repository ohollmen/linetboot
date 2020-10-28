:: Test snippet to see if this file gets launched.
:: TEMPLATE_WITH: global
:: Load this: /scripts/start.cmd
:: Seems to tolerate bare "\n" fine.
:: cmd.exe
:: pause

:: echo "Hello and welcome to Windows install"
:: Note: after WInPE boots the main drive seems to be x:
:: and active dir seems to be x:\windows\system32
dir x:\
:: Detect devices and load drivers (\windows\system32\wpeinit.exe)
wpeinit.exe
:: Enable (TCP/IP) Networking (set user-class: /setclassid myclass)
ipconfig.exe
:: Mount final install network share
:: Pass dummy creds to succeed /user:user pass
net use I: \\{{ smbserver }}\isomnt /user:user pass
:: Launch wget and get Autounttend.xml from http ?
:: (Win binary avail. (e.g.) https://eternallybored.org/misc/wget/ - EXE)
:: Note: If you get "Access is denied", make sure wget.exe is executable at
:: samba drive end (chmod a+x wget.exe)
I:\wget.exe http://{{httpserver}}/Autounattend.xml -O X:\Autounattend.xml
dir X:\*.xml
:: Run installer from network drive
:: Pops up a "Windows Setup" dialog with lang, time/curr fmts and KB settings
:: and button to proceed (Next). Does not seem to run A..xml
:: (even is in same but not current dir) as the settings are in
:: A...xml
:: setup.exe Accepts /unattend:filename option
:: Autounattend.xml from various sources
:: 1) From within samba server side loop mount (ro)
:: I:\win2019\setup.exe /unattend:I:\win2019\Autounattend.xml
:: 2) From top of Samba drive (modifiable)
:: I:\win2019\setup.exe /unattend:I:\Autounattend.xml
:: 3) Autounattend.xml downloaded from Lineboot (may be host-tailored)
I:\win2019\setup.exe /unattend:X:\Autounattend.xml
:: If run from x:\ rename setup.exe.orig

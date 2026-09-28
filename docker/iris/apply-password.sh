#!/bin/bash
# Run by iris-main once IRIS is up (see start.sh): IRIS_PASSWORD becomes the password of every
# enabled account but CSPSystem (the Web Gateway signs in with it) and UnknownUser, the accounts
# the image build gave SYS. IRIS reads the password from its own environment, so it is never
# written to a file, a command line or the log. A password IRIS's rules refuse (by default 3 to 32
# letters, digits and punctuation) is reported, and the accounts keep the one they had.
# One statement per line: iris session reads its input line by line.
iris session IRIS -U %SYS <<'OBJECTSCRIPT'
Set pw=$System.Util.GetEnviron("IRIS_PASSWORD"),n=0,failed=0
Set rs=##class(%SQL.Statement).%ExecDirect(,"SELECT Name FROM Security.Users WHERE Enabled = 1 AND Name NOT IN ('CSPSystem','UnknownUser')")
While rs.%Next() { Kill p  Set u=rs.%Get("Name"),p("Password")=pw,p("ChangePassword")=0,sc=##class(Security.Users).Modify(u,.p)  If sc { Set n=n+1 } Else { Set failed=failed+1  Write "Aperture image: IRIS_PASSWORD not set for ",u,": ",$system.Status.GetErrorText(sc),! } }
Write "Aperture image: IRIS_PASSWORD is the password of ",n," enabled accounts",$Select(failed:", "_failed_" refused it",1:""),!
Kill pw,p
Halt
OBJECTSCRIPT

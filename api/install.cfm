<cfsetting enablecfoutputonly="true" showdebugoutput="false" />
<cfscript>
  lib = new lib();
  wantsRun = isDefined("url.run") && url.run == "1";
  text = "";

  if (!wantsRun) {
    text = "Daily beacon setup" & chr(10) & chr(10)
      & "Add ?run=1 to this URL to create the tables in the database behind the" & chr(10)
      & "datasource named in api/lib.cfc (default: dailybeacon)." & chr(10) & chr(10)
      & "Then open api/ping.cfm to confirm all three tables are there." & chr(10)
      & "Delete api/install.cfm once setup has succeeded." & chr(10);
  } else {
    outcome = lib.install();
    text = (outcome.ok ? "Setup finished." : "Setup failed.") & chr(10) & chr(10)
      & arrayToList(outcome.report, chr(10)) & chr(10) & chr(10)
      & (outcome.ok ? "Now open api/ping.cfm, then delete this file." : "Fix the error above and run this page again.") & chr(10);
  }
</cfscript>
<cfheader name="Cache-Control" value="no-store" />
<cfcontent type="text/plain; charset=utf-8" variable="#text#" />

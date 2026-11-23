<cfsetting enablecfoutputonly="true" showdebugoutput="false" />
<cfscript>
  lib = new lib();
  result = lib.ping();
  statusText = result.status == 200 ? "OK" : "Server Error";
</cfscript>
<cfheader statuscode="#result.status#" statustext="#statusText#" />
<cfheader name="Cache-Control" value="no-store" />
<cfcontent type="application/json; charset=utf-8" reset="false" />
<cfoutput>#serializeJSON(result.body)#</cfoutput>

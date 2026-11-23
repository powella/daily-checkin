<cfsetting enablecfoutputonly="true" showdebugoutput="false" />
<cfscript>
  lib = new lib();
  result = lib.ping();
  statusText = result.status == 200 ? "OK" : "Server Error";
</cfscript>
<cfheader statuscode="#result.status#" statustext="#statusText#" />
<cfheader name="Content-Type" value="application/json; charset=utf-8" />
<cfheader name="Cache-Control" value="no-store" />
<cfcontent type="application/json; charset=utf-8" variable="#serializeJSON(result.body)#" />

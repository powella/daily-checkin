<cfsetting enablecfoutputonly="true" showdebugoutput="false" />
<cfscript>
  lib = new lib();
  result = lib.sync();
  statusText = "Server Error";
  if (result.status == 200) statusText = "OK";
  else if (result.status == 400) statusText = "Bad Request";
  else if (result.status == 405) statusText = "Method Not Allowed";
</cfscript>
<cfheader statuscode="#result.status#" statustext="#statusText#" />
<cfheader name="Cache-Control" value="no-store" />
<cfheader name="X-Content-Type-Options" value="nosniff" />
<cfcontent type="application/json; charset=utf-8" reset="false" />
<cfoutput>#serializeJSON(result.body)#</cfoutput>

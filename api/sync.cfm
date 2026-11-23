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
<cfheader name="Content-Type" value="application/json; charset=utf-8" />
<cfheader name="Cache-Control" value="no-store" />
<cfheader name="X-Content-Type-Options" value="nosniff" />
<cfcontent type="application/json; charset=utf-8" variable="#serializeJSON(result.body)#" />

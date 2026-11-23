component output="false" {

  this.name = "dailyBeacon";
  this.sessionManagement = false;
  this.clientManagement = false;
  this.setClientCookies = false;

  // Adobe's serializeJSON uppercases struct keys by default. The page reads
  // them as ok, error, you, circles, countries and so on, so keep their case.
  this.serialization.preserveCaseForStructKey = true;

  // ---------------------------------------------------------------------------
  // Anything that escapes a try/catch lands here, so the API never answers with
  // ColdFusion's built-in error page: that page prints the template path and a
  // full stack trace. The browser gets one short JSON object; the real message
  // and detail go to the ColdFusion log.
  //
  // Note that handling an error here also stops ColdFusion from setting the 500
  // status itself, which is why the status is set explicitly below.
  // ---------------------------------------------------------------------------
  public void function onError(any exception, string eventName) {

    // Log first, and never let logging trouble replace the answer.
    try {
      var detail = "";
      if (isStruct(arguments.exception)) {
        detail = structKeyExists(arguments.exception, "message") ? arguments.exception.message : "";
        if (structKeyExists(arguments.exception, "detail") && len(arguments.exception.detail)) {
          detail &= " | " & arguments.exception.detail;
        }
      }
      writeLog(
        file = "dailybeacon",
        type = "error",
        text = "onError (" & arguments.eventName & "): " & detail
      );
    } catch (any logError) {
      // Nothing useful to do if even the log failed.
    }

    // If headers or part of the body are already on the wire there is no way to
    // send a clean JSON answer; stop instead of appending to a broken response.
    var committed = true;
    try {
      committed = getPageContext().getResponse().isCommitted();
    } catch (any pageError) {
      committed = true;
    }
    if (committed) {
      abort;
    }

    try {
      // Drop any half-written output, then send the one thing the client reads.
      getPageContext().getResponse().reset();
      cfheader(statuscode = 500, statustext = "Server Error");
      cfheader(name = "Cache-Control", value = "no-store");
      cfheader(name = "Content-Type", value = "application/json; charset=utf-8");
      writeOutput(serializeJSON({
        ok: false,
        error: "The server hit an error. Try again shortly."
      }));
    } catch (any writeError) {
      // The response is beyond saving at this point.
    }

  }

}

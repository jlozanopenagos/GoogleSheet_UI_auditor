/**
 * ==============================================================================
 * Google Apps Script: Enhanced Web App Endpoint for GoogleSheet_UI_auditor
 * ==============================================================================
 * 
 * Capabilities:
 * 1. doGet: Reads columns A through I (?id=<SPREADSHEET_ID>&gid=<TAB_GID>)
 *    - Automatically detects columns: ID, expression, script, SCRIPT_CHANGED,
 *      script_ready, script_date, video_ready, video_date, and short_description (Column I).
 *    - Guarantees Column I ("short_description") is present and mapped.
 *    - Formats dates as DD/MM/YY (e.g. "31/01/26").
 * 
 * 2. doPost: In-place row updates by ID:
 *    - action: "update_script": Updates Column D (SCRIPT_CHANGED), Column E (script_ready),
 *      and Column F (script_date) for the matching ID in place.
 *    - action: "update_description": Updates Column I (short_description) in place.
 *    - Automatically resolves tabs by gid or tab name.
 * 
 * ==============================================================================
 */

function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};

    // 1. Resolve spreadsheet by ID
    var targetId = params.id || params.spreadsheet_id || params.sheet_id;
    var ss;
    if (targetId && String(targetId).trim()) {
      ss = SpreadsheetApp.openById(String(targetId).trim());
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    if (!ss) {
      return createJsonResponse({ status: "error", message: "Spreadsheet not found" }, 404);
    }

    // 2. Resolve sheet tab by gid or name
    var sheet = resolveSheetTab(ss, params);
    if (!sheet) {
      return createJsonResponse({ status: "error", message: "Sheet tab not found" }, 404);
    }

    // 3. Ensure Column I header exists
    ensureColumnIHeader(sheet);

    // 4. Read sheet data
    var data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) {
      return createJsonResponse({
        status: "success",
        spreadsheet_name: ss.getName(),
        sheet_name: sheet.getName(),
        count: 0,
        data: []
      });
    }

    // 5. Header row (Row 1)
    var headers = data[0].map(function(h) { return String(h || "").trim(); });
    var colMap = resolveColumnIndexes(headers);

    // 6. Map rows to structured JSON records
    var records = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var idVal = String(row[colMap.id] || "").trim();
      if (!idVal) continue;

      var record = {
        ID: idVal,
        row_number: r + 1,
        expression: colMap.expression !== -1 ? String(row[colMap.expression] || "").trim() : "",
        script: colMap.script !== -1 ? String(row[colMap.script] || "").trim() : "",
        SCRIPT_CHANGED: colMap.script_changed !== -1 ? String(row[colMap.script_changed] || "").trim() : "",
        script_ready: colMap.script_ready !== -1 ? Boolean(row[colMap.script_ready]) : false,
        script_date: colMap.script_date !== -1 ? formatCellDate(row[colMap.script_date]) : "",
        video_ready: colMap.video_ready !== -1 ? Boolean(row[colMap.video_ready]) : false,
        video_date: colMap.video_date !== -1 ? formatCellDate(row[colMap.video_date]) : "",
        short_description: colMap.short_description !== -1 ? String(row[colMap.short_description] || "").trim() : ""
      };

      records.push(record);
    }

    return createJsonResponse({
      status: "success",
      spreadsheet_name: ss.getName(),
      sheet_name: sheet.getName(),
      count: records.length,
      data: records
    });

  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString(), stack: err.stack }, 500);
  }
}

function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return createJsonResponse({ status: "error", message: "Invalid JSON: " + parseErr.toString() }, 400);
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    // 1. Resolve spreadsheet by ID
    var targetId = payload.spreadsheet_id || payload.id || (e && e.parameter ? (e.parameter.id || e.parameter.spreadsheet_id) : null);
    var ss;
    if (targetId && String(targetId).trim()) {
      ss = SpreadsheetApp.openById(String(targetId).trim());
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    if (!ss) {
      return createJsonResponse({ status: "error", message: "Spreadsheet not found" }, 404);
    }

    // 2. Resolve sheet tab by gid or name
    var sheet = resolveSheetTab(ss, payload, e && e.parameter ? e.parameter : null);
    if (!sheet) {
      return createJsonResponse({ status: "error", message: "Sheet tab not found" }, 404);
    }

    // 3. Ensure Column I header exists
    ensureColumnIHeader(sheet);

    var action = payload.action || "update_script";
    var actionResult;

    if (action === "update_script") {
      actionResult = handleUpdateScript(sheet, payload);
    } else if (action === "update_description") {
      actionResult = handleUpdateDescription(sheet, payload);
    } else {
      actionResult = handleBatchUpdate(sheet, payload);
    }

    // Flush pending changes to ensure immediate persistence
    SpreadsheetApp.flush();
    Utilities.sleep(250);

    return createJsonResponse(actionResult);

  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString(), stack: err.stack }, 500);
  }
}

/**
 * Resolves the sheet tab by gid, tab/sheet name, or active/first sheet.
 */
function resolveSheetTab(ss, params1, params2) {
  var p = params1 || {};
  var p2 = params2 || {};
  var targetGid = p.gid || p2.gid;
  var tabName = p.sheet || p.tab || p2.sheet || p2.tab;

  // Search by GID first if present
  if (targetGid !== undefined && targetGid !== null && String(targetGid).trim() !== "") {
    var allSheets = ss.getSheets();
    for (var s = 0; s < allSheets.length; s++) {
      if (String(allSheets[s].getSheetId()) === String(targetGid).trim()) {
        return allSheets[s];
      }
    }
  }

  // Search by Tab Name
  if (tabName && String(tabName).trim()) {
    var namedSheet = ss.getSheetByName(String(tabName).trim());
    if (namedSheet) return namedSheet;
  }

  // Fallback to active or first sheet
  return ss.getActiveSheet() || ss.getSheets()[0];
}

/**
 * Updates Column D (SCRIPT_CHANGED), Column E (script_ready), and Column F (script_date)
 * in place for a single row identified by ID.
 */
function handleUpdateScript(sheet, payload) {
  var targetId = String(payload.script_id || payload.ID || payload.id || "").trim();
  if (!targetId) {
    return { status: "error", message: "Missing target ID in request payload" };
  }

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {
    return { status: "error", message: "Sheet contains no data rows" };
  }

  var headers = data[0].map(function(h) { return String(h || "").trim(); });
  var colMap = resolveColumnIndexes(headers);

  var targetIdUpper = targetId.toUpperCase();
  var rowIndex = -1;

  for (var r = 1; r < data.length; r++) {
    var cellId = String(data[r][colMap.id] || "").trim().toUpperCase();
    if (cellId === targetIdUpper) {
      rowIndex = r + 1; // 1-based index in Google Sheets
      break;
    }
  }

  if (rowIndex === -1) {
    return { status: "error", message: "ID '" + targetId + "' not found in sheet: " + sheet.getName() };
  }

  var updatedFields = [];

  // 1. Update Column D: SCRIPT_CHANGED
  if (payload.SCRIPT_CHANGED !== undefined || payload.script_changed !== undefined || payload.new_script !== undefined) {
    var newScript = String(
      payload.SCRIPT_CHANGED !== undefined ? payload.SCRIPT_CHANGED :
      (payload.script_changed !== undefined ? payload.script_changed : payload.new_script)
    );
    sheet.getRange(rowIndex, colMap.script_changed + 1).setValue(newScript);
    updatedFields.push("SCRIPT_CHANGED");
  }

  // 2. Update Column E: script_ready (Boolean Checkbox)
  if (payload.script_ready !== undefined) {
    var isReady = Boolean(
      payload.script_ready === true ||
      payload.script_ready === "true" ||
      payload.script_ready === 1 ||
      payload.script_ready === "1"
    );
    sheet.getRange(rowIndex, colMap.script_ready + 1).setValue(isReady);
    updatedFields.push("script_ready");
  }

  // 3. Update Column F: script_date
  if (payload.script_date !== undefined) {
    var scriptDate = String(payload.script_date || "").trim();
    sheet.getRange(rowIndex, colMap.script_date + 1).setValue(scriptDate);
    updatedFields.push("script_date");
  }

  return {
    status: "success",
    message: "Row " + rowIndex + " updated successfully for ID " + targetId,
    id: targetId,
    sheet_name: sheet.getName(),
    row_number: rowIndex,
    updated_fields: updatedFields
  };
}

/**
 * Updates Column I (short_description) in place for a single row identified by ID.
 */
function handleUpdateDescription(sheet, payload) {
  var targetId = String(payload.script_id || payload.ID || payload.id || "").trim();
  if (!targetId) {
    return { status: "error", message: "Missing target ID in request payload" };
  }

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {
    return { status: "error", message: "Sheet contains no data rows" };
  }

  var headers = data[0].map(function(h) { return String(h || "").trim(); });
  var colMap = resolveColumnIndexes(headers);

  var targetIdUpper = targetId.toUpperCase();
  var rowIndex = -1;

  for (var r = 1; r < data.length; r++) {
    var cellId = String(data[r][colMap.id] || "").trim().toUpperCase();
    if (cellId === targetIdUpper) {
      rowIndex = r + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    return { status: "error", message: "ID '" + targetId + "' not found in sheet: " + sheet.getName() };
  }

  var description = String(
    payload.short_description !== undefined ? payload.short_description :
    (payload.description !== undefined ? payload.description : "")
  ).trim();

  sheet.getRange(rowIndex, colMap.short_description + 1).setValue(description);

  return {
    status: "success",
    message: "Description updated successfully for ID " + targetId,
    id: targetId,
    sheet_name: sheet.getName(),
    row_number: rowIndex,
    short_description: description
  };
}

/**
 * Bulk row update handler for backward compatibility.
 */
function handleBatchUpdate(sheet, payload) {
  var rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (rows.length === 0) {
    return { status: "success", message: "No rows provided", count: 0 };
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h || "").trim(); });
  var colMap = resolveColumnIndexes(headers);

  var idToRowMap = {};
  for (var r = 1; r < data.length; r++) {
    var idVal = String(data[r][colMap.id] || "").trim().toUpperCase();
    if (idVal) idToRowMap[idVal] = r + 1;
  }

  var updatedCount = 0;
  for (var i = 0; i < rows.length; i++) {
    var item = rows[i];
    var rowId = String(item.ID || item.id || "").trim().toUpperCase();
    if (!rowId || !idToRowMap[rowId]) continue;

    var targetRow = idToRowMap[rowId];
    if (item.SCRIPT_CHANGED !== undefined) sheet.getRange(targetRow, colMap.script_changed + 1).setValue(item.SCRIPT_CHANGED);
    if (item.script_ready !== undefined) sheet.getRange(targetRow, colMap.script_ready + 1).setValue(Boolean(item.script_ready));
    if (item.script_date !== undefined) sheet.getRange(targetRow, colMap.script_date + 1).setValue(String(item.script_date));
    if (item.short_description !== undefined) sheet.getRange(targetRow, colMap.short_description + 1).setValue(String(item.short_description));
    updatedCount++;
  }

  return { status: "success", updated_count: updatedCount, total: rows.length };
}

/**
 * Resolves column indexes from header row or falls back to column letters A through I.
 */
function resolveColumnIndexes(headers) {
  var map = {
    id: 0,                  // Col A (0)
    expression: 1,          // Col B (1)
    script: 2,              // Col C (2)
    script_changed: 3,      // Col D (3)
    script_ready: 4,        // Col E (4)
    script_date: 5,         // Col F (5)
    video_ready: 6,         // Col G (6)
    video_date: 7,          // Col H (7)
    short_description: 8    // Col I (8)
  };

  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toUpperCase().replace(/[\s_-]+/g, "_");
    if (h === "ID") map.id = i;
    else if (h === "EXPRESSION" || h === "TOPIC" || h === "SUBJECT") map.expression = i;
    else if (h === "SCRIPT") map.script = i;
    else if (h === "SCRIPT_CHANGED" || h === "NEW_SCRIPT" || h === "CORRECTED_SCRIPT") map.script_changed = i;
    else if (h === "SCRIPT_READY" || h === "READY_SCRIPT") map.script_ready = i;
    else if (h === "SCRIPT_DATE") map.script_date = i;
    else if (h === "VIDEO_READY" || h === "READY_VIDEO") map.video_ready = i;
    else if (h === "VIDEO_DATE") map.video_date = i;
    else if (h === "SHORT_DESCRIPTION" || h === "DESCRIPTION" || h === "SEO_DESCRIPTION") map.short_description = i;
  }

  return map;
}

/**
 * Ensures Column I exists and has header "short_description".
 */
function ensureColumnIHeader(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 9);
  var headerRange = sheet.getRange(1, 1, 1, lastCol);
  var headers = headerRange.getValues()[0];

  if (!headers[8] || String(headers[8]).trim() === "") {
    sheet.getRange(1, 9).setValue("short_description");
  }
}

/**
 * Formats a Date object or cell value into DD/MM/YY string (e.g. "31/01/26").
 */
function formatCellDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    var day = ("0" + val.getDate()).slice(-2);
    var month = ("0" + (val.getMonth() + 1)).slice(-2);
    var year = String(val.getFullYear()).slice(-2);
    return day + "/" + month + "/" + year;
  }
  var s = String(val).trim();
  var match = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (match) {
    var d = ("0" + match[1]).slice(-2);
    var m = ("0" + match[2]).slice(-2);
    var y = match[3].slice(-2);
    return d + "/" + m + "/" + y;
  }
  return s;
}

function createJsonResponse(dataObject, statusCode) {
  var code = statusCode || 200;
  var output = ContentService.createTextOutput(JSON.stringify(dataObject, null, 2));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

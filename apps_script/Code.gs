/**
 * ==============================================================================
 * Google Apps Script: Enhanced Web App Endpoint for GoogleSheet_UI_auditor
 * ==============================================================================
 * 
 * Capabilities:
 * 1. doGet: Reads columns A through I (?id=<SPREADSHEET_ID>&sheet=<TAB_NAME>)
 *    - Automatically detects columns: ID, expression, script, SCRIPT_CHANGED,
 *      script_ready, script_date, video_ready, video_date, and short_description (Column I).
 *    - Guarantees Column I ("short_description") is present and mapped.
 *    - Formats dates as DD/MM/YY (e.g. "31/01/26") or ISO format.
 * 
 * 2. doPost: High-precision in-place updates by ID:
 *    - action: "update_script": Updates Column D (SCRIPT_CHANGED), Column E (script_ready),
 *      and Column F (script_date) for the matching ID in place.
 *    - action: "update_description": Updates Column I (short_description) for the matching ID in place.
 *    - action: "batch_update": Standard bulk update supporting rows array.
 * 
 * Setup Instructions:
 * 1. Open your Google Sheet(s).
 * 2. Click: Extensions > Apps Script.
 * 3. Replace all code in Code.gs with this entire file.
 * 4. Click 'Save' (💾).
 * 5. Click 'Deploy' > 'Manage deployments' > Click pencil (Edit) > 'Version' > 'New version'.
 * 6. Click 'Deploy' (Execute as: 'Me', Who has access: 'Anyone').
 * ==============================================================================
 */

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};

    // 1. Resolve spreadsheet by ID or fallback to active spreadsheet
    const targetId = params.id || params.spreadsheet_id || params.sheet_id;
    let ss;
    if (targetId && String(targetId).trim()) {
      ss = SpreadsheetApp.openById(String(targetId).trim());
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    if (!ss) {
      return createJsonResponse({ status: "error", message: "Spreadsheet not found" }, 404);
    }

    // 2. Resolve sheet tab
    const tabName = params.sheet || params.tab;
    let sheet;
    if (tabName && String(tabName).trim()) {
      sheet = ss.getSheetByName(String(tabName).trim());
      if (!sheet) {
        return createJsonResponse({
          status: "error",
          message: "Sheet tab '" + tabName + "' not found in spreadsheet: " + ss.getName()
        }, 404);
      }
    } else {
      sheet = ss.getActiveSheet() || ss.getSheets()[0];
    }

    // 3. Ensure Column I header exists
    ensureColumnIHeader(sheet);

    // 4. Read sheet data
    const dataRange = sheet.getDataRange();
    const data = dataRange.getValues();
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
    const rawHeaders = data[0];
    const headers = rawHeaders.map(function(h) { return String(h || "").trim(); });

    // Locate target columns case-insensitively
    var colMap = resolveColumnIndexes(headers);

    // 6. Map rows to structured JSON records
    var records = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var idVal = String(row[colMap.id] || "").trim();
      if (!idVal) continue; // Skip blank rows

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

    // 2. Resolve sheet tab
    var tabName = payload.tab || payload.sheet || (e && e.parameter ? (e.parameter.sheet || e.parameter.tab) : null);
    var sheet;
    if (tabName && String(tabName).trim()) {
      sheet = ss.getSheetByName(String(tabName).trim());
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet tab '" + tabName + "' not found" }, 404);
      }
    } else {
      sheet = ss.getActiveSheet() || ss.getSheets()[0];
    }

    // Ensure Column I header exists
    ensureColumnIHeader(sheet);

    var action = payload.action || "update_script";
    var actionResult;

    if (action === "update_script") {
      actionResult = handleUpdateScript(sheet, payload);
    } else if (action === "update_description") {
      actionResult = handleUpdateDescription(sheet, payload);
    } else {
      // General batch row update/append
      actionResult = handleBatchUpdate(sheet, payload);
    }

    // Flush pending writes
    SpreadsheetApp.flush();
    Utilities.sleep(200);

    return createJsonResponse(actionResult);

  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString(), stack: err.stack }, 500);
  }
}

/**
 * Updates Column D (SCRIPT_CHANGED), Column E (script_ready), and Column F (script_date)
 * for a single row identified by ID.
 */
function handleUpdateScript(sheet, payload) {
  var targetId = String(payload.script_id || payload.ID || payload.id || "").trim();
  if (!targetId) {
    return { status: "error", message: "Missing target ID" };
  }

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {
    return { status: "error", message: "Sheet has no data rows" };
  }

  var headers = data[0].map(function(h) { return String(h || "").trim(); });
  var colMap = resolveColumnIndexes(headers);

  var rowIndex = -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][colMap.id] || "").trim() === targetId) {
      rowIndex = r + 1; // 1-based row in sheet
      break;
    }
  }

  if (rowIndex === -1) {
    return { status: "error", message: "ID '" + targetId + "' not found in sheet" };
  }

  // Update Column D (SCRIPT_CHANGED)
  if (payload.SCRIPT_CHANGED !== undefined || payload.script_changed !== undefined || payload.new_script !== undefined) {
    var newScript = String(payload.SCRIPT_CHANGED !== undefined ? payload.SCRIPT_CHANGED : (payload.script_changed !== undefined ? payload.script_changed : payload.new_script));
    sheet.getRange(rowIndex, colMap.script_changed + 1).setValue(newScript);
  }

  // Update Column E (script_ready)
  if (payload.script_ready !== undefined) {
    var isReady = Boolean(payload.script_ready === true || payload.script_ready === "true" || payload.script_ready === 1 || payload.script_ready === "1");
    sheet.getRange(rowIndex, colMap.script_ready + 1).setValue(isReady);
  }

  // Update Column F (script_date)
  if (payload.script_date !== undefined) {
    var scriptDate = String(payload.script_date || "").trim();
    sheet.getRange(rowIndex, colMap.script_date + 1).setValue(scriptDate);
  }

  return {
    status: "success",
    message: "Script updated successfully for ID " + targetId,
    id: targetId,
    row_number: rowIndex
  };
}

/**
 * Updates Column I (short_description) for a single row identified by ID.
 */
function handleUpdateDescription(sheet, payload) {
  var targetId = String(payload.script_id || payload.ID || payload.id || "").trim();
  if (!targetId) {
    return { status: "error", message: "Missing target ID" };
  }

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {
    return { status: "error", message: "Sheet has no data rows" };
  }

  var headers = data[0].map(function(h) { return String(h || "").trim(); });
  var colMap = resolveColumnIndexes(headers);

  var rowIndex = -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][colMap.id] || "").trim() === targetId) {
      rowIndex = r + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    return { status: "error", message: "ID '" + targetId + "' not found in sheet" };
  }

  var description = String(payload.short_description !== undefined ? payload.short_description : (payload.description || "")).trim();
  sheet.getRange(rowIndex, colMap.short_description + 1).setValue(description);

  return {
    status: "success",
    message: "Description updated successfully for ID " + targetId,
    id: targetId,
    row_number: rowIndex,
    short_description: description
  };
}

/**
 * Legacy/Bulk batch updater for backward compatibility.
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
    var idVal = String(data[r][colMap.id] || "").trim();
    if (idVal) idToRowMap[idVal] = r + 1;
  }

  var updatedCount = 0;
  for (var i = 0; i < rows.length; i++) {
    var item = rows[i];
    var rowId = String(item.ID || item.id || "").trim();
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

  // If Column I (col 9) has no header, set it to "short_description"
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
  // If already in DD/MM/YY or DD/MM/YYYY, normalize to DD/MM/YY
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

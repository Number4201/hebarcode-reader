package com.hebarcode.reader

import android.app.Activity
import android.content.Context
import android.content.ContentValues
import android.content.Intent
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class HebarcodeStorageModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    private const val PREFS_NAME = "hebarcode_app_state"
    private const val KEY_ARCHIVE_JSON = "archive_json"
    private const val KEY_ACTIVE_EXPEDITION_JSON = "active_expedition_json"
    private const val KEY_SETTINGS_JSON = "settings_json"
    private const val EXPORT_FOLDER = "Download/Hebarcode"
    private const val IMPORT_CONFIG_REQUEST_CODE = 42061
    private const val MAX_IMPORT_CONFIG_CHARS = 128 * 1024
  }

  private var importConfigPromise: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "HebarcodeStorage"

  @ReactMethod
  fun loadAppState(promise: Promise) {
    val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val snapshot =
      Arguments.createMap().apply {
        putString("archiveJson", prefs.getString(KEY_ARCHIVE_JSON, "[]"))
        putString("activeExpeditionJson", prefs.getString(KEY_ACTIVE_EXPEDITION_JSON, null))
        putString("settingsJson", prefs.getString(KEY_SETTINGS_JSON, null))
      }

    promise.resolve(snapshot)
  }

  @ReactMethod
  fun saveAppState(
    archiveJson: String,
    activeExpeditionJson: String?,
    settingsJson: String,
    promise: Promise,
  ) {
    val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs
      .edit()
      .putString(KEY_ARCHIVE_JSON, archiveJson)
      .putString(KEY_ACTIVE_EXPEDITION_JSON, activeExpeditionJson)
      .putString(KEY_SETTINGS_JSON, settingsJson)
      .apply()

    promise.resolve(null)
  }

  @ReactMethod
  fun exportXml(fileName: String, xmlContent: String, promise: Promise) {
    try {
      val safeFileName = sanitizeXmlFileName(fileName)
      val result =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          exportToMediaStore(safeFileName, xmlContent)
        } else {
          exportToAppDocuments(safeFileName, xmlContent)
        }

      promise.resolve(result)
    } catch (error: Throwable) {
      promise.reject("E_XML_EXPORT", error.message, error)
    }
  }

  @ReactMethod
  fun importXmlLayoutConfig(promise: Promise) {
    val activity = reactApplicationContext.currentActivity

    if (activity == null) {
      promise.reject("E_IMPORT_NO_ACTIVITY", "Current activity is not available")
      return
    }

    if (importConfigPromise != null) {
      promise.reject("E_IMPORT_IN_PROGRESS", "Another import is already in progress")
      return
    }

    importConfigPromise = promise

    try {
      val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
          putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain", "application/octet-stream"))
        }

      activity.startActivityForResult(intent, IMPORT_CONFIG_REQUEST_CODE)
    } catch (error: Throwable) {
      importConfigPromise = null
      promise.reject("E_IMPORT_OPEN", error.message, error)
    }
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != IMPORT_CONFIG_REQUEST_CODE) {
      return
    }

    val promise = importConfigPromise
    importConfigPromise = null

    if (promise == null) {
      return
    }

    if (resultCode != Activity.RESULT_OK) {
      promise.reject("E_IMPORT_CANCELLED", "File import was cancelled")
      return
    }

    val uri = data?.data

    if (uri == null) {
      promise.reject("E_IMPORT_URI", "Selected file URI is missing")
      return
    }

    try {
      reactApplicationContext.contentResolver.takePersistableUriPermission(
        uri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION,
      )
    } catch (_: Throwable) {
      // Best effort only.
    }

    try {
      val content = readImportConfigContent(uri)

      val result =
        Arguments.createMap().apply {
          putString("fileName", resolveDisplayName(uri))
          putString("uri", uri.toString())
          putString("content", content)
        }

      promise.resolve(result)
    } catch (error: Throwable) {
      promise.reject("E_IMPORT_READ", error.message, error)
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  private fun sanitizeXmlFileName(fileName: String): String {
    val trimmed = fileName.substringAfterLast('/').substringAfterLast('\\').trim()
    val baseName =
      trimmed
        .ifBlank { "expedice.xml" }
        .replace(Regex("[^A-Za-z0-9._-]+"), "_")
        .trim('_', '.')
        .ifBlank { "expedice.xml" }
        .take(96)

    return if (baseName.endsWith(".xml", ignoreCase = true)) baseName else "$baseName.xml"
  }

  private fun readImportConfigContent(uri: android.net.Uri): String {
    reactApplicationContext.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
      val length = descriptor.length
      if (length > MAX_IMPORT_CONFIG_CHARS) {
        throw IllegalStateException("Selected config is larger than ${MAX_IMPORT_CONFIG_CHARS / 1024} KB")
      }
    }

    return reactApplicationContext.contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use {
      val buffer = CharArray(4096)
      val builder = StringBuilder()

      while (true) {
        val count = it.read(buffer)
        if (count == -1) {
          break
        }

        builder.append(buffer, 0, count)

        if (builder.length > MAX_IMPORT_CONFIG_CHARS) {
          throw IllegalStateException("Selected config is larger than ${MAX_IMPORT_CONFIG_CHARS / 1024} KB")
        }
      }

      builder.toString()
    } ?: throw IllegalStateException("Unable to read selected file")
  }

  private fun exportToMediaStore(fileName: String, xmlContent: String) =
    Arguments.createMap().apply {
      val resolver = reactApplicationContext.contentResolver
      val values =
        ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, fileName)
          put(MediaStore.Downloads.MIME_TYPE, "application/xml")
          put(MediaStore.Downloads.RELATIVE_PATH, EXPORT_FOLDER)
          put(MediaStore.Downloads.IS_PENDING, 1)
        }

      val uri =
        resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
          ?: throw IllegalStateException("Unable to create MediaStore entry")

      resolver.openOutputStream(uri)?.use { stream ->
        stream.write(xmlContent.toByteArray(Charsets.UTF_8))
        stream.flush()
      } ?: throw IllegalStateException("Unable to open output stream")

      values.clear()
      values.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(uri, values, null, null)

      putString("fileName", fileName)
      putString("uri", uri.toString())
      putString("path", "$EXPORT_FOLDER/$fileName")
    }

  private fun exportToAppDocuments(fileName: String, xmlContent: String) =
    Arguments.createMap().apply {
      val baseDir =
        reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)
          ?: reactApplicationContext.filesDir
      val exportDir = File(baseDir, "exports").apply { mkdirs() }
      val targetFile = File(exportDir, fileName)

      targetFile.writeText(xmlContent, Charsets.UTF_8)

      putString("fileName", fileName)
      putString("uri", targetFile.toURI().toString())
      putString("path", targetFile.absolutePath)
    }

  private fun resolveDisplayName(uri: android.net.Uri): String? {
    reactApplicationContext.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)
      ?.use { cursor ->
        if (cursor.moveToFirst()) {
          val index = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME)
          if (index >= 0) {
            return cursor.getString(index)
          }
        }
      }

    return uri.lastPathSegment
  }
}

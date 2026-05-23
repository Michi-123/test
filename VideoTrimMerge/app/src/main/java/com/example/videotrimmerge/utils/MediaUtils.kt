package com.example.videotrimmerge.utils

import android.content.ContentValues
import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

object MediaUtils {

    fun getVideoPath(context: Context, uri: Uri): String? {
        if (uri.scheme == "file") return uri.path

        val projection = arrayOf(MediaStore.Video.Media.DATA)
        runCatching {
            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val col = cursor.getColumnIndex(MediaStore.Video.Media.DATA)
                    if (col != -1) return cursor.getString(col)
                }
            }
        }
        return null
    }

    fun copyUriToCache(context: Context, uri: Uri, suffix: String = ".mp4"): File {
        val file = File(context.cacheDir, "input_${System.currentTimeMillis()}$suffix")
        context.contentResolver.openInputStream(uri)?.use { input ->
            file.outputStream().use { input.copyTo(it) }
        }
        return file
    }

    fun getVideoDuration(context: Context, uri: Uri): Long {
        val projection = arrayOf(MediaStore.Video.Media.DURATION)
        runCatching {
            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val col = cursor.getColumnIndex(MediaStore.Video.Media.DURATION)
                    if (col != -1) {
                        val d = cursor.getLong(col)
                        if (d > 0) return d
                    }
                }
            }
        }
        return MediaMetadataRetriever().use { r ->
            r.setDataSource(context, uri)
            r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        }
    }

    fun formatDuration(ms: Long): String {
        val total = ms / 1000
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) "%02d:%02d:%02d".format(h, m, s)
        else "%02d:%02d".format(m, s)
    }

    fun saveVideoToGallery(context: Context, sourceFile: File): Uri? {
        val fileName = "TrimMerge_${System.currentTimeMillis()}.mp4"
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.DATE_ADDED, System.currentTimeMillis() / 1000)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Video.Media.IS_PENDING, 1)
                put(MediaStore.Video.Media.RELATIVE_PATH,
                    Environment.DIRECTORY_MOVIES + "/VideoTrimMerge")
            }
        }

        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values) ?: return null

        resolver.openOutputStream(uri)?.use { out ->
            sourceFile.inputStream().use { it.copyTo(out) }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.clear()
            values.put(MediaStore.Video.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        }
        return uri
    }
}

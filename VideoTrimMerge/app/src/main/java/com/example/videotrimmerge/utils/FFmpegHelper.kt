package com.example.videotrimmerge.utils

import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.ReturnCode
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import kotlin.coroutines.resume

object FFmpegHelper {

    suspend fun trimVideo(
        inputPath: String,
        outputPath: String,
        startMs: Long,
        endMs: Long,
        onProgress: ((Int) -> Unit)? = null
    ): Boolean = suspendCancellableCoroutine { cont ->
        val startSec = startMs / 1000.0
        val durSec = (endMs - startMs) / 1000.0
        val totalMs = (endMs - startMs).toFloat()

        // -ss before -i for fast seek; re-encode for frame accuracy
        val cmd = "-y -ss $startSec -i \"$inputPath\" -t $durSec " +
                "-c:v libx264 -preset ultrafast -crf 23 " +
                "-c:a aac -b:a 128k \"$outputPath\""

        val session = FFmpegKit.executeAsync(cmd, { session ->
            if (cont.isActive) cont.resume(ReturnCode.isSuccess(session.returnCode))
        }, null, { stats ->
            if (totalMs > 0 && onProgress != null) {
                val pct = ((stats.time / totalMs) * 100).toInt().coerceIn(0, 100)
                onProgress(pct)
            }
        })

        cont.invokeOnCancellation { FFmpegKit.cancel(session.sessionId) }
    }

    suspend fun mergeVideos(
        inputPaths: List<String>,
        outputPath: String,
        onProgress: ((Int) -> Unit)? = null
    ): Boolean = suspendCancellableCoroutine { cont ->
        if (inputPaths.isEmpty()) { cont.resume(false); return@suspendCancellableCoroutine }

        if (inputPaths.size == 1) {
            val ok = runCatching {
                File(inputPaths[0]).copyTo(File(outputPath), overwrite = true)
            }.isSuccess
            cont.resume(ok)
            return@suspendCancellableCoroutine
        }

        val concatFile = File(File(outputPath).parent ?: ".", "concat_${System.currentTimeMillis()}.txt")
        concatFile.writeText(inputPaths.joinToString("\n") { "file '${it}'" })

        val cmd = "-y -f concat -safe 0 -i \"${concatFile.absolutePath}\" -c copy \"$outputPath\""

        val session = FFmpegKit.executeAsync(cmd, { session ->
            concatFile.delete()
            if (cont.isActive) cont.resume(ReturnCode.isSuccess(session.returnCode))
        })

        cont.invokeOnCancellation {
            FFmpegKit.cancel(session.sessionId)
            concatFile.delete()
        }
    }
}

package com.example.videotrimmerge.model

import android.net.Uri

data class VideoItem(
    val uri: Uri,
    val displayName: String,
    val durationMs: Long,
    var trimStartMs: Long = 0L,
    var trimEndMs: Long = durationMs,
    val id: String = java.util.UUID.randomUUID().toString()
) {
    val trimDurationMs: Long get() = trimEndMs - trimStartMs
}

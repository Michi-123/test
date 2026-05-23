package com.example.videotrimmerge

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.videotrimmerge.databinding.ActivityMergeProgressBinding
import com.example.videotrimmerge.utils.FFmpegHelper
import com.example.videotrimmerge.utils.MediaUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class MergeProgressActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMergeProgressBinding
    private var processJob: Job? = null
    private var savedUri: Uri? = null
    private val tempFiles = mutableListOf<File>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMergeProgressBinding.inflate(layoutInflater)
        setContentView(binding.root)
        supportActionBar?.title = "処理中"

        binding.btnCancel.setOnClickListener {
            if (processJob?.isActive == true) showCancelDialog()
            else finish()
        }
        binding.btnOpenVideo.setOnClickListener {
            savedUri?.let { uri ->
                startActivity(Intent.createChooser(
                    Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "video/mp4")
                        flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
                    }, "動画を再生"
                ))
            }
        }
        binding.btnShare.setOnClickListener {
            savedUri?.let { uri ->
                startActivity(Intent.createChooser(
                    Intent(Intent.ACTION_SEND).apply {
                        type = "video/mp4"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
                    }, "動画を共有"
                ))
            }
        }

        startProcessing()
    }

    private fun startProcessing() {
        val uris = intent.getStringArrayListExtra("video_uris") ?: run {
            showError("入力データが不正です"); return
        }
        val starts = intent.getLongArrayExtra("trim_starts") ?: LongArray(uris.size) { 0L }
        val ends = intent.getLongArrayExtra("trim_ends") ?: run {
            showError("トリム情報が不正です"); return
        }

        processJob = lifecycleScope.launch {
            processVideos(uris, starts, ends)
        }
    }

    private suspend fun processVideos(uris: List<String>, starts: LongArray, ends: LongArray) {
        try {
            // Step 1: Trim each video
            uris.forEachIndexed { i, uriStr ->
                val uri = Uri.parse(uriStr)
                setStatus("トリム中... (${i + 1}/${uris.size})", (i * 80 / uris.size))

                val startMs = starts.getOrElse(i) { 0L }
                val endMs = ends.getOrElse(i) { MediaUtils.getVideoDuration(this@MergeProgressActivity, uri) }
                val durMs = MediaUtils.getVideoDuration(this@MergeProgressActivity, uri)

                val outFile = File(cacheDir, "trim_${i}_${System.currentTimeMillis()}.mp4")
                tempFiles.add(outFile)

                val noTrim = startMs == 0L && endMs >= durMs
                if (noTrim) {
                    // No trimming needed - copy directly
                    withContext(Dispatchers.IO) {
                        contentResolver.openInputStream(uri)?.use { src ->
                            outFile.outputStream().use { src.copyTo(it) }
                        }
                    }
                } else {
                    val inputPath = withContext(Dispatchers.IO) {
                        MediaUtils.getVideoPath(this@MergeProgressActivity, uri)
                            ?: MediaUtils.copyUriToCache(this@MergeProgressActivity, uri).also {
                                tempFiles.add(it)
                            }.absolutePath
                    }
                    val ok = withContext(Dispatchers.IO) {
                        FFmpegHelper.trimVideo(
                            inputPath = inputPath,
                            outputPath = outFile.absolutePath,
                            startMs = startMs,
                            endMs = endMs,
                            onProgress = { pct ->
                                val overall = (i * 80 / uris.size) + (pct * 80 / uris.size / 100)
                                lifecycleScope.launch { setStatus("トリム中... (${i + 1}/${uris.size})", overall) }
                            }
                        )
                    }
                    if (!ok) { showError("トリム失敗 (${i + 1}番目)"); cleanup(); return }
                }
            }

            // Step 2: Merge
            setStatus("結合中...", 85)
            binding.progressBar.isIndeterminate = true
            val outputFile = File(cacheDir, "output_${System.currentTimeMillis()}.mp4")
            val mergeOk = withContext(Dispatchers.IO) {
                FFmpegHelper.mergeVideos(
                    inputPaths = tempFiles.filter { it.name.startsWith("trim_") }.map { it.absolutePath },
                    outputPath = outputFile.absolutePath
                )
            }
            if (!mergeOk) { showError("結合に失敗しました"); cleanup(); return }

            // Step 3: Save to gallery
            binding.progressBar.isIndeterminate = false
            setStatus("ギャラリーに保存中...", 95)
            val uri = withContext(Dispatchers.IO) {
                MediaUtils.saveVideoToGallery(this@MergeProgressActivity, outputFile).also {
                    outputFile.delete()
                }
            }
            cleanup()

            if (uri == null) { showError("保存に失敗しました"); return }

            savedUri = uri
            withContext(Dispatchers.Main) {
                binding.progressBar.progress = 100
                binding.tvStatus.text = "完了！ギャラリーに保存されました"
                binding.tvProgress.text = "100%"
                binding.layoutSuccess.visibility = View.VISIBLE
                binding.btnCancel.text = "閉じる"
            }

        } catch (e: Exception) {
            cleanup()
            showError(e.message ?: "不明なエラー")
        }
    }

    private fun cleanup() {
        tempFiles.forEach { it.delete() }
        tempFiles.clear()
    }

    private suspend fun setStatus(msg: String, progress: Int) {
        withContext(Dispatchers.Main) {
            binding.tvStatus.text = msg
            binding.progressBar.progress = progress
            binding.tvProgress.text = "$progress%"
        }
    }

    private fun showError(msg: String) {
        lifecycleScope.launch(Dispatchers.Main) {
            binding.tvStatus.text = "エラー: $msg"
            binding.btnCancel.text = "閉じる"
        }
    }

    private fun showCancelDialog() {
        AlertDialog.Builder(this)
            .setTitle("処理をキャンセル")
            .setMessage("処理中です。キャンセルしますか？")
            .setPositiveButton("キャンセルする") { _, _ ->
                processJob?.cancel()
                cleanup()
                finish()
            }
            .setNegativeButton("続行する", null)
            .show()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (processJob?.isActive == true) showCancelDialog()
        else super.onBackPressed()
    }
}

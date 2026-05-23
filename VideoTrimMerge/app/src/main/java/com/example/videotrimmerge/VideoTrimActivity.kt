package com.example.videotrimmerge

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.example.videotrimmerge.databinding.ActivityVideoTrimBinding
import com.example.videotrimmerge.utils.MediaUtils

class VideoTrimActivity : AppCompatActivity() {

    private lateinit var binding: ActivityVideoTrimBinding
    private var player: ExoPlayer? = null
    private val handler = Handler(Looper.getMainLooper())

    private lateinit var videoUri: Uri
    private lateinit var videoId: String
    private var durationMs: Long = 0
    private var trimStartMs: Long = 0
    private var trimEndMs: Long = 0

    private val positionUpdater = object : Runnable {
        override fun run() {
            player?.let { p ->
                val pos = p.currentPosition
                if (p.isPlaying && pos >= trimEndMs) {
                    p.seekTo(trimStartMs)
                    p.pause()
                    updatePlayPauseIcon(false)
                }
                binding.trimBar.setPosition(pos)
                binding.tvCurrentTime.text = MediaUtils.formatDuration(pos)
            }
            handler.postDelayed(this, 50)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityVideoTrimBinding.inflate(layoutInflater)
        setContentView(binding.root)
        supportActionBar?.apply {
            setDisplayHomeAsUpEnabled(true)
            title = "動画をトリム"
        }

        videoUri = Uri.parse(intent.getStringExtra("video_uri") ?: run { finish(); return })
        videoId = intent.getStringExtra("video_id") ?: run { finish(); return }
        durationMs = intent.getLongExtra("duration_ms", 0L)
        trimStartMs = intent.getLongExtra("trim_start_ms", 0L)
        trimEndMs = intent.getLongExtra("trim_end_ms", durationMs)

        binding.tvVideoName.text = intent.getStringExtra("video_name") ?: ""

        setupPlayer()
        setupTrimBar()
        setupButtons()
    }

    private fun setupPlayer() {
        player = ExoPlayer.Builder(this).build().also { p ->
            binding.playerView.player = p
            p.setMediaItem(MediaItem.fromUri(videoUri))
            p.repeatMode = Player.REPEAT_MODE_OFF
            p.prepare()
            p.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY && p.currentPosition < trimStartMs) {
                        p.seekTo(trimStartMs)
                    }
                }
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    updatePlayPauseIcon(isPlaying)
                }
            })
        }
        handler.post(positionUpdater)
    }

    private fun setupTrimBar() {
        binding.trimBar.setDuration(durationMs)
        binding.trimBar.setRange(trimStartMs, trimEndMs)
        updateTimeLabels()

        binding.trimBar.onRangeChanged = { start, end ->
            trimStartMs = start
            trimEndMs = end
            updateTimeLabels()
            player?.seekTo(start)
        }
    }

    private fun updateTimeLabels() {
        binding.tvStartTime.text = MediaUtils.formatDuration(trimStartMs)
        binding.tvEndTime.text = MediaUtils.formatDuration(trimEndMs)
        binding.tvTrimDuration.text = "長さ: ${MediaUtils.formatDuration(trimEndMs - trimStartMs)}"
    }

    private fun setupButtons() {
        binding.btnPlayPause.setOnClickListener {
            player?.let { p ->
                if (p.isPlaying) {
                    p.pause()
                } else {
                    if (p.currentPosition < trimStartMs || p.currentPosition >= trimEndMs) {
                        p.seekTo(trimStartMs)
                    }
                    p.play()
                }
            }
        }

        binding.btnSave.setOnClickListener {
            setResult(Activity.RESULT_OK, Intent().apply {
                putExtra("video_id", videoId)
                putExtra("trim_start_ms", trimStartMs)
                putExtra("trim_end_ms", trimEndMs)
            })
            finish()
        }

        binding.btnCancel.setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }
    }

    private fun updatePlayPauseIcon(playing: Boolean) {
        binding.btnPlayPause.setImageResource(
            if (playing) android.R.drawable.ic_media_pause
            else android.R.drawable.ic_media_play
        )
    }

    override fun onSupportNavigateUp(): Boolean {
        setResult(Activity.RESULT_CANCELED)
        finish()
        return true
    }

    override fun onPause() {
        super.onPause()
        player?.pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(positionUpdater)
        player?.release()
        player = null
    }
}

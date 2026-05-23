package com.example.videotrimmerge

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.videotrimmerge.adapter.VideoListAdapter
import com.example.videotrimmerge.databinding.ActivityMainBinding
import com.example.videotrimmerge.model.VideoItem
import com.example.videotrimmerge.utils.MediaUtils

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var adapter: VideoListAdapter
    private var pendingTrimPosition = -1

    private val pickVideo = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        uris.forEach { addVideo(it) }
        updateFooter()
    }

    private val trimResult = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && pendingTrimPosition >= 0) {
            val id = result.data?.getStringExtra("video_id") ?: return@registerForActivityResult
            val start = result.data?.getLongExtra("trim_start_ms", 0L) ?: 0L
            val end = result.data?.getLongExtra("trim_end_ms", 0L) ?: return@registerForActivityResult
            val items = adapter.getItems().toMutableList()
            items.find { it.id == id }?.let {
                it.trimStartMs = start
                it.trimEndMs = end
                adapter.setItems(items)
                updateFooter()
            }
        }
        pendingTrimPosition = -1
    }

    private val requestPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        if (granted.values.all { it }) pickVideo.launch("video/*")
        else Toast.makeText(this, "動画へのアクセス権限が必要です", Toast.LENGTH_LONG).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)

        adapter = VideoListAdapter(
            onTrimClick = { item, pos ->
                pendingTrimPosition = pos
                trimResult.launch(Intent(this, VideoTrimActivity::class.java).apply {
                    putExtra("video_uri", item.uri.toString())
                    putExtra("video_id", item.id)
                    putExtra("video_name", item.displayName)
                    putExtra("duration_ms", item.durationMs)
                    putExtra("trim_start_ms", item.trimStartMs)
                    putExtra("trim_end_ms", item.trimEndMs)
                })
            },
            onDeleteClick = { pos ->
                adapter.removeItem(pos)
                updateFooter()
            },
            onStartDrag = { vh -> itemTouchHelper.startDrag(vh) }
        )

        binding.recyclerView.layoutManager = LinearLayoutManager(this)
        binding.recyclerView.adapter = adapter
        itemTouchHelper.attachToRecyclerView(binding.recyclerView)

        binding.fabAddVideo.setOnClickListener { checkPermAndPick() }
        binding.btnMerge.setOnClickListener {
            val items = adapter.getItems()
            if (items.isEmpty()) {
                Toast.makeText(this, "動画を追加してください", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            startActivity(Intent(this, MergeProgressActivity::class.java).apply {
                putStringArrayListExtra("video_uris", ArrayList(items.map { it.uri.toString() }))
                putStringArrayListExtra("video_ids", ArrayList(items.map { it.id }))
                putExtra("trim_starts", LongArray(items.size) { items[it].trimStartMs })
                putExtra("trim_ends", LongArray(items.size) { items[it].trimEndMs })
            })
        }

        updateFooter()
    }

    private val itemTouchHelper = ItemTouchHelper(object : ItemTouchHelper.SimpleCallback(
        ItemTouchHelper.UP or ItemTouchHelper.DOWN, 0
    ) {
        override fun onMove(rv: RecyclerView, vh: RecyclerView.ViewHolder, target: RecyclerView.ViewHolder): Boolean {
            adapter.moveItem(vh.adapterPosition, target.adapterPosition)
            return true
        }
        override fun onSwiped(vh: RecyclerView.ViewHolder, dir: Int) {}
    })

    private fun checkPermAndPick() {
        val perms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            arrayOf(Manifest.permission.READ_MEDIA_VIDEO)
        else
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)

        if (perms.all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED })
            pickVideo.launch("video/*")
        else
            requestPermission.launch(perms)
    }

    private fun addVideo(uri: Uri) {
        val name = contentResolver.query(
            uri, arrayOf(android.provider.MediaStore.Video.Media.DISPLAY_NAME),
            null, null, null
        )?.use { c ->
            if (c.moveToFirst()) {
                val col = c.getColumnIndex(android.provider.MediaStore.Video.Media.DISPLAY_NAME)
                if (col != -1) c.getString(col) else null
            } else null
        } ?: uri.lastPathSegment ?: "video.mp4"

        val dur = MediaUtils.getVideoDuration(this, uri)
        if (dur <= 0) {
            Toast.makeText(this, "読み込めません: $name", Toast.LENGTH_SHORT).show()
            return
        }
        adapter.addItem(VideoItem(uri = uri, displayName = name, durationMs = dur))
    }

    private fun updateFooter() {
        val items = adapter.getItems()
        val empty = items.isEmpty()
        binding.tvEmptyHint.visibility = if (empty) android.view.View.VISIBLE else android.view.View.GONE
        binding.btnMerge.isEnabled = !empty
        binding.tvTotalDuration.text = if (empty) ""
        else "合計 ${MediaUtils.formatDuration(items.sumOf { it.trimDurationMs })}  (${items.size}本)"
    }
}

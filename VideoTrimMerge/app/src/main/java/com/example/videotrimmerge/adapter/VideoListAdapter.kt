package com.example.videotrimmerge.adapter

import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.transform.RoundedCornersTransformation
import com.example.videotrimmerge.databinding.ItemVideoBinding
import com.example.videotrimmerge.model.VideoItem
import com.example.videotrimmerge.utils.MediaUtils
import java.util.Collections

class VideoListAdapter(
    private val onTrimClick: (VideoItem, Int) -> Unit,
    private val onDeleteClick: (Int) -> Unit,
    private val onStartDrag: (RecyclerView.ViewHolder) -> Unit
) : RecyclerView.Adapter<VideoListAdapter.VH>() {

    private val items = mutableListOf<VideoItem>()

    fun setItems(list: List<VideoItem>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    fun getItems(): List<VideoItem> = items.toList()

    fun addItem(item: VideoItem) {
        items.add(item)
        notifyItemInserted(items.size - 1)
    }

    fun removeItem(position: Int) {
        items.removeAt(position)
        notifyItemRemoved(position)
        notifyItemRangeChanged(position, items.size)
    }

    fun moveItem(from: Int, to: Int) {
        Collections.swap(items, from, to)
        notifyItemMoved(from, to)
    }

    fun updateItem(position: Int) {
        notifyItemChanged(position)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemVideoBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) =
        holder.bind(items[position], position)

    override fun getItemCount() = items.size

    inner class VH(private val b: ItemVideoBinding) : RecyclerView.ViewHolder(b.root) {
        fun bind(item: VideoItem, pos: Int) {
            b.tvOrderNumber.text = "${pos + 1}"
            b.tvVideoName.text = item.displayName
            b.tvOriginalDuration.text = "元: ${MediaUtils.formatDuration(item.durationMs)}"

            val isTrimmed = item.trimStartMs != 0L || item.trimEndMs != item.durationMs
            if (isTrimmed) {
                b.tvTrimRange.text = "${MediaUtils.formatDuration(item.trimStartMs)} → " +
                        "${MediaUtils.formatDuration(item.trimEndMs)}  " +
                        "(${MediaUtils.formatDuration(item.trimDurationMs)})"
            } else {
                b.tvTrimRange.text = "トリムなし (全体)"
            }

            b.ivThumbnail.load(item.uri) {
                crossfade(true)
                transformations(RoundedCornersTransformation(8f))
                placeholder(android.R.drawable.ic_media_play)
            }

            b.btnTrim.setOnClickListener { onTrimClick(item, adapterPosition) }
            b.btnDelete.setOnClickListener { onDeleteClick(adapterPosition) }
            b.ivDragHandle.setOnTouchListener { _, event ->
                if (event.action == MotionEvent.ACTION_DOWN) onStartDrag(this)
                false
            }
        }
    }
}
